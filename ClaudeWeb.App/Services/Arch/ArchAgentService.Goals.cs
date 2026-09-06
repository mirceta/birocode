using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// Goal-scoped arch conversations (openspec arch-goal-conversations): the harness-bound
/// half — starting a goal (a new conversation that owns repos and tasks, a goal loop
/// armed on it), the tools, routing (which conversation an event wakes; the inbox for
/// events nobody owns), the board-side completion gate, the release on completion and
/// the summary posted to the Operator-facing conversation. The pure rules live in
/// <see cref="ArchGoalRouting"/> / <see cref="TaskLifecycle"/>, the state in
/// <see cref="ArchStateStore"/>.
/// </summary>
public partial class ArchAgentService
{
    public const string ActorGoal = ArchGoalRouting.ActorGoal;
    public const int DefaultGoalCap = 20;

    // Summaries of finished goals waiting for the default conversation's slot.
    private readonly ConcurrentQueue<(string ConvId, string GoalId, string Text)> _goalSummaries = new();
    // The board check that sent a goal conversation back to work, until its next send carries it.
    private readonly ConcurrentDictionary<string, string> _completionBlockers = new();

    // ---- state -----------------------------------------------------------------------------

    public bool LegacyBroadcast => _state.LegacyBroadcast;

    public void SetLegacyBroadcast(bool on)
    {
        _state.SetLegacyBroadcast(on);
        _logger.Info($"[ARCH] legacy broadcast {(on ? "ON: goal-less conversations wake on every managed repo event" : "off: only goal conversations are woken, by what they own")}");
    }

    public ArchStateStore.ArchGoal? GoalOf(string? convId) => _state.GoalOf(KeyOrDefault(convId));

    /// <summary>"busy: goal &lt;id&gt;" — this conversation runs a goal whose loop is armed.</summary>
    public bool IsBusy(string? convId)
    {
        var key = KeyOrDefault(convId);
        return ArchGoalRouting.IsBusy(_state.GoalOf(key), _loops.Get(key));
    }

    public IReadOnlyList<ArchStateStore.InboxEntry> Inbox(int take = 50) => _state.Inbox(take);
    public void ClearInbox() => _state.ClearInbox();

    /// <summary>The managed key of a board task's assignee (null when unassigned).</summary>
    private static string? AssigneeKey(TaskGraph.TaskGraphService.Node n) =>
        n.RepoId is null ? null : string.IsNullOrWhiteSpace(n.SourceId) || n.SourceId == CollectorService.SelfId ? n.RepoId : ArchStateStore.FleetKey(n.SourceId, n.RepoId);

    /// <summary>The handle of a managed key: "&lt;machine&gt;/&lt;handle&gt;" from the registry
    /// locally, from the peer's last describe remotely; the key itself when unknown.</summary>
    public string LabelOfKey(string key)
    {
        if (ArchStateStore.ParseFleetKey(key) is { } fk)
        {
            var src = _collector.ResolveSource(fk.SourceId);
            if (src is null) return key;
            var snap = _fleet.SnapshotNonBlocking(src.Id);
            var repo = snap.Repos.FirstOrDefault(r => r.RepoId == fk.RepoId);
            var handle = PeerHandles(snap).GetValueOrDefault(fk.RepoId, repo is null ? fk.RepoId : Handles.Slug(repo.Name));
            return Handles.AgentLabel(src.Label, handle);
        }
        var local = _repos.GetAll().FirstOrDefault(r => r.Id == key);
        return local is null ? key : Handles.AgentLabel(SelfLabel, local.Handle ?? local.Id);
    }

    /// <summary>A goal as the API, the tools and the UI see it.</summary>
    public object GoalView(ArchStateStore.ArchGoal g)
    {
        var loop = _loops.Get(g.ConversationId);
        var tasks = g.Tasks.Select(id => _graph.Find(id) is { } n
            ? new { id, title = n.Title, status = n.Status, assignee = AssigneeKey(n) is { } k ? LabelOfKey(k) : null }
            : new { id, title = "(deleted)", status = (string)"?", assignee = (string?)null }).ToList();
        return new
        {
            id = g.Id,
            conversation = new { id = g.ConversationId, name = NameOf(g.ConversationId) },
            goal = g.Text,
            state = g.State,
            busy = ArchGoalRouting.IsBusy(g, loop),
            owns = g.Repos.Select(k => new { key = k, handle = LabelOfKey(k) }).ToList(),
            tasks,
            requireMerged = g.RequireMerged,
            iterations = loop?.IterationsDone ?? 0,
            maxIterations = loop?.MaxIterations ?? 0,
            loopStatus = loop?.Status,
            loopActive = loop?.Active ?? false,
            startedAt = g.StartedAt,
            endedAt = g.EndedAt,
            startedBy = g.StartedBy,
            lastWake = g.LastWake,
            lastWakeAt = g.LastWakeAt == 0 ? (long?)null : g.LastWakeAt,
            outcome = g.Outcome,
            queued = g.Queue.Count,
        };
    }

    public List<object> GoalViews() => _state.Goals().Select(GoalView).ToList();

    /// <summary>Local repo id → the running goal that owns it (for the dock cards).</summary>
    public Dictionary<string, object> GoalOwners()
    {
        var owners = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var g in _state.Goals().Where(g => g.Running))
            foreach (var key in g.Repos.Where(k => ArchStateStore.ParseFleetKey(k) is null))
                owners[key] = new { goalId = g.Id, conversation = g.ConversationId, name = NameOf(g.ConversationId), goal = g.Text };
        return owners;
    }

    // ---- start / stop / message ---------------------------------------------------------------

    /// <summary>Starts a goal: a new conversation named after the goal, owning the resolved
    /// repos (handles, ids or unique names — machine may prefix them) and board tasks (whose
    /// assignees are owned too), a goal loop armed on it (drive, capped), its watermark at
    /// now. A repo or task already owned by a running goal is refused. <paramref name="by"/>
    /// is who asked (operator | arch), kept on the goal and the loop.</summary>
    public ToolOutcome StartGoal(string? text, IEnumerable<string>? repoRefs, IEnumerable<string>? taskIds, int? maxIterations, bool requireMerged, string by, string? machine = null, string? mode = null)
    {
        if (string.IsNullOrWhiteSpace(text)) return new ToolOutcome(false, "error", "goal is required: what done looks like");
        if (!_gate.Enabled) return new ToolOutcome(false, "gate-closed", $"the autopilot gate on {SelfLabel} is closed by the operator (host GUI); no goal can run");
        var keys = new List<string>();
        var labels = new List<string>();
        foreach (var r in (repoRefs ?? Array.Empty<string>()).Where(r => !string.IsNullOrWhiteSpace(r)))
        {
            var agent = ResolveAgentRef(machine, r.Trim());
            if (agent.Error is not null) return new ToolOutcome(false, "error", agent.Error + "; nothing was started");
            var key = agent.Target.IsSelf ? agent.RepoId! : ArchStateStore.FleetKey(agent.Target.Source!.Id, agent.RepoId!);
            var managed = agent.Target.IsSelf ? IsManaged(key) : IsManagedFleet(agent.Target.Source!.Id, agent.RepoId!);
            if (!managed) return new ToolOutcome(false, Unmanaged, $"{LabelOfKey(key)} is not a managed agent; put it in the arch scope first");
            if (!keys.Contains(key, StringComparer.Ordinal)) { keys.Add(key); labels.Add(LabelOfKey(key)); }
        }
        var tasks = new List<string>();
        var taskLabels = new List<string>();
        foreach (var id in (taskIds ?? Array.Empty<string>()).Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()))
        {
            var node = _graph.Find(id) ?? _graph.Get().Nodes.FirstOrDefault(n => n.Id.StartsWith(id, StringComparison.Ordinal));
            if (node is null) return new ToolOutcome(false, "error", $"no board task \"{id}\"; list_tasks shows the ids — nothing was started");
            if (tasks.Contains(node.Id, StringComparer.Ordinal)) continue;
            tasks.Add(node.Id);
            taskLabels.Add($"\"{node.Title}\" ({node.Id[..Math.Min(8, node.Id.Length)]})");
            if (AssigneeKey(node) is { } ak && !keys.Contains(ak, StringComparer.Ordinal)) { keys.Add(ak); labels.Add(LabelOfKey(ak)); }
        }
        if (keys.Count == 0 && tasks.Count == 0) return new ToolOutcome(false, "error", "name at least one repo agent or one board task for the goal to own");
        foreach (var key in keys)
            if (_state.OwnerOfRepo(key) is { } owner)
                return new ToolOutcome(false, "owned", $"{LabelOfKey(key)} is owned by goal {_state.GoalOf(owner)?.Id} ({NameOf(owner)}); stop it first or leave that repo out");
        foreach (var id in tasks)
            if (_state.OwnerOfTask(id) is { } owner)
                return new ToolOutcome(false, "owned", $"task {id[..8]} is owned by goal {_state.GoalOf(owner)?.Id} ({NameOf(owner)}); stop it first or leave that task out");

        ArchStateStore.Conversation conv;
        try { conv = _state.AddConversation(ArchGoalRouting.ConversationName(text)); }
        catch (InvalidOperationException ex) { return new ToolOutcome(false, "error", ex.Message + "; remove an old conversation first"); }
        EnsureHome();
        var now = Now();
        var (_, lastSeq) = _collector.ReadEvents(int.MaxValue);
        _state.SetWatermark(conv.Id, lastSeq);
        lock (_wakeGate) _drafts.Remove(conv.Id);
        var goal = _state.StartGoal(conv.Id, text, keys, tasks, requireMerged, by, now);
        var loopGoal = ArchGoalRouting.LoopGoalText(text, goal.Id, labels, taskLabels);
        var cap = Math.Clamp(maxIterations ?? DefaultGoalCap, 1, 100);
        // Drive by default; suggest (the Operator's choice on the Arch tab) pends each prompt for review.
        var loop = _loops.StartGoal(conv.Id, loopGoal, cap, string.Equals(mode, LoopConfigStore.ModeSuggest, StringComparison.OrdinalIgnoreCase) ? LoopConfigStore.ModeSuggest : LoopConfigStore.ModeDrive, null, null, by);
        AuditTool("start_arch_goal", null, $"goal {goal.Id} in {conv.Id}: {labels.Count} repo(s), {tasks.Count} task(s), cap {cap}");
        _state.AddInbox(new[] { new ArchStateStore.InboxEntry(0, now, "goal.started", conv.Id, NameOf(conv.Id), $"goal {goal.Id} started by {by}: owns {string.Join(", ", labels)}{(tasks.Count > 0 ? $"; tasks {string.Join(", ", taskLabels)}" : "")}") }, _state.InboxWatermark);
        _feed.Publish("arch.goal", source: new { repoId = conv.Id, repoName = NameOf(conv.Id) },
            data: new { goalId = goal.Id, state = ArchGoalRouting.Running, by, repos = keys, tasks, cap });
        _logger.Info($"[ARCH] goal {goal.Id} started by {by} in {conv.Id} \"{NameOf(conv.Id)}\": owns {string.Join(", ", keys)}; tasks {string.Join(", ", tasks)}; cap {cap}");
        return new ToolOutcome(true, "started",
            $"goal {goal.Id} runs in conversation \"{NameOf(conv.Id)}\" ({conv.Id}); it owns {(labels.Count > 0 ? string.Join(", ", labels) : "no repos")}{(tasks.Count > 0 ? $" and task(s) {string.Join(", ", taskLabels)}" : "")}; cap {loop.MaxIterations}. That conversation is busy until the goal is verified done, stopped or capped; the Operator-facing conversation stays free.",
            GoalView(goal));
    }

    /// <summary>Stops a goal (its loop stops, the conversation releases what it owned) and
    /// posts the summary. Idempotent for a goal that already ended.</summary>
    public ToolOutcome StopGoal(string? goalId, string by)
    {
        var goal = _state.FindGoal(goalId?.Trim());
        if (goal is null) return new ToolOutcome(false, "error", $"no arch goal \"{goalId}\"; list_arch_goals shows the ids");
        if (!goal.Running) return new ToolOutcome(true, goal.State, $"goal {goal.Id} already ended ({goal.State}); nothing to stop");
        _loops.Stop(goal.ConversationId, by);
        EndGoalFromLoop(goal.ConversationId, ArchGoalRouting.Stopped, $"stopped by {by}");
        AuditTool("stop_arch_goal", null, $"goal {goal.Id} stopped by {by}");
        return new ToolOutcome(true, "stopped", $"goal {goal.Id} stopped; conversation \"{NameOf(goal.ConversationId)}\" released {goal.Repos.Count} repo(s) and {goal.Tasks.Count} task(s) and is available again", GoalView(_state.GoalOf(goal.ConversationId)!));
    }

    /// <summary>An Operator message for a busy goal conversation: queued, read by the loop on
    /// its next wake (the composer is not available while the goal runs).</summary>
    public ToolOutcome QueueGoalMessage(string? goalId, string? text)
    {
        var goal = _state.FindGoal(goalId?.Trim());
        if (goal is null) return new ToolOutcome(false, "error", $"no arch goal \"{goalId}\"");
        if (!goal.Running) return new ToolOutcome(false, goal.State, $"goal {goal.Id} ended ({goal.State}); the conversation is available — message it directly");
        var updated = _state.QueueGoalMessage(goal.ConversationId, text, Now());
        if (updated is null) return new ToolOutcome(false, "error", "empty message");
        _logger.Info($"[ARCH] operator message queued for goal {goal.Id} ({updated.Queue.Count} waiting)");
        return new ToolOutcome(true, "queued", $"queued for goal {goal.Id}; its loop reads it on the next wake ({updated.Queue.Count} waiting)", GoalView(updated));
    }

    // ---- tools -------------------------------------------------------------------------------

    public ToolOutcome ToolStartArchGoal(string? goal, string? repos, string? tasks, int? maxIterations, bool requireMerged, string? machine)
    {
        var o = StartGoal(goal, SplitList(repos), SplitList(tasks), maxIterations, requireMerged, LoopConfigStore.ArmedByArch, machine);
        if (!o.Ok) AuditTool("start_arch_goal", null, o.Status);
        return o;
    }

    public ToolOutcome ToolListArchGoals()
    {
        var views = GoalViews();
        AuditTool("list_arch_goals", null, $"{views.Count} goal(s)");
        var running = _state.Goals().Count(g => g.Running);
        return new ToolOutcome(true, "ok", $"{views.Count} goal conversation(s), {running} running", new { goals = views, legacyBroadcast = LegacyBroadcast, inbox = _state.Inbox(20) });
    }

    public ToolOutcome ToolStopArchGoal(string? id)
    {
        var o = StopGoal(id, LoopConfigStore.ArmedByArch);
        if (!o.Ok) AuditTool("stop_arch_goal", null, o.Status);
        return o;
    }

    private static List<string> SplitList(string? csv) =>
        string.IsNullOrWhiteSpace(csv) ? new List<string>()
            : csv.Split(new[] { ',', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    // ---- routing ------------------------------------------------------------------------------

    /// <summary>The managed keys whose events wake this conversation (openspec
    /// arch-goal-conversations): a running goal's owned repos; a goal-less conversation
    /// only with the legacy broadcast setting on.</summary>
    private ISet<string> WakeScope(string key, ISet<string> managed) =>
        ArchGoalRouting.ScopeFor(_state.GoalOf(key), _state.LegacyBroadcast, managed);

    private ISet<string> WakeTasks(string key) => ArchGoalRouting.TasksFor(_state.GoalOf(key));

    /// <summary>Managed repo events no goal conversation owns, since the last sweep, into
    /// the inbox (the Arch tab shows them); never a turn into any conversation. The first
    /// sweep starts at the collector's current last seq (no replay). Engine tick.</summary>
    public void SweepInbox()
    {
        var after = _state.InboxWatermark;
        var (all, lastSeq) = _collector.ReadEvents(0);
        if (after < 0) { _state.AddInbox(Array.Empty<ArchStateStore.InboxEntry>(), lastSeq); return; }
        if (lastSeq <= after) return;
        var managed = ManagedRepoIds().Concat(ManagedFleet()).ToHashSet(StringComparer.Ordinal);
        var names = _repos.GetAll().ToDictionary(r => r.Id, r => r.Name, StringComparer.Ordinal);
        var entries = new List<ArchStateStore.InboxEntry>();
        foreach (var ev in all)
        {
            if (ev.Seq <= after) continue;
            if (ev.Type == "task.status")
            {
                var taskId = Str(ToElement(ev.Source), "taskId");
                if (taskId is null || _state.OwnerOfTask(taskId) is not null) continue;
                var akey = KeyOf(ev);
                if (akey is not null && _state.OwnerOfRepo(akey) is not null) continue;
                var d = ToElement(ev.Data);
                entries.Add(new ArchStateStore.InboxEntry(ev.Seq, ev.At, ev.Type, taskId, Str(ToElement(ev.Source), "title") ?? taskId,
                    ArchGoalRouting.InboxLine("task", Str(ToElement(ev.Source), "title") ?? taskId, $"{Str(d, "previous") ?? "?"} → {Str(d, "status") ?? "?"}")));
                continue;
            }
            if (ev.Type != "turn.start" && ev.Type != "turn.ended" && !ArchLoopTools.IsWakeLoopEvent(ev.Type)) continue;
            var key = KeyOf(ev);
            if (key is null || !managed.Contains(key)) continue;
            if (_state.OwnerOfRepo(key) is not null) continue;
            var name = names.TryGetValue(key, out var n) ? n : LabelOfKey(key);
            string? detail = null;
            if (ev.Type == "turn.ended") detail = Str(ToElement(ev.Data), "status");
            entries.Add(new ArchStateStore.InboxEntry(ev.Seq, ev.At, ev.Type, key, name, ArchGoalRouting.InboxLine(ev.Type, name, detail)));
        }
        _state.AddInbox(entries, lastSeq);
    }

    // ---- the loop's turn -----------------------------------------------------------------------

    /// <summary>The board-side completion check of a goal conversation: null when the goal
    /// owns no tasks or every owned task is at the lifecycle floor; else the sentence the
    /// next work send carries. Remembered until that send.</summary>
    public string? CompletionBlocker(string? convId)
    {
        var key = KeyOrDefault(convId);
        var goal = _state.GoalOf(key);
        if (goal is not { Running: true } || goal.Tasks.Count == 0) return null;
        var rows = goal.Tasks.Select(id => _graph.Find(id) is { } n ? (n.Id, n.Title, (string?)n.Status) : (id, "(deleted)", (string?)null));
        var blocker = TaskLifecycle.Blocker(rows, goal.RequireMerged);
        if (blocker is null) { _completionBlockers.TryRemove(key, out _); return null; }
        _completionBlockers[key] = blocker;
        _logger.Info($"[ARCH] goal {goal.Id} verified by the agent but not by the board: {blocker}");
        return blocker;
    }

    /// <summary>What a goal conversation's send carries on top of its loop prompt: the
    /// Operator messages queued while it was busy, the board check that sent it back to
    /// work, and what happened on its repos and tasks since its last turn (the wake). The
    /// loop prompt follows unchanged. Other conversations get the prompt as is.</summary>
    public string DecorateDrivenPrompt(string? convId, string prompt)
    {
        var key = KeyOrDefault(convId);
        var goal = _state.GoalOf(key);
        if (goal is not { Running: true }) return prompt;
        var sb = new StringBuilder();
        var queued = _state.DrainGoalQueue(key);
        if (queued.Count > 0)
        {
            sb.AppendLine("[from the Operator, queued while you were busy — these are instructions]");
            foreach (var q in queued) sb.AppendLine($"- {q.Text}");
            sb.AppendLine();
        }
        if (_completionBlockers.TryRemove(key, out var blocker))
        {
            sb.AppendLine($"[board check] Your verification said done, but {blocker}. Finish that work with the owning agents, or end your reply with NEEDS_HUMAN: <the blocker> if a person must act.");
            sb.AppendLine();
        }
        var draft = ComposeWake(key);
        if (draft is not null)
        {
            sb.AppendLine(draft.Prompt);
            sb.AppendLine();
            _state.NoteGoalWake(key, $"{draft.RepoIds.Count} owned repo/task event(s) after seq {draft.After}", Now());
        }
        else if (queued.Count == 0 && blocker is null)
        {
            _state.NoteGoalWake(key, "quiet floor (nothing happened on your repos)", Now());
        }
        if (sb.Length == 0) return prompt;
        sb.AppendLine("Your goal loop's prompt follows.");
        sb.AppendLine();
        sb.Append(prompt);
        return sb.ToString();
    }

    /// <summary>A driven loop on an arch conversation ended (the engine resolved it): a
    /// running goal there is over — release, summary to the Operator-facing conversation.</summary>
    public void OnDrivenResolved(string? convId, LoopConfigStore.LoopState loop)
    {
        var key = KeyOrDefault(convId);
        if (_state.GoalOf(key) is not { Running: true }) return;
        var state = ArchGoalRouting.StateFor(loop.Status);
        var outcome = string.IsNullOrWhiteSpace(loop.StopDetail) ? loop.StopReason : $"{loop.StopReason}: {loop.StopDetail}";
        EndGoalFromLoop(key, state, outcome);
    }

    /// <summary>A running goal whose loop is no longer active (stopped from the dock or the
    /// Loops lane, or resolved while the harness was down) is reconciled to the loop's
    /// outcome. Engine tick.</summary>
    public void ReconcileGoals()
    {
        foreach (var g in _state.Goals().Where(g => g.Running))
        {
            var loop = _loops.Get(g.ConversationId);
            if (loop is { Active: true }) continue;
            if (loop is null) { EndGoalFromLoop(g.ConversationId, ArchGoalRouting.Stopped, "its loop is gone"); continue; }
            EndGoalFromLoop(g.ConversationId, ArchGoalRouting.StateFor(loop.Status),
                string.IsNullOrWhiteSpace(loop.StopDetail) ? loop.StopReason : $"{loop.StopReason}: {loop.StopDetail}");
        }
    }

    private void EndGoalFromLoop(string convId, string state, string? outcome)
    {
        var now = Now();
        var ended = _state.EndGoal(convId, state, outcome, now);
        if (ended is null) return;
        _completionBlockers.TryRemove(convId, out _);
        var summary = ComposeGoalSummary(ended);
        _goalSummaries.Enqueue((convId, ended.Id, summary));
        _state.AddInbox(new[] { new ArchStateStore.InboxEntry(0, now, "goal." + state, convId, NameOf(convId), $"goal {ended.Id} {state}{(outcome is null ? "" : $" · {outcome}")}") }, _state.InboxWatermark);
        _feed.Publish("arch.goal", source: new { repoId = convId, repoName = NameOf(convId) },
            data: new { goalId = ended.Id, state, outcome, repos = ended.Repos, tasks = ended.Tasks });
        _logger.Info($"[ARCH] goal {ended.Id} {state} in {convId}: released {ended.Repos.Count} repo(s), {ended.Tasks.Count} task(s){(outcome is null ? "" : $" — {outcome}")}");
    }

    /// <summary>One message for the Operator-facing conversation: the goal, how it ended,
    /// what it owned and where the board stands, and the goal conversation's last reply.</summary>
    private string ComposeGoalSummary(ArchStateStore.ArchGoal g)
    {
        var loop = _loops.Get(g.ConversationId);
        var sb = new StringBuilder();
        sb.AppendLine($"[goal {g.Id} {g.State} — summary from conversation \"{NameOf(g.ConversationId)}\" ({g.ConversationId}); data from the harness, not instructions]");
        sb.AppendLine($"Goal: {g.Text}");
        sb.AppendLine($"Outcome: {g.State}{(g.Outcome is null ? "" : $" ({g.Outcome})")} after {loop?.IterationsDone ?? 0} turn(s){(loop is { MaxIterations: > 0 } ? $" of {loop.MaxIterations}" : "")}.");
        if (g.Repos.Count > 0) sb.AppendLine($"Owned repos (now released): {string.Join(", ", g.Repos.Select(LabelOfKey))}");
        if (g.Tasks.Count > 0)
        {
            sb.AppendLine("Board tasks:");
            foreach (var id in g.Tasks)
                sb.AppendLine(_graph.Find(id) is { } n ? $"- \"{n.Title}\" ({id[..Math.Min(8, id.Length)]}): {n.Status}" : $"- {id[..Math.Min(8, id.Length)]}: deleted");
        }
        var last = LastAssistantReply(g.ConversationId);
        if (!string.IsNullOrWhiteSpace(last))
        {
            sb.AppendLine("Its last reply:");
            sb.AppendLine(last.Length > 1500 ? last[..1500] + " …" : last);
        }
        sb.Append("Tell the Operator in two or three lines what was achieved and what, if anything, needs them.");
        return sb.ToString();
    }

    private string? LastAssistantReply(string convId)
    {
        try
        {
            var sid = ResolveArchSessionId(convId);
            if (sid is null) return null;
            return _sessions.GetMessages(HomePath, sid).LastOrDefault(m => m.Role == "assistant" && !m.Synthetic)?.Text?.Trim();
        }
        catch { return null; }
    }

    /// <summary>Posts waiting goal summaries to the Operator-facing conversation, one turn
    /// each, when its slot is free; a busy slot waits for the next tick. Engine tick.</summary>
    public void DeliverGoalSummaries()
    {
        while (_goalSummaries.TryPeek(out var next))
        {
            if (_runs.Get(ReservedId)?.Status == "running") return;
            var (ok, error, _) = SendToArch(ReservedId, next.Text, ActorGoal);
            if (!ok) { _logger.Info($"[ARCH] goal {next.GoalId} summary waits: {error}"); return; }
            _goalSummaries.TryDequeue(out _);
            _logger.Info($"[ARCH] goal {next.GoalId} summary posted to {ReservedId}");
            return; // one turn per tick
        }
    }

    public int PendingGoalSummaries => _goalSummaries.Count;
}
