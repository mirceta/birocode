using System.Text;
using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Tools;

namespace ClaudeWeb.Services.Agents;

/// <summary>
/// Repo-agent subagents (openspec repo-agent-subagents): a repo agent spawns a goal-driven
/// conversation of its own — a SUBAGENT — in the SAME checkout, owned by the parent. The shape
/// is the arch's goal conversation, keyed by <see cref="RepoSubagentKeys"/> instead of an arch
/// conversation id: a record in <see cref="RepoSubagentStore"/>, a goal loop in the shared
/// <see cref="LoopConfigStore"/> under that key, turns run by the autopilot engine with the
/// checkout as cwd and the repo's engine / model, the repo-agent MCP server with the subagent's
/// identity in its URL (<c>?repo=X&amp;sub=Y</c>), and when it ends a summary posted as ONE turn
/// into the parent's conversation (actor <see cref="ActorSubagent"/>).
///
/// Boundaries (recorded in the Understanding app and docs/repo-agent-subagents-convention.md):
/// one WRITER at a time in a checkout — a writer subagent's turn waits for the parent's builder
/// slot and for sibling writers, and the parent's own builder send is refused while a writer
/// turn runs; read-only helpers run alongside. At most <see cref="MaxRunningPerRepo"/> running
/// per repo, caps of 1–<see cref="MaxCap"/> turns, no nesting. The parent's guards (gate,
/// claims, deploy guard) apply unchanged: a subagent turn is a loop send like any other.
/// </summary>
public sealed class RepoSubagentService
{
    public const int MaxRunningPerRepo = 3;
    public const int DefaultCap = 10;
    public const int MaxCap = 30;
    public const string ActorSubagent = "subagent";
    public const string EventType = "agent.subagent";
    private const int GitTimeoutMs = 10_000;

    private readonly RepoSubagentStore _store;
    private readonly RepositoryRegistry _repos;
    private readonly DockRegistry _dock;
    private readonly LoopConfigStore _loops;
    private readonly RunSessionService _runs;
    private readonly CliRunnerService _cli;
    private readonly SessionService _sessions;
    private readonly ToolsConfigStore _tools;
    private readonly AutopilotGate _gate;
    private readonly HarnessEventFeed _feed;
    private readonly Logger _logger;
    private readonly AutopilotAuditLog? _audit;
    private readonly MainConversationStore? _main;

    public RepoSubagentService(RepoSubagentStore store, RepositoryRegistry repos, DockRegistry dock, LoopConfigStore loops, RunSessionService runs,
        CliRunnerService cli, SessionService sessions, ToolsConfigStore tools, AutopilotGate gate, HarnessEventFeed feed, Logger logger, AutopilotAuditLog? audit = null,
        MainConversationStore? main = null)
    {
        _main = main;
        _store = store;
        _repos = repos;
        _dock = dock;
        _loops = loops;
        _runs = runs;
        _cli = cli;
        _sessions = sessions;
        _tools = tools;
        _gate = gate;
        _feed = feed;
        _logger = logger;
        _audit = audit;
    }

    public RepoSubagentStore Store => _store;

    // ---- views -----------------------------------------------------------------------------------

    public RepoSubagentStore.Subagent? Find(string? id) => _store.Find(id);

    /// <summary>A subagent as the API, the tools and the UI see it — the arch's GoalView shape,
    /// so the Subagents panel reads it with the same pure helpers.</summary>
    public object View(RepoSubagentStore.Subagent s)
    {
        var loop = _loops.Get(s.Key);
        var repo = _repos.GetAll().FirstOrDefault(r => r.Id == s.RepoId);
        var (done, total) = ArchGoalPlans.Progress(s.Plan);
        var active = ArchGoalPlans.ActiveIndex(s.Plan);
        var running = _runs.Get(s.Key)?.Status == "running";
        var held = s.IsRunning && (s.Held || loop is { Active: false, Status: "escalate" });
        return new
        {
            id = s.Id, key = s.Key, repoId = s.RepoId, repoName = repo?.Name, handle = repo?.Handle,
            name = s.Name, goal = s.Goal, state = s.State,
            busy = s.IsRunning && loop is { Active: true }, running, held,
            readOnly = s.ReadOnly, concurrent = s.Concurrent, branch = s.Branch, model = s.Model ?? repo?.Model,
            iterations = loop?.IterationsDone ?? 0, maxIterations = loop?.MaxIterations ?? s.MaxIterations,
            loopStatus = loop?.Status, loopActive = loop?.Active ?? false, stopReason = loop?.StopReason, stopDetail = loop?.StopDetail, phase = loop?.Phase,
            lastSentAt = loop?.LastSentAt ?? 0, startedAt = s.StartedAt, endedAt = s.EndedAt, startedBy = s.StartedBy, outcome = s.Outcome,
            queued = s.Queue.Count, plan = ArchGoalPlans.Views(s.Plan), planDerived = s.PlanDerived, progress = new { done, total },
            activeStep = active < 0 ? (int?)null : active + 1, blockedSteps = ArchGoalPlans.BlockedCount(s.Plan), awaitsHuman = ArchGoalPlans.AwaitsHuman(s.Plan),
            continuesId = s.ContinuesId, parentTabId = s.ParentTabId, sessionId = s.SessionId,
            summaryDelivered = s.SummaryDeliveredAt is not null, summaryPending = s.Summary is not null && s.SummaryDeliveredAt is null,
        };
    }

    public List<object> Views(string? repoId) => _store.OfRepo(repoId).Select(View).ToList();

    public sealed record Counts(int Running, int Total, int NeedsHuman, int Busy);

    /// <summary>The per-agent facts the Status tab and the peer describe carry.</summary>
    public Counts CountsOf(string repoId)
    {
        var mine = _store.OfRepo(repoId);
        var needs = mine.Count(s => s.IsRunning && (s.Held || _loops.Get(s.Key) is { Active: false, Status: "escalate" }));
        var busy = mine.Count(s => _runs.Get(s.Key)?.Status == "running");
        return new Counts(mine.Count(s => s.IsRunning), mine.Count, needs, busy);
    }

    public object? CountsJson(string repoId)
    {
        var c = CountsOf(repoId);
        return c.Total == 0 ? null : new { running = c.Running, total = c.Total, needsHuman = c.NeedsHuman, busy = c.Busy };
    }

    // ---- lifecycle ----------------------------------------------------------------------------------

    /// <summary>Start a subagent for <paramref name="repoId"/>. <paramref name="by"/> is "agent"
    /// (the parent through its tool) or "operator" (the dock lane); <paramref name="callerSub"/>
    /// set means a subagent is asking — refused (no nesting).</summary>
    public RepoAgentToolbox.ToolOutcome Start(string? repoId, string? goal, IReadOnlyList<ArchGoalPlans.Step>? steps, int? maxIterations, string? name, bool readOnly, string? model,
        string by, string? parentTabId, string? parentSessionId, string? callerSub = null, bool concurrent = false)
    {
        if (!string.IsNullOrWhiteSpace(callerSub)) return new RepoAgentToolbox.ToolOutcome(false, "nested", "a subagent cannot start a subagent: depth 1 keeps the owner readable — finish your goal and let the parent decide; nothing was started");
        var repo = _repos.GetAll().FirstOrDefault(r => r.Id == repoId);
        if (repo is null) return new RepoAgentToolbox.ToolOutcome(false, "error", $"unknown repo {repoId}");
        if (!repo.Exists) return new RepoAgentToolbox.ToolOutcome(false, "error", $"the checkout of {repo.Name} is missing ({repo.Path})");
        if (string.IsNullOrWhiteSpace(goal)) return new RepoAgentToolbox.ToolOutcome(false, "error", "goal is required: what done looks like, in one or more lines (\"STEP n — …\" lines become the plan)");
        if (!_gate.Enabled) return new RepoAgentToolbox.ToolOutcome(false, "not-accepting", "the autopilot gate is closed by the Operator (host GUI); subagents run on the loop engine, which is gated the same way — nothing was started");
        var running = _store.RunningCount(repo.Id);
        if (running >= MaxRunningPerRepo) return new RepoAgentToolbox.ToolOutcome(false, "capped", $"{repo.Name} already runs {running} subagent(s) (the cap is {MaxRunningPerRepo}); stop or wait for one — list_subagents shows them");
        var cap = Math.Clamp(maxIterations ?? DefaultCap, 1, MaxCap);
        var now = Now();
        var text = goal.Trim();
        var plan = steps is { Count: > 0 } ? steps.ToList() : ArchGoalPlans.Derive(SplitInlineSteps(text), now);
        var derived = steps is not { Count: > 0 } && plan.Count > 0;
        var branch = CurrentBranch(repo.Path);
        var title = string.IsNullOrWhiteSpace(name) ? FirstLine(text) : name!;
        var sub = _store.Start(repo.Id, title, text, by, now, cap, readOnly, model, branch, parentTabId, parentSessionId, plan, derived, null, concurrent);
        var loop = _loops.StartGoal(sub.Key, LoopGoalText(sub, repo, branch), cap, LoopConfigStore.ModeDrive, null, null, by);
        var (done, total) = ArchGoalPlans.Progress(sub.Plan);
        Audit("start_subagent", repo, $"subagent {sub.Id} \"{sub.Name}\" by {by}: cap {cap}, plan {total} step(s){(derived ? " derived" : "")}{(readOnly ? ", read-only" : sub.Concurrent ? ", concurrent" : "")}");
        Publish(sub, "started", new { by, cap, steps = total, readOnly });
        _logger.Info($"[SUBAGENT] {repo.Name}: {sub.Id} \"{sub.Name}\" started by {by} (cap {cap}, plan {done}/{total}{(derived ? " derived" : "")}{(readOnly ? ", read-only" : "")}, branch {branch ?? "?"}, parent tab {parentTabId ?? "-"}, parent session {Short(parentSessionId)})");
        var planWords = total == 0 ? "no step plan yet (declare one with edit_subagent_plan on its first turn)" : $"{total}-step plan{(derived ? " derived from the goal text" : "")}";
        return new RepoAgentToolbox.ToolOutcome(true, "started",
            $"subagent {sub.Id} \"{sub.Name}\" runs in {repo.Name}'s checkout on branch {branch ?? "?"}{(readOnly ? " as a READ-ONLY helper" : sub.Concurrent ? " as a CONCURRENT writer (you asserted it touches different files; it runs alongside you, no lock)" : " as a writer")}; cap {loop.MaxIterations} turn(s); {planWords}. It works when you are idle (the engine waits for your builder slot), marks its steps, and its summary arrives in this conversation as a turn tagged subagent when it ends. Carry on with your own work; list_subagents shows its state.",
            View(sub));
    }

    public RepoAgentToolbox.ToolOutcome Stop(string? id, string by)
    {
        var sub = _store.Find(id);
        if (sub is null) return new RepoAgentToolbox.ToolOutcome(false, "error", $"no subagent \"{id}\"; list_subagents shows the ids");
        if (!sub.IsRunning) return new RepoAgentToolbox.ToolOutcome(true, sub.State, $"subagent {sub.Id} already ended ({sub.State}); nothing to stop", View(sub));
        _loops.Stop(sub.Key, by);
        if (_runs.Get(sub.Key) is { Status: "running" } run) run.RequestStop();
        var ended = End(sub, RepoSubagentStore.Stopped, $"stopped by {by}");
        Audit("stop_subagent", null, $"subagent {sub.Id} stopped by {by}");
        return new RepoAgentToolbox.ToolOutcome(true, "stopped", $"subagent {sub.Id} \"{sub.Name}\" stopped; its summary reaches the parent conversation on the next idle moment", View(ended ?? sub));
    }

    /// <summary>A message for a subagent: queued for its next send while it runs; the ANSWER that
    /// resumes it when it is held on NEEDS_HUMAN; a plain follow-up turn in its session when it
    /// has ended (so the parent or the Operator can ask it something afterwards).</summary>
    public RepoAgentToolbox.ToolOutcome Message(string? id, string? text, string by)
    {
        var sub = _store.Find(id);
        if (sub is null) return new RepoAgentToolbox.ToolOutcome(false, "error", $"no subagent \"{id}\"");
        if (string.IsNullOrWhiteSpace(text)) return new RepoAgentToolbox.ToolOutcome(false, "error", "text is required");
        var now = Now();
        if (sub.IsRunning)
        {
            var loop = _loops.Get(sub.Key);
            var held = sub.Held || loop is { Active: false, Status: "escalate" };
            if (ArchGoalPlans.AwaitsHuman(sub.Plan))
            {
                _store.SetPlan(sub.Id, ArchGoalPlans.ClearHumanBlock(sub.Plan, now));
                Publish(sub, "answered", new { by });
            }
            var queued = _store.Queue(sub.Id, text, now)!;
            if (held)
            {
                _store.SetHeld(sub.Id, false);
                var s = _loops.ResumeGoal(sub.Key);
                _logger.Info($"[SUBAGENT] {sub.Id} resumed by {by}'s answer{(s is null ? " (loop could not resume — it will be reconciled)" : $" (cap {s.MaxIterations})")}");
                return new RepoAgentToolbox.ToolOutcome(true, "resumed", $"answer queued for subagent {sub.Id}; its loop is armed again and carries it on the next send", View(_store.Find(sub.Id)!));
            }
            return new RepoAgentToolbox.ToolOutcome(true, "queued", $"queued for subagent {sub.Id}; its next send carries it ({queued.Queue.Count} waiting)", View(queued));
        }
        // Ended: a follow-up turn in its own session, under the one-writer rule.
        var repo = _repos.GetAll().FirstOrDefault(r => r.Id == sub.RepoId);
        if (repo is null) return new RepoAgentToolbox.ToolOutcome(false, "error", $"the repo of subagent {sub.Id} is no longer registered");
        if (string.IsNullOrWhiteSpace(sub.SessionId)) return new RepoAgentToolbox.ToolOutcome(false, "error", $"subagent {sub.Id} never spoke (no session); start a new one instead");
        if (!sub.ReadOnly && WriterBlock(sub.Key) is { } block) return new RepoAgentToolbox.ToolOutcome(false, "busy", $"{block}; try again when it is idle");
        if (!_runs.TryBeginRun(sub.Key, "builder", out var session)) return new RepoAgentToolbox.ToolOutcome(false, "busy", $"subagent {sub.Id} is running a turn");
        RunTurn(session, repo, sub, text.Trim(), sub.SessionId, by == LoopConfigStore.ArmedByAgent ? "parent" : ArchAgentService.ActorHuman);
        return new RepoAgentToolbox.ToolOutcome(true, "sent", $"sent to the ended subagent {sub.Id} as a follow-up turn in its own session (it does not re-arm its loop)", View(sub));
    }

    public RepoAgentToolbox.ToolOutcome MarkStep(string? id, string? stepRef, string? state, string? note, ArchGoalPlans.Evidence? evidence, int? counter, string by, string? callerSub)
    {
        var (sub, err) = ForTool(id, callerSub);
        if (sub is null) return new RepoAgentToolbox.ToolOutcome(false, "error", err!);
        if (callerSub is not null && !string.Equals(callerSub, sub.Id, StringComparison.Ordinal))
            return new RepoAgentToolbox.ToolOutcome(false, "not-owner", $"only subagent {sub.Id} marks its own steps; the parent and the Operator mark from the Subagents lane");
        var st = ArchGoalPlans.NormalizeState(state);
        if (st.Length == 0) return new RepoAgentToolbox.ToolOutcome(false, "error", "state must be one of pending | active | done | blocked | skipped");
        var idx = ArchGoalPlans.FindIndex(sub.Plan, stepRef);
        if (idx == -2) return new RepoAgentToolbox.ToolOutcome(false, "error", $"\"{stepRef}\" names more than one step; use its number");
        if (idx < 0) return new RepoAgentToolbox.ToolOutcome(false, "error", sub.Plan.Count == 0 ? $"subagent {sub.Id} has no plan yet — edit_subagent_plan(action: \"set\", steps: […]) first" : $"no step \"{stepRef}\" in subagent {sub.Id}'s plan (1–{sub.Plan.Count})");
        var updated = ArchGoalPlans.Mark(sub.Plan, idx, st, note, evidence, counter, Now());
        var saved = _store.SetPlan(sub.Id, updated);
        if (saved is null) return new RepoAgentToolbox.ToolOutcome(false, "error", "the subagent vanished");
        var step = updated[idx];
        var (done, total) = ArchGoalPlans.Progress(updated);
        Publish(saved, st, new { by, step = idx + 1, title = step.Title });
        _logger.Info($"[SUBAGENT] {sub.Id} step {idx + 1}/{total} \"{step.Title}\" {st} ({done}/{total} done) by {by}");
        return new RepoAgentToolbox.ToolOutcome(true, "marked", $"step {idx + 1} \"{step.Title}\" is {st}; {done}/{total} done", View(saved));
    }

    public RepoAgentToolbox.ToolOutcome EditPlan(string? id, string? action, string? stepRef, string? title, string? done, string? kind, int? to, IReadOnlyList<ArchGoalPlans.Step>? steps, string by, string? callerSub)
    {
        var (sub, err) = ForTool(id, callerSub);
        if (sub is null) return new RepoAgentToolbox.ToolOutcome(false, "error", err!);
        // The subagent edits its own plan; the parent (no callerSub) and the Operator edit any of the repo's.
        if (callerSub is not null && !string.Equals(callerSub, sub.Id, StringComparison.Ordinal))
            return new RepoAgentToolbox.ToolOutcome(false, "not-owner", $"only subagent {sub.Id} (or its parent / the Operator) edits its plan");
        var (updated, error) = ArchGoalPlans.Edit(sub.Plan, action, stepRef, title, done, kind, to, steps, Now());
        if (updated is null) return new RepoAgentToolbox.ToolOutcome(false, "error", error!);
        var saved = _store.SetPlan(sub.Id, updated, derived: false);
        if (saved is null) return new RepoAgentToolbox.ToolOutcome(false, "error", "the subagent vanished");
        Publish(saved, $"plan-{(action ?? "").Trim().ToLowerInvariant()}", new { by });
        return new RepoAgentToolbox.ToolOutcome(true, "edited", $"plan of subagent {sub.Id}: {updated.Count} step(s) — {string.Join("; ", updated.Select((s, i) => $"{i + 1}. {s.Title} ({s.State})"))}", View(saved));
    }

    /// <summary>Continue an ENDED subagent in place: running again with its plan carried over
    /// (done steps stay done), on the SAME session when it has one, with a fresh cap.</summary>
    public RepoAgentToolbox.ToolOutcome Continue(string? id, int? maxIterations, string by)
    {
        var sub = _store.Find(id);
        if (sub is null) return new RepoAgentToolbox.ToolOutcome(false, "error", $"no subagent \"{id}\"");
        if (sub.IsRunning) return new RepoAgentToolbox.ToolOutcome(false, "running", $"subagent {sub.Id} is still running");
        var repo = _repos.GetAll().FirstOrDefault(r => r.Id == sub.RepoId);
        if (repo is null) return new RepoAgentToolbox.ToolOutcome(false, "error", "its repo is no longer registered");
        if (!_gate.Enabled) return new RepoAgentToolbox.ToolOutcome(false, "not-accepting", "the autopilot gate is closed by the Operator");
        if (_store.RunningCount(repo.Id) >= MaxRunningPerRepo) return new RepoAgentToolbox.ToolOutcome(false, "capped", $"{repo.Name} already runs {MaxRunningPerRepo} subagents");
        var cap = Math.Clamp(maxIterations ?? sub.MaxIterations, 1, MaxCap);
        var reopened = _store.Reopen(sub.Id, Now(), cap)!;
        _loops.StartGoal(reopened.Key, LoopGoalText(reopened, repo, reopened.Branch), cap, LoopConfigStore.ModeDrive, reopened.SessionId, null, by);
        Publish(reopened, "continued", new { by, cap });
        var (done, total) = ArchGoalPlans.Progress(reopened.Plan);
        _logger.Info($"[SUBAGENT] {sub.Id} continued by {by} (cap {cap}, plan {done}/{total})");
        return new RepoAgentToolbox.ToolOutcome(true, "continued", $"subagent {sub.Id} runs again with its plan carried over ({done}/{total} already done), cap {cap}", View(reopened));
    }

    public bool Remove(string? id)
    {
        var sub = _store.Find(id);
        if (sub is null || sub.IsRunning) return false;
        return _store.Remove(sub.Id);
    }

    // ---- the engine's hooks ------------------------------------------------------------------------

    /// <summary>The active subagent loops — ticked by the engine after the repos and the arch.</summary>
    public IReadOnlyList<LoopConfigStore.LoopState> ActiveLoops() =>
        _loops.All().Where(l => RepoSubagentKeys.IsKey(l.RepoId) && l.Active).ToList();

    /// <summary>The synthetic repo the engine ticks a subagent as: the parent's checkout with the
    /// subagent's key as id — Path, Provider and Model are what the CLI run needs.</summary>
    public RepositoryRegistry.RepositoryInfo InfoFor(string key)
    {
        var sub = _store.FindByKey(key);
        var repo = sub is null ? null : _repos.GetAll().FirstOrDefault(r => r.Id == sub.RepoId);
        if (sub is null || repo is null)
            return new RepositoryRegistry.RepositoryInfo(key, key, "", false, false, false, "advanced", null, Array.Empty<RepositoryRegistry.LocalAppInfo>());
        return new RepositoryRegistry.RepositoryInfo(key, $"{repo.Name} ⑂ {sub.Name}", repo.Path, repo.Exists, repo.IsGitRepo, false, repo.Visibility, null,
            Array.Empty<RepositoryRegistry.LocalAppInfo>(), repo.Handle, repo.Provider, sub.Model ?? repo.Model);
    }

    /// <summary>A subagent resumes ITS OWN session only: the loop pin, else the session the record
    /// holds; null = its first turn starts a fresh CLI session. Never the newest transcript in the
    /// folder — that is the parent's (or a sibling's) conversation.</summary>
    public string? ResolveSessionId(string key)
    {
        var pinned = _loops.Get(key)?.SessionId;
        if (!string.IsNullOrWhiteSpace(pinned)) return pinned;
        return _store.FindByKey(key)?.SessionId;
    }

    public bool IsReadOnly(string key) => _store.FindByKey(key)?.ReadOnly ?? false;

    /// <summary>Why a WRITER subagent must wait before its turn: the parent's builder slot is
    /// busy, or a sibling writer runs. Null = go. Read-only helpers never wait.</summary>
    public string? WriterBlock(string key)
    {
        if (RepoSubagentKeys.Parse(key) is not { } p) return null;
        var sub = _store.Find(p.SubagentId);
        if (sub is null || sub.ReadOnly || sub.Concurrent) return null;   // helpers and concurrent writers never wait
        if (_runs.IsBusy(p.RepoId)) return "the parent agent is running a turn in this checkout";
        var sibling = _store.OfRepo(p.RepoId).FirstOrDefault(s => s.Id != sub.Id && !s.ReadOnly && !s.Concurrent && _runs.Get(s.Key)?.Status == "running");
        return sibling is null ? null : $"sibling subagent {sibling.Id} \"{sibling.Name}\" is writing in this checkout";
    }

    /// <summary>The writer subagent whose turn runs in <paramref name="repoId"/>'s checkout right
    /// now, for the parent's 409 — null when the checkout is free for the parent.</summary>
    public RepoSubagentStore.Subagent? WriterRunning(string repoId) =>
        _store.OfRepo(repoId).FirstOrDefault(s => !s.ReadOnly && !s.Concurrent && _runs.Get(s.Key)?.Status == "running");

    /// <summary>What a subagent's send carries on top of its loop prompt: the queued messages
    /// (from the parent or the Operator) and the step plan with its live states (openspec
    /// goal-step-plan — the same blocks the arch uses).</summary>
    public string DecoratePrompt(string key, string prompt, string? phase)
    {
        var sub = _store.FindByKey(key);
        if (sub is null || !sub.IsRunning) return prompt;
        var queued = _store.Drain(sub.Id);
        var sb = new StringBuilder();
        if (queued.Count > 0)
        {
            sb.AppendLine("[messages queued for you while you were busy — from your parent agent or the Operator; these are instructions]");
            foreach (var q in queued) sb.AppendLine($"- {q.Text}");
            sb.AppendLine();
        }
        sb.AppendLine(phase == LoopConfigStore.PhaseVerify && sub.Plan.Count > 0
            ? ArchGoalPlans.VerifyBlock(sub.Plan, sub.Id).Replace("hub_files, read_transcript, list_tasks", "the files, the build, the tests")
            : ArchGoalPlans.WorkBlock(sub.Plan, sub.PlanDerived, sub.Id, sub.ContinuesId).Replace("edit_goal_plan", "edit_subagent_plan"));
        sb.AppendLine();
        sb.AppendLine("Your goal loop's prompt follows.");
        sb.AppendLine();
        sb.Append(prompt);
        return sb.ToString();
    }

    /// <summary>The engine resolved a subagent's loop: NEEDS_HUMAN holds it (the active step is
    /// blocked with the question; an answer resumes the loop); anything else ends it and queues
    /// the summary for the parent.</summary>
    public void OnResolved(string key, LoopConfigStore.LoopState loop)
    {
        var sub = _store.FindByKey(key);
        if (sub is null || !sub.IsRunning) return;
        if (loop.Status == "escalate" && loop.StopReason == "needs-human")
        {
            var blocked = ArchGoalPlans.BlockOnHuman(sub.Plan, loop.StopDetail, Now());
            _store.SetPlan(sub.Id, blocked);
            _store.SetHeld(sub.Id, true);
            Publish(sub, "needs-human", new { question = loop.StopDetail });
            _logger.Info($"[SUBAGENT] {sub.Id} held: waiting on an answer — {loop.StopDetail}");
            return;
        }
        var outcome = string.IsNullOrWhiteSpace(loop.StopDetail) ? loop.StopReason : $"{loop.StopReason}: {loop.StopDetail}";
        End(sub, ArchGoals.StateFor(loop.Status), outcome);
    }

    public void NoteSession(string key, string? sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId) || RepoSubagentKeys.Parse(key) is not { } p) return;
        _store.SetSession(p.SubagentId, sessionId);
    }

    /// <summary>The MCP config of a subagent's turn: the repo's servers plus the harness server
    /// with the subagent's identity in its URL.</summary>
    public string? McpConfigJson(string key)
    {
        if (RepoSubagentKeys.Parse(key) is not { } p) return null;
        return _tools.BuildMcpConfigJson(p.RepoId, _repos.GetAll().Select(r => r.Path), p.SubagentId);
    }

    /// <summary>A running subagent whose loop is gone or resolved while nobody watched (a restart,
    /// a stop from the Loops lane) is reconciled; a held one waits. Engine tick.</summary>
    public void Reconcile()
    {
        foreach (var s in _store.All().Where(s => s.IsRunning))
        {
            var loop = _loops.Get(s.Key);
            if (loop is { Active: true }) continue;
            if (loop is null) { End(s, RepoSubagentStore.Stopped, "its loop is gone"); continue; }
            if (loop.Status == "escalate")
            {
                if (!ArchGoalPlans.AwaitsHuman(s.Plan)) _store.SetPlan(s.Id, ArchGoalPlans.BlockOnHuman(s.Plan, loop.StopDetail, Now()));
                if (!s.Held) _store.SetHeld(s.Id, true);
                continue;
            }
            End(s, ArchGoals.StateFor(loop.Status), string.IsNullOrWhiteSpace(loop.StopDetail) ? loop.StopReason : $"{loop.StopReason}: {loop.StopDetail}");
        }
    }

    /// <summary>Posts the oldest undelivered summary into its PARENT's conversation as one turn
    /// tagged subagent, when the parent's checkout is free. One per tick. Engine tick.</summary>
    public void DeliverSummaries()
    {
        foreach (var s in _store.UndeliveredSummaries())
        {
            var repo = _repos.GetAll().FirstOrDefault(r => r.Id == s.RepoId);
            if (repo is null || !repo.Exists)
            {
                _store.MarkSummaryDelivered(s.Id, Now());
                _logger.Error($"[SUBAGENT] {s.Id}: summary dropped — its repo is gone");
                continue;
            }
            if (_runs.IsBusy(repo.Id) || WriterRunning(repo.Id) is not null) return;
            if (!_runs.TryBeginRun(repo.Id, "builder", out var session)) return;
            _store.MarkSummaryDelivered(s.Id, Now());
            var parentSession = ParentSession(s, repo);
            session.ResumedFrom = parentSession;
            _logger.Info($"[SUBAGENT] {s.Id}: summary → parent {repo.Name} (session {Short(parentSession) ?? "new"})");
            RunParentTurn(session, repo, s.Summary!, parentSession, s);
            return;
        }
    }

    // ---- internals -----------------------------------------------------------------------------------

    private (RepoSubagentStore.Subagent? Sub, string? Error) ForTool(string? id, string? callerSub)
    {
        if (!string.IsNullOrWhiteSpace(id))
        {
            var s = _store.Find(id);
            return s is null ? (null, $"no subagent \"{id}\"; list_subagents shows the ids") : (s, null);
        }
        if (!string.IsNullOrWhiteSpace(callerSub))
        {
            var own = _store.Find(callerSub);
            return own is null ? (null, "this subagent's record is gone") : (own, null);
        }
        return (null, "id is required (list_subagents shows the ids)");
    }

    private RepoSubagentStore.Subagent? End(RepoSubagentStore.Subagent sub, string state, string? outcome)
    {
        var loop = _loops.Get(sub.Key);
        var summary = ComposeSummary(sub, loop, state, outcome);
        var ended = _store.End(sub.Id, state, outcome, summary, Now());
        if (ended is null) return null;
        Publish(ended, state, new { outcome });
        _logger.Info($"[SUBAGENT] {sub.Id} \"{sub.Name}\" {state}{(outcome is null ? "" : $" — {outcome}")}; summary queued for the parent");
        return ended;
    }

    /// <summary>The message the parent gets: the goal, how it ended, the step plan with evidence,
    /// the subagent's last reply — data, not instructions.</summary>
    public string ComposeSummary(RepoSubagentStore.Subagent s, LoopConfigStore.LoopState? loop, string state, string? outcome)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"[subagent {s.Id} \"{s.Name}\" {state} — summary from the harness, not instructions from a person]");
        sb.AppendLine($"Goal: {s.Goal}");
        sb.AppendLine($"Outcome: {state}{(outcome is null ? "" : $" ({outcome})")} after {loop?.IterationsDone ?? 0} turn(s){(loop is { MaxIterations: > 0 } ? $" of {loop.MaxIterations}" : "")}{(s.ReadOnly ? "; it was a read-only helper" : $"; it worked on branch {s.Branch ?? "?"} in your checkout{(s.Concurrent ? ", alongside you" : "")}")}.");
        if (s.Plan.Count > 0)
        {
            var (done, total) = ArchGoalPlans.Progress(s.Plan);
            sb.AppendLine($"Step plan ({done}/{total} done{(s.PlanDerived ? ", derived from the goal text" : "")}):");
            foreach (var line in ArchGoalPlans.SummaryLines(s.Plan)) sb.AppendLine(line);
        }
        var last = LastAssistantReply(s);
        if (!string.IsNullOrWhiteSpace(last))
        {
            sb.AppendLine("Its last reply:");
            sb.AppendLine(last.Length > 1500 ? last[..1500] + " …" : last);
        }
        sb.Append("Take it from here: check its work in the checkout (git status / diff on your branch), tell the Operator in a few lines what the subagent achieved and what, if anything, needs them, then continue your own task.");
        return sb.ToString();
    }

    private string? LastAssistantReply(RepoSubagentStore.Subagent s)
    {
        try
        {
            var repo = _repos.GetAll().FirstOrDefault(r => r.Id == s.RepoId);
            var sid = _loops.Get(s.Key)?.SessionId ?? s.SessionId;
            if (repo is null || sid is null) return null;
            return _sessions.GetMessages(repo.Path, sid).LastOrDefault(m => m.Role == "assistant" && !m.Synthetic)?.Text?.Trim();
        }
        catch { return null; }
    }

    /// <summary>The parent's CURRENT session: the parent tab's (the dock keeps it current across
    /// forks), else the last builder run's, else the one recorded at start, else a fresh one.</summary>
    private string? ParentSession(RepoSubagentStore.Subagent s, RepositoryRegistry.RepositoryInfo repo)
    {
        if (_main?.Get(repo.Id) is { } main) return main;
        var tab = s.ParentTabId is null ? null : _dock.GetAll().FirstOrDefault(t => t.Id == s.ParentTabId);
        if (!string.IsNullOrWhiteSpace(tab?.SessionId)) return tab!.SessionId;
        var run = _runs.Get(repo.Id)?.SessionId;
        if (!string.IsNullOrWhiteSpace(run)) return run;
        if (!string.IsNullOrWhiteSpace(s.ParentSessionId)) return s.ParentSessionId;
        var any = _dock.GetAll().Where(t => t.RepoId == repo.Id && !string.IsNullOrWhiteSpace(t.SessionId)).OrderByDescending(t => t.Dashboard).ThenByDescending(t => t.CreatedAt).FirstOrDefault();
        return any?.SessionId;
    }

    private void RunParentTurn(RunSession session, RepositoryRegistry.RepositoryInfo repo, string text, string? sessionId, RepoSubagentStore.Subagent s)
    {
        _audit?.Record(new AutopilotAuditLog.Entry(Now(), repo.Id, repo.Name, text, 1.0, "", "loop", false, 0, "subagent", "summary"));
        _ = Task.Run(async () =>
        {
            try
            {
                await session.EmitAsync(new { type = "user", text, actor = ActorSubagent });
                await _cli.RunAsync(text, sessionId, workingDirectory: repo.Path, emit: session.EmitAsync, ct: session.Cts.Token,
                    repoId: repo.Id, repoName: repo.Name, provider: repo.Provider);
            }
            catch (Exception ex) { _logger.Error($"[SUBAGENT] summary turn for \"{repo.Name}\" crashed: {ex.Message}"); }
            finally
            {
                session.Complete();
                FollowSession(repo.Id, sessionId, session.SessionId, s.ParentTabId);
            }
        });
    }

    private void RunTurn(RunSession session, RepositoryRegistry.RepositoryInfo repo, RepoSubagentStore.Subagent s, string text, string? sessionId, string actor)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                await session.EmitAsync(new { type = "user", text, actor });
                await _cli.RunAsync(text, sessionId, workingDirectory: repo.Path, model: s.Model ?? repo.Model, emit: session.EmitAsync, ct: session.Cts.Token,
                    readOnly: s.ReadOnly, repoId: s.Key, repoName: $"{repo.Name} ⑂ {s.Name}", mcpConfigJson: McpConfigJson(s.Key), provider: repo.Provider);
            }
            catch (Exception ex) { _logger.Error($"[SUBAGENT] follow-up turn for {s.Id} crashed: {ex.Message}"); }
            finally
            {
                session.Complete();
                NoteSession(s.Key, session.SessionId);
            }
        });
    }

    /// <summary>The parent's docks follow the forked session (as the arch's sends do), so the
    /// chat reloads on the conversation that now holds the summary.</summary>
    private void FollowSession(string repoId, string? oldSession, string? newSession, string? parentTabId)
    {
        if (string.IsNullOrWhiteSpace(newSession) || string.Equals(oldSession, newSession, StringComparison.Ordinal)) return;
        foreach (var t in _dock.GetAll().Where(t => t.RepoId == repoId && (t.Id == parentTabId || (oldSession is not null && string.Equals(t.SessionId, oldSession, StringComparison.Ordinal)))))
            _dock.Update(t.Id, newSession, null, null, null, null, null, null, null, null, null);
    }

    /// <summary>The goal text the subagent's loop is armed with: the goal plus the BOUNDARIES —
    /// who it is, where it works, the branch rule, one writer, the markers.</summary>
    public static string LoopGoalText(RepoSubagentStore.Subagent s, RepositoryRegistry.RepositoryInfo repo, string? branch)
    {
        var sb = new StringBuilder();
        sb.AppendLine(s.Goal.Trim());
        sb.AppendLine();
        sb.Append($"(subagent {s.Id} \"{s.Name}\" of the repo agent {repo.Name}) You are a SUBAGENT: a separate conversation in the SAME checkout as your parent agent ({repo.Path}). ");
        sb.Append(s.ReadOnly
            ? "You are a READ-ONLY helper: investigate, read, run read-only checks and report findings; do NOT create, modify or delete files, and do not run commands that change state. "
            : s.Concurrent
                ? $"You run AT THE SAME TIME as your parent in this checkout: it asserted your work touches different files than its own. Touch ONLY the files your goal names or clearly implies; never reformat, move or bulk-edit anything else; never run git commands that change the working tree or index for files outside yours (no checkout, reset, stash, clean, add -A). Stay on the branch you find ({branch ?? "the current branch"}): never switch, create, merge, rebase, push or deploy unless the goal says so; commit ONLY your own files (git add <paths>) when the goal asks for commits. "
                : $"You are the only writer while your turn runs (the parent waits). Stay on the branch you find ({branch ?? "the current branch"}): never switch, create, merge, rebase, push or deploy unless the goal text above says so; commit on it when the goal asks for commits. ");
        sb.Append("Mark your steps as you go (mark_step; edit_subagent_plan when the plan must change). Never start a subagent yourself. When the whole goal is genuinely achieved, end your reply with LOOP_DONE as the final line; when blocked on a decision only a person can make, end with NEEDS_HUMAN: <your question> and stop — your parent or the Operator answers and you resume. Your summary reaches the parent's conversation when you end.");
        return sb.ToString();
    }

    private static readonly System.Text.RegularExpressions.Regex InlineStep = new(@"\s+(?=STEP\s+\d{1,2}\s*[—–:.)-])", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    /// <summary>An agent often writes its goal on ONE line with inline "STEP 1 — … STEP 2 — …" markers;
    /// the plan derivation reads one step per line, so the markers are put on their own lines first.
    /// Text without inline markers is returned unchanged.</summary>
    public static string SplitInlineSteps(string text) => InlineStep.Replace(text ?? "", "\n");

    private static string FirstLine(string text)
    {
        var line = text.Replace("\r\n", "\n").Split('\n').Select(l => l.Trim()).FirstOrDefault(l => l.Length > 0) ?? "subagent";
        return line.Length > 60 ? line[..60].TrimEnd() : line;
    }

    private static string? CurrentBranch(string path)
    {
        try
        {
            var r = ProcessProbe.Run("git", new[] { "-C", path, "rev-parse", "--abbrev-ref", "HEAD" }, GitTimeoutMs);
            return r.ExitCode == 0 && !r.TimedOut ? r.StdOut.Trim() : null;
        }
        catch { return null; }
    }

    private void Publish(RepoSubagentStore.Subagent s, string what, object data)
    {
        try
        {
            var repo = _repos.GetAll().FirstOrDefault(r => r.Id == s.RepoId);
            _feed.Publish(EventType, source: new { repoId = s.RepoId, repoName = repo?.Name ?? s.RepoId },
                data: new { subagentId = s.Id, name = s.Name, state = s.State, what, key = s.Key, detail = data });
        }
        catch { /* best effort */ }
    }

    private void Audit(string tool, RepositoryRegistry.RepositoryInfo? repo, string outcome) =>
        _audit?.Record(new AutopilotAuditLog.Entry(Now(), repo?.Id ?? "", repo?.Name ?? "", "", 1.0, outcome, "tool", false, 0, "agent", tool));

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private static string? Short(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Length > 8 ? s[..8] : s;
}
