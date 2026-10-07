using System.Collections.Concurrent;
using System.Text;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// Goal conversations (openspec arch-goal-conversations), the harness-bound half: start a
/// goal (a new conversation that drives named repo agents and board tasks, a goal loop
/// armed on it — the arch on a timer), stop it, queue an Operator message for it, the
/// tools, the release when its loop ends and the summary posted to the Operator-facing
/// conversation. Repo agents never call the arch; a goal conversation checks them itself
/// on every turn. The pure rules live in <see cref="ArchGoals"/>, the state in
/// <see cref="ArchStateStore"/>.
///
/// A goal is an ORCHESTRATION (openspec goal-step-plan): its STEP PLAN — declared at start
/// or derived from the goal text, marked by the arch as it runs (<c>mark_step</c>), edited
/// mid-flight (<c>edit_goal_plan</c>) — rides on the goal record, is carried into every
/// work and verification send, blocks itself on a NEEDS_HUMAN ending (the goal is HELD,
/// not ended, until the Operator answers), carries over when a goal is continued, and is
/// what the finished-goal summary is written from. The pure rules: <see cref="ArchGoalPlans"/>.
/// </summary>
public partial class ArchAgentService
{
    public const string ActorGoal = ArchGoals.ActorGoal;
    public const int DefaultGoalCap = 20;
    public const string NotOwner = "not-owner";

    // Summaries of finished goals waiting for the default conversation's slot.
    private readonly ConcurrentQueue<(string ConvId, string GoalId, string Text)> _goalSummaries = new();

    // ---- state -----------------------------------------------------------------------------

    public ArchStateStore.ArchGoal? GoalOf(string? convId) => _state.GoalOf(KeyOrDefault(convId));

    /// <summary>"busy: goal &lt;id&gt;" — this conversation runs a goal whose loop is armed.</summary>
    public bool IsBusy(string? convId)
    {
        var key = KeyOrDefault(convId);
        return ArchGoals.IsBusy(_state.GoalOf(key), _loops.Get(key));
    }

    /// <summary>A running goal whose loop stopped as escalate (NEEDS_HUMAN) is HELD: it keeps
    /// what it drives and waits for the Operator's answer, which resumes the loop in place
    /// (openspec goal-step-plan). Not busy — the composer sends the answer as a plain turn.</summary>
    public bool IsHeld(string? convId)
    {
        var key = KeyOrDefault(convId);
        return _state.GoalOf(key) is { Running: true } && _loops.Get(key) is { Active: false, Status: "escalate" };
    }

    /// <summary>Whether a driven loop on this conversation has a wake to react to. A goal
    /// conversation polls only: its repeats go out on the quiet floor, never on a repo
    /// agent's turn. Any other arch conversation keeps the feed-based wake.</summary>
    public bool HasWake(string? convId)
    {
        var key = KeyOrDefault(convId);
        if (ArchGoals.PollsOnly(_state.GoalOf(key))) return false;
        return ComposeWake(key) is not null;
    }

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
        var steps = g.Steps;
        var (done, total) = ArchGoalPlans.Progress(steps);
        var active = ArchGoalPlans.ActiveIndex(steps);
        return new
        {
            id = g.Id,
            conversation = new { id = g.ConversationId, name = NameOf(g.ConversationId) },
            goal = g.Text,
            state = g.State,
            busy = ArchGoals.IsBusy(g, loop),
            // Held on NEEDS_HUMAN (openspec goal-step-plan): running, loop escalated, waiting on the Operator.
            held = g.Running && loop is { Active: false, Status: "escalate" },
            owns = g.Repos.Select(k => new { key = k, handle = LabelOfKey(k) }).ToList(),
            tasks,
            iterations = loop?.IterationsDone ?? 0,
            maxIterations = loop?.MaxIterations ?? 0,
            loopStatus = loop?.Status,
            loopActive = loop?.Active ?? false,
            // Why the loop stopped and the goal phase (openspec arch-subagents-tab, additive):
            // the Subagents selector tells "waiting on the Operator (NEEDS_HUMAN)" apart from
            // plain stopped, and shows the question on the row.
            stopReason = loop?.StopReason,
            stopDetail = loop?.StopDetail,
            phase = loop?.Phase,
            lastSentAt = loop?.LastSentAt ?? 0,
            pollSeconds = DrivenQuietSeconds,
            startedAt = g.StartedAt,
            endedAt = g.EndedAt,
            startedBy = g.StartedBy,
            outcome = g.Outcome,
            queued = g.Queue.Count,
            // The step plan (openspec goal-step-plan): steps with live states and evidence,
            // whether it was derived from the goal text, progress, the active step, how many
            // steps are blocked, and the goal this one continues.
            plan = ArchGoalPlans.Views(steps),
            planDerived = g.PlanDerived,
            progress = new { done, total },
            activeStep = active < 0 ? (int?)null : active + 1,
            blockedSteps = ArchGoalPlans.BlockedCount(steps),
            awaitsHuman = ArchGoalPlans.AwaitsHuman(steps),
            continuesGoalId = g.ContinuesGoalId,
        };
    }

    public List<object> GoalViews() => _state.Goals().Select(GoalView).ToList();

    /// <summary>Local repo id → the running goal that drives it (for the dock cards).</summary>
    public Dictionary<string, object> GoalOwners()
    {
        var owners = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var g in _state.Goals().Where(g => g.Running))
            foreach (var key in g.Repos.Where(k => ArchStateStore.ParseFleetKey(k) is null))
                owners[key] = new { goalId = g.Id, conversation = g.ConversationId, name = NameOf(g.ConversationId), goal = g.Text };
        return owners;
    }

    // ---- start / stop / message ---------------------------------------------------------------

    /// <summary>Starts a goal: a new conversation named after the goal, driving the resolved
    /// repo agents (handles, ids or unique names — machine may prefix them) and board tasks
    /// (their assignees too), a goal loop armed on it (capped; drive unless <paramref name="mode"/>
    /// is suggest). A repo or task already driven by a running goal is refused.
    /// <paramref name="by"/> is who asked (operator | arch), kept on the goal and the loop.</summary>
    public ToolOutcome StartGoal(string? text, IEnumerable<string>? repoRefs, IEnumerable<string>? taskIds, int? maxIterations, string by, string? machine = null, string? mode = null) =>
        StartGoal(text, repoRefs, taskIds, maxIterations, by, machine, mode, out _);

    /// <summary>As above, handing back the goal it started (null when refused) — approving a
    /// request as a goal needs its id and conversation (openspec repo-agent-requests-goal-drive).</summary>
    public ToolOutcome StartGoal(string? text, IEnumerable<string>? repoRefs, IEnumerable<string>? taskIds, int? maxIterations, string by, string? machine, string? mode, out ArchStateStore.ArchGoal? started) =>
        StartGoal(text, repoRefs, taskIds, maxIterations, by, machine, mode, null, null, out started);

    /// <summary>As above with the step plan (openspec goal-step-plan): <paramref name="steps"/>
    /// declared up front (else derived from the goal text and marked so), and
    /// <paramref name="continuesGoalId"/> — a finished goal whose plan (done steps and their
    /// evidence) carries over; its text, repos and tasks are the defaults when omitted.</summary>
    public ToolOutcome StartGoal(string? text, IEnumerable<string>? repoRefs, IEnumerable<string>? taskIds, int? maxIterations, string by, string? machine, string? mode,
        IReadOnlyList<ArchGoalPlans.Step>? steps, string? continuesGoalId, out ArchStateStore.ArchGoal? started)
    {
        started = null;
        ArchStateStore.ArchGoal? previous = null;
        if (!string.IsNullOrWhiteSpace(continuesGoalId))
        {
            previous = _state.FindGoal(continuesGoalId.Trim());
            if (previous is null) return new ToolOutcome(false, "error", $"no arch goal \"{continuesGoalId}\" to continue; list_arch_goals shows the ids");
            if (previous.Running) return new ToolOutcome(false, "owned", $"goal {previous.Id} still runs in \"{NameOf(previous.ConversationId)}\" — answer it or stop it before continuing it");
            if (string.IsNullOrWhiteSpace(text)) text = previous.Text;
        }
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
        var tasks = (taskIds ?? Array.Empty<string>()).Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).ToList();
        // A continued goal keeps what the previous one drove unless the caller names its own.
        if (previous is not null && keys.Count == 0 && tasks.Count == 0)
        {
            foreach (var k in previous.Repos) if (!keys.Contains(k, StringComparer.Ordinal)) { keys.Add(k); labels.Add(LabelOfKey(k)); }
            tasks = previous.Tasks.ToList();
        }
        var plan = steps is { Count: > 0 } ? steps.ToList()
            : previous is not null ? ArchGoalPlans.CarryOver(previous.Steps, Now())
            : ArchGoalPlans.Derive(text, Now());
        var derived = steps is not { Count: > 0 } && previous is null && plan.Count > 0;
        return StartGoalWithKeys(text!, keys, labels, tasks, maxIterations, by, mode, plan, derived, previous?.Id, out started);
    }

    /// <summary>The second half of a start, on resolved keys: board tasks (and their
    /// assignees), the ownership check, the conversation, the record, the loop.</summary>
    private ToolOutcome StartGoalWithKeys(string text, List<string> keys, List<string> labels, List<string> taskIds, int? maxIterations, string by, string? mode,
        IReadOnlyList<ArchGoalPlans.Step> plan, bool planDerived, string? continuesGoalId, out ArchStateStore.ArchGoal? started)
    {
        started = null;
        var tasks = new List<string>();
        var taskLabels = new List<string>();
        foreach (var id in taskIds)
        {
            var node = _graph.Find(id) ?? _graph.Get().Nodes.FirstOrDefault(n => n.Id.StartsWith(id, StringComparison.Ordinal));
            if (node is null) return new ToolOutcome(false, "error", $"no board task \"{id}\"; list_tasks shows the ids — nothing was started");
            if (tasks.Contains(node.Id, StringComparer.Ordinal)) continue;
            tasks.Add(node.Id);
            taskLabels.Add($"\"{node.Title}\" ({node.Id[..Math.Min(8, node.Id.Length)]})");
            if (AssigneeKey(node) is { } ak && !keys.Contains(ak, StringComparer.Ordinal)) { keys.Add(ak); labels.Add(LabelOfKey(ak)); }
        }
        if (keys.Count == 0 && tasks.Count == 0) return new ToolOutcome(false, "error", "name at least one repo agent or one board task for the goal to drive");
        foreach (var key in keys)
            if (_state.OwnerOfRepo(key) is { } owner)
                return new ToolOutcome(false, "owned", $"{LabelOfKey(key)} is driven by goal {_state.GoalOf(owner)?.Id} ({NameOf(owner)}); stop it first or leave that repo out");
        foreach (var id in tasks)
            if (_state.OwnerOfTask(id) is { } owner)
                return new ToolOutcome(false, "owned", $"task {id[..8]} is driven by goal {_state.GoalOf(owner)?.Id} ({NameOf(owner)}); stop it first or leave that task out");

        ArchStateStore.Conversation conv;
        try { conv = _state.AddConversation(ArchGoals.ConversationName(text)); }
        catch (InvalidOperationException ex) { return new ToolOutcome(false, "error", ex.Message + "; remove an old conversation first"); }
        EnsureHome();
        var now = Now();
        var goal = _state.StartGoal(conv.Id, text, keys, tasks, by, now, plan, planDerived, continuesGoalId);
        started = goal;
        var loopGoal = ArchGoals.LoopGoalText(text, goal.Id, labels, taskLabels);
        var cap = Math.Clamp(maxIterations ?? DefaultGoalCap, 1, 100);
        var loopMode = string.Equals(mode, LoopConfigStore.ModeSuggest, StringComparison.OrdinalIgnoreCase) ? LoopConfigStore.ModeSuggest : LoopConfigStore.ModeDrive;
        var loop = _loops.StartGoal(conv.Id, loopGoal, cap, loopMode, null, null, by);
        var (done, total) = ArchGoalPlans.Progress(goal.Steps);
        AuditTool("start_arch_goal", null, $"goal {goal.Id} in {conv.Id}: {labels.Count} repo(s), {tasks.Count} task(s), cap {cap}, plan {total} step(s){(planDerived ? " derived" : "")}{(continuesGoalId is null ? "" : $", continues {continuesGoalId}")}");
        _feed.Publish("arch.goal", source: new { repoId = conv.Id, repoName = NameOf(conv.Id) },
            data: new { goalId = goal.Id, state = ArchGoals.Running, by, repos = keys, tasks, cap, steps = total, continues = continuesGoalId });
        _logger.Info($"[ARCH] goal {goal.Id} started by {by} in {conv.Id} \"{NameOf(conv.Id)}\": drives {string.Join(", ", keys)}; tasks {string.Join(", ", tasks)}; cap {cap}; plan {done}/{total}{(planDerived ? " (derived)" : "")}{(continuesGoalId is null ? "" : $"; continues {continuesGoalId}")}; polls every {DrivenQuietSeconds} s");
        var planWords = total == 0 ? "no step plan yet (declare one with edit_goal_plan on the first turn)"
            : $"{total}-step plan{(planDerived ? " derived from the goal text" : "")}{(continuesGoalId is null ? "" : $" carried over from goal {continuesGoalId} ({done} already done)")}";
        return new ToolOutcome(true, "started",
            $"goal {goal.Id} runs in conversation \"{NameOf(conv.Id)}\" ({conv.Id}); it drives {(labels.Count > 0 ? string.Join(", ", labels) : "no repos")}{(tasks.Count > 0 ? $" and task(s) {string.Join(", ", taskLabels)}" : "")}; cap {loop.MaxIterations}, polling its agents every {DrivenQuietSeconds / 60} min; {planWords}. That conversation is busy until the goal is verified done, stopped or capped; this conversation stays free and gets the summary.",
            GoalView(goal));
    }

    /// <summary>Continues an ENDED goal (capped, errored, stopped) as a new goal with the same
    /// text, agents and tasks, its plan carried over: done steps stay done, so no brief is sent
    /// twice (openspec goal-step-plan). The Subagents tab's Continue button and the tool's
    /// <c>continuesGoalId</c> share this.</summary>
    public ToolOutcome ContinueGoal(string? goalId, int? maxIterations, string by)
    {
        var o = StartGoal(null, null, null, maxIterations, by, null, null, null, goalId, out var started);
        if (!o.Ok) return o;
        _logger.Info($"[ARCH] goal {started?.Id} continues goal {goalId} ({by})");
        return o with { Status = "continued" };
    }

    /// <summary>Stops a goal (its loop stops, the conversation releases the agents and tasks it
    /// drove) and posts the summary. Idempotent for a goal that already ended. The plan stays
    /// on the record.</summary>
    public ToolOutcome StopGoal(string? goalId, string by)
    {
        var goal = _state.FindGoal(goalId?.Trim());
        if (goal is null) return new ToolOutcome(false, "error", $"no arch goal \"{goalId}\"; list_arch_goals shows the ids");
        if (!goal.Running) return new ToolOutcome(true, goal.State, $"goal {goal.Id} already ended ({goal.State}); nothing to stop");
        _loops.Stop(goal.ConversationId, by);
        EndGoalFromLoop(goal.ConversationId, ArchGoals.Stopped, $"stopped by {by}");
        AuditTool("stop_arch_goal", null, $"goal {goal.Id} stopped by {by}");
        return new ToolOutcome(true, "stopped", $"goal {goal.Id} stopped; conversation \"{NameOf(goal.ConversationId)}\" released {goal.Repos.Count} repo(s) and {goal.Tasks.Count} task(s) and is available again", GoalView(_state.GoalOf(goal.ConversationId)!));
    }

    /// <summary>An Operator message for a busy goal conversation: queued, carried by the loop's
    /// next send (the composer is not available while the goal runs).</summary>
    public ToolOutcome QueueGoalMessage(string? goalId, string? text)
    {
        var goal = _state.FindGoal(goalId?.Trim());
        if (goal is null) return new ToolOutcome(false, "error", $"no arch goal \"{goalId}\"");
        if (!goal.Running) return new ToolOutcome(false, goal.State, $"goal {goal.Id} ended ({goal.State}); the conversation is available — message it directly");
        var updated = _state.QueueGoalMessage(goal.ConversationId, text, Now());
        if (updated is null) return new ToolOutcome(false, "error", "empty message");
        _logger.Info($"[ARCH] operator message queued for goal {goal.Id} ({updated.Queue.Count} waiting)");
        return new ToolOutcome(true, "queued", $"queued for goal {goal.Id}; its loop carries it on the next poll ({updated.Queue.Count} waiting)", GoalView(updated));
    }

    /// <summary>The Operator's answer to a goal (the plan panel's answer box, openspec
    /// goal-step-plan): every step blocked on them is active again; a HELD goal gets the
    /// answer as a turn that resumes its loop; a busy one gets it queued; an ended one gets
    /// it as a plain message in its conversation.</summary>
    public ToolOutcome AnswerGoal(string? goalId, string? text)
    {
        var goal = _state.FindGoal(goalId?.Trim());
        if (goal is null) return new ToolOutcome(false, "error", $"no arch goal \"{goalId}\"");
        if (string.IsNullOrWhiteSpace(text)) return new ToolOutcome(false, "error", "empty answer");
        if (ArchGoalPlans.AwaitsHuman(goal.Steps))
        {
            var cleared = ArchGoalPlans.ClearHumanBlock(goal.Steps, Now());
            _state.SetGoalPlan(goal.ConversationId, cleared);
            PublishPlan(goal.ConversationId, goal.Id, "answered", "operator");
        }
        if (goal.Running && IsBusy(goal.ConversationId)) return QueueGoalMessage(goal.Id, text);
        var (ok, error, _) = SendToArch(goal.ConversationId, text!.Trim(), ActorHuman);
        if (!ok) return new ToolOutcome(false, "busy", error);
        var resumed = _loops.Get(goal.ConversationId) is { Active: true } && goal.Running;
        _logger.Info($"[ARCH] operator answered goal {goal.Id}{(resumed ? " — its loop resumed" : "")}");
        return new ToolOutcome(true, resumed ? "resumed" : "sent", resumed ? $"answer sent to goal {goal.Id}; its loop is armed again" : $"answer sent to conversation \"{NameOf(goal.ConversationId)}\"", GoalView(_state.GoalOf(goal.ConversationId)!));
    }

    // ---- the plan: mark / edit (openspec goal-step-plan) ------------------------------------------

    /// <summary>The goal a tool call addresses: <paramref name="goalId"/> when given, else the
    /// goal of the calling conversation. Error text when neither resolves.</summary>
    private (ArchStateStore.ArchGoal? Goal, string? Error) GoalForTool(string? goalId, string? callerConv)
    {
        if (!string.IsNullOrWhiteSpace(goalId))
        {
            var g = _state.FindGoal(goalId.Trim());
            return g is null ? (null, $"no arch goal \"{goalId}\"; list_arch_goals shows the ids") : (g, null);
        }
        var own = _state.GoalOf(KeyOrDefault(callerConv));
        return own is null ? (null, "goalId is required: this conversation runs no goal (list_arch_goals shows the ids)") : (own, null);
    }

    /// <summary>Marks one step of a goal's plan. From a tool call, only the goal conversation that
    /// owns the goal may (<paramref name="callerConv"/>); the Operator (null caller) always may.</summary>
    public ToolOutcome MarkStep(string? goalId, string? stepRef, string? state, string? note, ArchGoalPlans.Evidence? evidence, int? counter, string by, string? callerConv)
    {
        var (goal, err) = GoalForTool(goalId, callerConv);
        if (goal is null) return new ToolOutcome(false, "error", err!);
        if (callerConv is not null && !string.Equals(KeyOrDefault(callerConv), goal.ConversationId, StringComparison.Ordinal))
            return new ToolOutcome(false, NotOwner, $"only the goal conversation that owns goal {goal.Id} (\"{NameOf(goal.ConversationId)}\") marks its steps; the Operator can from the Subagents tab");
        var st = ArchGoalPlans.NormalizeState(state);
        if (st.Length == 0) return new ToolOutcome(false, "error", "state must be one of pending | active | done | blocked | skipped");
        var steps = goal.Steps;
        var idx = ArchGoalPlans.FindIndex(steps, stepRef);
        if (idx == -2) return new ToolOutcome(false, "error", $"\"{stepRef}\" names more than one step; use its number");
        if (idx < 0) return new ToolOutcome(false, "error", steps.Count == 0 ? $"goal {goal.Id} has no plan yet — edit_goal_plan(action: \"set\", steps: […]) first" : $"no step \"{stepRef}\" in goal {goal.Id}'s plan (1–{steps.Count})");
        var updated = ArchGoalPlans.Mark(steps, idx, st, note, evidence, counter, Now());
        var saved = _state.SetGoalPlan(goal.ConversationId, updated);
        if (saved is null) return new ToolOutcome(false, "error", "the goal vanished");
        var step = updated[idx];
        AuditTool("mark_step", null, $"goal {goal.Id} step {idx + 1} \"{step.Title}\" → {st}{(step.Evidence is { IsEmpty: false } e ? $" ({e.Line()})" : "")} by {by}");
        PublishPlan(goal.ConversationId, goal.Id, st, by, idx + 1, step.Title);
        var (done, total) = ArchGoalPlans.Progress(updated);
        _logger.Info($"[ARCH] goal {goal.Id} step {idx + 1}/{total} \"{step.Title}\" {st} ({done}/{total} done) by {by}");
        return new ToolOutcome(true, "marked", $"step {idx + 1} \"{step.Title}\" is {st}; {done}/{total} done{(step.Kind == ArchGoalPlans.KindRelayLoop ? $", {step.Counter} relayed" : "")}", GoalView(saved));
    }

    /// <summary>Edits a goal's plan (set | add | rename | remove | move). From a tool call the
    /// owning goal conversation or the Operator-facing conversation may; the Operator always.</summary>
    public ToolOutcome EditGoalPlan(string? goalId, string? action, string? stepRef, string? title, string? done, string? kind, int? to, IReadOnlyList<ArchGoalPlans.Step>? steps, string by, string? callerConv)
    {
        var (goal, err) = GoalForTool(goalId, callerConv);
        if (goal is null) return new ToolOutcome(false, "error", err!);
        if (callerConv is not null)
        {
            var caller = KeyOrDefault(callerConv);
            if (!string.Equals(caller, goal.ConversationId, StringComparison.Ordinal) && !string.Equals(caller, ReservedId, StringComparison.Ordinal))
                return new ToolOutcome(false, NotOwner, $"only the goal conversation that owns goal {goal.Id} (or the Operator-facing conversation on the Operator's ask) edits its plan");
        }
        var (updated, error) = ArchGoalPlans.Edit(goal.Steps, action, stepRef, title, done, kind, to, steps, Now());
        if (updated is null) return new ToolOutcome(false, "error", error!);
        var saved = _state.SetGoalPlan(goal.ConversationId, updated, derived: false);
        if (saved is null) return new ToolOutcome(false, "error", "the goal vanished");
        AuditTool("edit_goal_plan", null, $"goal {goal.Id} plan {action}: {updated.Count} step(s) by {by}");
        PublishPlan(goal.ConversationId, goal.Id, $"plan-{(action ?? "").Trim().ToLowerInvariant()}", by);
        _logger.Info($"[ARCH] goal {goal.Id} plan {action} → {updated.Count} step(s) by {by}");
        return new ToolOutcome(true, "edited", $"plan of goal {goal.Id}: {updated.Count} step(s) — {string.Join("; ", updated.Select((s, i) => $"{i + 1}. {s.Title} ({s.State})"))}", GoalView(saved));
    }

    private void PublishPlan(string convId, string goalId, string what, string by, int? step = null, string? title = null) =>
        _feed.Publish("arch.goal.step", source: new { repoId = convId, repoName = NameOf(convId) },
            data: new { goalId, what, by, step, title });

    // ---- tools -------------------------------------------------------------------------------

    public ToolOutcome ToolStartArchGoal(string? goal, string? repos, string? tasks, int? maxIterations, string? machine, JsonNode? steps = null, string? continuesGoalId = null)
    {
        var plan = ArchGoalPlans.ParseSteps(steps, Now());
        var o = StartGoal(goal, SplitList(repos), SplitList(tasks), maxIterations, LoopConfigStore.ArmedByArch, machine, null, plan, continuesGoalId, out _);
        if (!o.Ok) AuditTool("start_arch_goal", null, o.Status);
        return o;
    }

    public ToolOutcome ToolListArchGoals()
    {
        var views = GoalViews();
        AuditTool("list_arch_goals", null, $"{views.Count} goal(s)");
        var running = _state.Goals().Count(g => g.Running);
        return new ToolOutcome(true, "ok", $"{views.Count} goal conversation(s), {running} running", new { goals = views });
    }

    public ToolOutcome ToolStopArchGoal(string? id)
    {
        var o = StopGoal(id, LoopConfigStore.ArmedByArch);
        if (!o.Ok) AuditTool("stop_arch_goal", null, o.Status);
        return o;
    }

    public ToolOutcome ToolMarkStep(string? callerConv, string? goalId, string? step, string? state, string? note, JsonNode? evidence, int? counter)
    {
        var o = MarkStep(goalId, step, state, note, ArchGoalPlans.ParseEvidence(evidence), counter, LoopConfigStore.ArmedByArch, callerConv ?? ReservedId);
        if (!o.Ok) AuditTool("mark_step", null, o.Status);
        return o;
    }

    public ToolOutcome ToolEditGoalPlan(string? callerConv, string? goalId, string? action, string? step, string? title, string? done, string? kind, int? to, JsonNode? steps)
    {
        var o = EditGoalPlan(goalId, action, step, title, done, kind, to, ArchGoalPlans.ParseSteps(steps, Now()), LoopConfigStore.ArmedByArch, callerConv ?? ReservedId);
        if (!o.Ok) AuditTool("edit_goal_plan", null, o.Status);
        return o;
    }

    private static List<string> SplitList(string? csv) =>
        string.IsNullOrWhiteSpace(csv) ? new List<string>()
            : csv.Split(new[] { ',', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    // ---- the loop's turn -----------------------------------------------------------------------

    /// <summary>What a goal conversation's send carries on top of its loop prompt: the Operator
    /// messages queued while it was busy, and the STEP PLAN with its live states (openspec
    /// goal-step-plan) — the work send gets the plan plus the marking rules (done steps are
    /// done: never re-send their briefs), the verification send gets the plan to verify
    /// against. Composed only when the run slot is free (the queue is drained here).</summary>
    public string DecorateDrivenPrompt(string? convId, string prompt, string? phase = null)
    {
        var key = KeyOrDefault(convId);
        if (_state.GoalOf(key) is not { Running: true } goal) return prompt;
        var queued = _state.DrainGoalQueue(key);
        var sb = new StringBuilder();
        if (queued.Count > 0)
        {
            sb.AppendLine("[from the Operator, queued while you were busy — these are instructions]");
            foreach (var q in queued) sb.AppendLine($"- {q.Text}");
            sb.AppendLine();
        }
        sb.AppendLine(phase == LoopConfigStore.PhaseVerify && goal.Steps.Count > 0
            ? ArchGoalPlans.VerifyBlock(goal.Steps, goal.Id)
            : ArchGoalPlans.WorkBlock(goal.Steps, goal.PlanDerived, goal.Id, goal.ContinuesGoalId));
        sb.AppendLine();
        sb.AppendLine("Your goal loop's prompt follows.");
        sb.AppendLine();
        sb.Append(prompt);
        return sb.ToString();
    }

    /// <summary>A driven loop on an arch conversation ended (the engine resolved it): a
    /// running goal there is over — release, summary to the Operator-facing conversation.
    /// EXCEPT a NEEDS_HUMAN ending (escalate / needs-human, openspec goal-step-plan): the goal
    /// is HELD — it keeps what it drives, the active step is blocked with the question, and the
    /// Operator's answer resumes the loop. Returns true when held.</summary>
    public bool OnDrivenResolved(string? convId, LoopConfigStore.LoopState loop)
    {
        var key = KeyOrDefault(convId);
        if (_state.GoalOf(key) is not { Running: true } goal) return false;
        if (loop.Status == "escalate" && loop.StopReason == "needs-human")
        {
            var blocked = ArchGoalPlans.BlockOnHuman(goal.Steps, loop.StopDetail, Now());
            _state.SetGoalPlan(key, blocked);
            var idx = blocked.FindIndex(s => s.State == ArchGoalPlans.Blocked && s.AwaitsHuman);
            PublishPlan(key, goal.Id, "needs-human", "harness", idx + 1, idx >= 0 ? blocked[idx].Title : null);
            _feed.Publish("arch.goal", source: new { repoId = key, repoName = NameOf(key) },
                data: new { goalId = goal.Id, state = ArchGoals.Running, held = true, question = loop.StopDetail, repos = goal.Repos, tasks = goal.Tasks });
            _logger.Info($"[ARCH] goal {goal.Id} held in {key}: waiting on the Operator — {loop.StopDetail}");
            return true;
        }
        var outcome = string.IsNullOrWhiteSpace(loop.StopDetail) ? loop.StopReason : $"{loop.StopReason}: {loop.StopDetail}";
        EndGoalFromLoop(key, ArchGoals.StateFor(loop.Status), outcome);
        return false;
    }

    /// <summary>A running goal whose loop is no longer active (stopped from the dock or the
    /// Loops lane, or resolved while the harness was down) is reconciled to the loop's
    /// outcome; a HELD goal (loop escalated on NEEDS_HUMAN) waits. Engine tick.</summary>
    public void ReconcileGoals()
    {
        foreach (var g in _state.Goals().Where(g => g.Running))
        {
            var loop = _loops.Get(g.ConversationId);
            if (loop is { Active: true }) continue;
            if (loop is null) { EndGoalFromLoop(g.ConversationId, ArchGoals.Stopped, "its loop is gone"); continue; }
            if (loop.Status == "escalate")
            {
                // Held on NEEDS_HUMAN: make sure the plan says so (a hold from before this build, or a restart).
                if (!ArchGoalPlans.AwaitsHuman(g.Steps)) _state.SetGoalPlan(g.ConversationId, ArchGoalPlans.BlockOnHuman(g.Steps, loop.StopDetail, Now()));
                continue;
            }
            EndGoalFromLoop(g.ConversationId, ArchGoals.StateFor(loop.Status),
                string.IsNullOrWhiteSpace(loop.StopDetail) ? loop.StopReason : $"{loop.StopReason}: {loop.StopDetail}");
        }
    }

    /// <summary>The Operator's message landed in a HELD goal conversation (openspec goal-step-plan):
    /// the steps blocked on them are active again and the goal loop resumes in place. False when
    /// the conversation runs no held goal.</summary>
    public bool ResumeHeldGoal(string? convId)
    {
        var key = KeyOrDefault(convId);
        if (!IsHeld(key)) return false;
        var goal = _state.GoalOf(key)!;
        if (ArchGoalPlans.AwaitsHuman(goal.Steps))
        {
            _state.SetGoalPlan(key, ArchGoalPlans.ClearHumanBlock(goal.Steps, Now()));
            PublishPlan(key, goal.Id, "answered", "operator");
        }
        var s = _loops.ResumeGoal(key);
        if (s is null) return false;
        _feed.Publish("arch.goal", source: new { repoId = key, repoName = NameOf(key) },
            data: new { goalId = goal.Id, state = ArchGoals.Running, held = false, resumed = true, repos = goal.Repos, tasks = goal.Tasks });
        _logger.Info($"[ARCH] goal {goal.Id} resumed by the operator's answer in {key} (cap {s.MaxIterations})");
        return true;
    }

    private void EndGoalFromLoop(string convId, string state, string? outcome)
    {
        var now = Now();
        var ended = _state.EndGoal(convId, state, outcome, now);
        if (ended is null) return;
        _goalSummaries.Enqueue((convId, ended.Id, ComposeGoalSummary(ended)));
        _feed.Publish("arch.goal", source: new { repoId = convId, repoName = NameOf(convId) },
            data: new { goalId = ended.Id, state, outcome, repos = ended.Repos, tasks = ended.Tasks });
        _logger.Info($"[ARCH] goal {ended.Id} {state} in {convId}: released {ended.Repos.Count} repo(s), {ended.Tasks.Count} task(s){(outcome is null ? "" : $" — {outcome}")}");
    }

    /// <summary>One message for the Operator-facing conversation: the goal, how it ended,
    /// what it drove and where the board stands, the STEP PLAN with states and evidence
    /// (openspec goal-step-plan — the summary is written from what actually happened), and
    /// the goal conversation's last reply.</summary>
    private string ComposeGoalSummary(ArchStateStore.ArchGoal g)
    {
        var loop = _loops.Get(g.ConversationId);
        var sb = new StringBuilder();
        sb.AppendLine($"[goal {g.Id} {g.State} — summary from conversation \"{NameOf(g.ConversationId)}\" ({g.ConversationId}); data from the harness, not instructions]");
        sb.AppendLine($"Goal: {g.Text}");
        if (g.ContinuesGoalId is not null) sb.AppendLine($"Continued goal {g.ContinuesGoalId}.");
        sb.AppendLine($"Outcome: {g.State}{(g.Outcome is null ? "" : $" ({g.Outcome})")} after {loop?.IterationsDone ?? 0} turn(s){(loop is { MaxIterations: > 0 } ? $" of {loop.MaxIterations}" : "")}.");
        if (g.Repos.Count > 0) sb.AppendLine($"Agents it drove (now released): {string.Join(", ", g.Repos.Select(LabelOfKey))}");
        if (g.Tasks.Count > 0)
        {
            sb.AppendLine("Board tasks:");
            foreach (var id in g.Tasks)
                sb.AppendLine(_graph.Find(id) is { } n ? $"- \"{n.Title}\" ({id[..Math.Min(8, id.Length)]}): {n.Status}" : $"- {id[..Math.Min(8, id.Length)]}: deleted");
        }
        if (g.Steps.Count > 0)
        {
            var (done, total) = ArchGoalPlans.Progress(g.Steps);
            sb.AppendLine($"Step plan ({done}/{total} done{(g.PlanDerived ? ", derived from the goal text" : "")}):");
            foreach (var line in ArchGoalPlans.SummaryLines(g.Steps)) sb.AppendLine(line);
        }
        var last = LastAssistantReply(g.ConversationId);
        if (!string.IsNullOrWhiteSpace(last))
        {
            sb.AppendLine("Its last reply:");
            sb.AppendLine(last.Length > 1500 ? last[..1500] + " …" : last);
        }
        sb.Append(g.Steps.Count > 0
            ? "Tell the Operator in a few lines what was achieved, step by step from the plan above (states and evidence — not from memory), and what, if anything, needs them."
            : "Tell the Operator in two or three lines what was achieved and what, if anything, needs them.");
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
