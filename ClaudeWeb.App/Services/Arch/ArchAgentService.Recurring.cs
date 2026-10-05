using System.Text.Json;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Recurring;

namespace ClaudeWeb.Services.Arch;

/// <summary>The recurring-task engine's window onto the harness (openspec recurring-tasks):
/// the agent's situation, arming / probing / stopping its goal loop, borrowing the loop
/// slot, and the last reply — locally through the same stores the dock's Loop panel uses
/// (<see cref="LoopArmer"/>, <see cref="LoopConfigStore"/>), for a peer's agent through the
/// fleet's existing peer loop API (<c>POST /api/arch/peer/loop</c>, openspec arch-loop-tools).
/// No new way to reach an agent is introduced here.</summary>
public partial class ArchAgentService : IRecurringPort
{
    string IRecurringPort.Label(string? sourceId, string repoId) => AgentLabelOf(sourceId, repoId);

    private CollectorService.SourceView? RecurringSource(string? sourceId) =>
        string.IsNullOrWhiteSpace(sourceId) || sourceId == CollectorService.SelfId ? null : _collector.ResolveSource(sourceId);

    private static bool IsSelfSource(string? sourceId) => string.IsNullOrWhiteSpace(sourceId) || sourceId == CollectorService.SelfId;

    AgentSituation IRecurringPort.Situation(string? sourceId, string repoId)
    {
        if (IsSelfSource(sourceId))
        {
            var repo = _repos.GetAll().FirstOrDefault(r => r.Id == repoId);
            if (repo is null) return new AgentSituation(false, SelfLabel, repoId, false, false, null, false, null, "the repo is no longer registered on this harness");
            if (!repo.Exists) return new AgentSituation(false, SelfLabel, repo.Name, false, false, null, false, null, $"{repo.Name}'s folder is missing: {repo.Path}");
            var loop = _loops.Get(repo.Id);
            var gs = ReadGitState(repo);
            return new AgentSituation(true, SelfLabel, repo.Name, _runs.IsBusy(repo.Id), loop?.Active == true, loop?.ArmedBy,
                OnDefault(gs.Branch, gs.DefaultBranch), _overview.Current()?.Claude?.Usage?.Session?.Percent);
        }
        var src = RecurringSource(sourceId);
        if (src is null) return new AgentSituation(false, sourceId ?? "?", repoId, false, false, null, false, null, $"machine {sourceId} is no longer a fleet source");
        if (!src.AllowSends) return new AgentSituation(false, src.Label, repoId, false, false, null, false, null, $"the operator has not allowed sends to {src.Label} (events app / Arch tab: allow sends)");
        var (snap, r, block) = RemotePosture(src, repoId, refresh: true);
        var name = r?.Name ?? repoId;
        if (block is not null) return new AgentSituation(false, src.Label, name, false, false, null, false, null, block.Reason);
        var probe = ((IRecurringPort)this).ProbeLoop(sourceId, repoId);
        if (probe is null) return new AgentSituation(false, src.Label, name, false, false, null, false, null, $"{src.Label} did not answer about its loops");
        return new AgentSituation(true, src.Label, name, r?.RunningSince is not null, probe.Active, probe.ArmedBy,
            OnDefault(r?.Branch, r?.DefaultBranch), snap.Info?.Overview?.Claude?.Usage?.Session?.Percent);
    }

    PortResult IRecurringPort.ArmGoal(string? sourceId, string repoId, string goal, int maxTurns)
    {
        if (!_gate.Enabled) return new PortResult(false, "not-accepting", $"the autopilot gate on {SelfLabel} is closed by the operator");
        var p = new ArchLoopTools.LoopParams(Kind: LoopConfigStore.KindGoal, Mode: LoopConfigStore.ModeDrive, Goal: goal, MaxIterations: maxTurns);
        if (IsSelfSource(sourceId))
        {
            var repo = _repos.GetAll().FirstOrDefault(r => r.Id == repoId);
            if (repo is null || !repo.Exists) return new PortResult(false, "error", "the repo is gone");
            if (_loops.Get(repo.Id)?.Active == true) return new PortResult(false, "busy", "the agent's loop slot is in use");
            // Borrow the slot: remember what the Operator had there ("" = nothing).
            var snapshot = _loops.SnapshotInactive(repo.Id) ?? "";
            var o = Armer.Start(repo.Id, repo.Name, p, LoopConfigStore.ArmedByRecurring, ResolveRepoSession(repo));
            AuditTool("recurring", repo.Id, o.Ok ? o.Audit : $"refused: {o.Status}");
            if (!o.Ok) return new PortResult(false, o.Status, o.Detail);
            _logger.Info($"[ARCH] recurring task armed a goal loop on \"{repo.Name}\" (cap {maxTurns})");
            return new PortResult(true, "armed", o.Detail, o.State!.ArmedAt, o.State.SessionId, snapshot);
        }
        var src = RecurringSource(sourceId);
        if (src is null) return new PortResult(false, "error", $"machine {sourceId} is no longer a fleet source");
        var key = ArchStateStore.FleetKey(src.Id, repoId);
        var remote = _fleet.Loop(src.Id, new { action = "start", repoId, from = SelfLabel, @override = true, kind = p.Kind, mode = p.Mode, goal = p.Goal, maxIterations = p.MaxIterations, by = LoopConfigStore.ArmedByRecurring });
        AuditTool("recurring", key, remote.Status);
        if (!remote.Ok) return new PortResult(false, remote.Status, $"{src.Label}: {remote.Detail}");
        return new PortResult(true, "armed", $"{src.Label}: {remote.Detail}", LongOf(remote.Data, "armedAt"), null, null);
    }

    LoopProbe? IRecurringPort.ProbeLoop(string? sourceId, string repoId)
    {
        if (IsSelfSource(sourceId))
        {
            var s = _loops.Get(repoId);
            return s is null ? new LoopProbe(false, "none", null, null, 0, null, 0, null)
                : new LoopProbe(s.Active, s.Status, s.StopReason, s.StopDetail, s.IterationsDone, s.Phase, s.ArmedAt, s.ArmedBy, s.SessionId);
        }
        var src = RecurringSource(sourceId);
        if (src is null) return null;
        var o = _fleet.Loops(src.Id, repoId);
        if (!o.Ok || o.Data is not JsonElement arr || arr.ValueKind != JsonValueKind.Array) return null;
        foreach (var el in arr.EnumerateArray())
        {
            if (StringOf(el, "repoId") != repoId) continue;
            if (StringOf(el, "state") == "none") return new LoopProbe(false, "none", null, null, 0, null, 0, null);
            return new LoopProbe(el.TryGetProperty("active", out var a) && a.ValueKind == JsonValueKind.True,
                StringOf(el, "status") ?? "", StringOf(el, "stopReason"), StringOf(el, "stopDetail"),
                (int)(LongOf(el, "iterationsDone") ?? 0), StringOf(el, "phase"), LongOf(el, "armedAt") ?? 0, StringOf(el, "createdBy"));
        }
        return new LoopProbe(false, "none", null, null, 0, null, 0, null);
    }

    PortResult IRecurringPort.StopLoop(string? sourceId, string repoId)
    {
        if (IsSelfSource(sourceId))
        {
            var repo = _repos.GetAll().FirstOrDefault(r => r.Id == repoId);
            if (repo is null) return new PortResult(false, "error", "the repo is gone");
            var o = Armer.Stop(repo.Id, repo.Name, null, LoopConfigStore.ArmedByOperator);
            AuditTool("recurring", repo.Id, o.Audit.Length > 0 ? o.Audit : o.Status);
            return new PortResult(o.Ok, o.Status, o.Detail);
        }
        var src = RecurringSource(sourceId);
        if (src is null) return new PortResult(false, "error", $"machine {sourceId} is no longer a fleet source");
        var remote = _fleet.Loop(src.Id, new { action = "stop", repoId, from = SelfLabel, @override = true });
        AuditTool("recurring", ArchStateStore.FleetKey(src.Id, repoId), remote.Status);
        return new PortResult(remote.Ok, remote.Status, $"{src.Label}: {remote.Detail}");
    }

    bool IRecurringPort.RestoreSlot(string repoId, string snapshot, long loopArmedAt) => _loops.RestoreSnapshot(repoId, snapshot, loopArmedAt);

    PortResult IRecurringPort.SendOnce(string? sourceId, string repoId, string text)
    {
        if (!_gate.Enabled) return new PortResult(false, "not-accepting", $"the autopilot gate on {SelfLabel} is closed by the operator");
        var o = SendTask(IsSelfSource(sourceId) ? null : sourceId, repoId, text, null, requireArmed: false, overrideClaimed: true);
        return new PortResult(o.Ok, o.Status, o.Detail);
    }

    string? IRecurringPort.LastReply(string? sourceId, string repoId, long sinceMs)
    {
        if (IsSelfSource(sourceId))
        {
            var repo = _repos.GetAll().FirstOrDefault(r => r.Id == repoId);
            if (repo is null) return null;
            var sid = _loops.Get(repoId)?.SessionId ?? ResolveRepoSession(repo);
            if (string.IsNullOrWhiteSpace(sid)) return null;
            var since = DateTimeOffset.FromUnixTimeMilliseconds(Math.Max(0, sinceMs - 5000)).UtcDateTime;
            var last = _sessions.GetMessages(repo.Path, sid).LastOrDefault(m => m.Role == "assistant" && !m.Synthetic
                && (m.Timestamp is null || m.Timestamp.Value.ToUniversalTime() >= since));
            // The CLI can finish a run without persisting the reply: the run session witnessed it.
            if (last is null && _runs.Get(repo.Id) is { ReplyText: { Length: > 0 } text, ReplyTextAtUtc: { } at } && at >= since) return text;
            return last?.Text;
        }
        var src = RecurringSource(sourceId);
        if (src is null) return null;
        var o = _fleet.ReadTranscript(src.Id, repoId, 8, overrideClaimed: true);
        if (!o.Ok) return null;
        return TranscriptMessages(o.Data).LastOrDefault(m => m.Role == "assistant" && (m.At is null || m.At >= sinceMs - 5000))?.Text;
    }

    // ── the arch's recurring-task tools (fleet task 933709ea) ────────────────────────────────
    // list_recurring / recurring_runs / create_recurring / update_recurring / delete_recurring,
    // against the SAME store and the SAME RecurringCommands the Recurring tab uses. Scope =
    // the sends rule: only agents the arch manages (local IsManaged, remote IsManagedFleet);
    // the Operator's autopilot gate applies to a prompt card's create / edit / resume exactly
    // as it does in the tab; a tracking-only card never touches it.

    private readonly RecurringCommands? _recurringCommands;
    private readonly RecurringRunLog? _recurringLog;
    private readonly Func<RecurringEngine>? _recurringEngine;

    /// <summary>Every parameter the create/update tools take, flat in the call.</summary>
    public sealed record RecurringArgs(string? Kind, string? Title, string? Machine, string? RepoId, string? Instructions,
        int? Every, string? At, string? Days, string? Mode, int? MaxTurns, string? Description, string? AppId, bool? Enabled);

    private ToolOutcome? RecurringUnavailable(string tool) =>
        _recurringCommands is null || _recurringLog is null || _recurringEngine is null
            ? new ToolOutcome(false, "error", $"{tool}: recurring tasks are not wired on this harness") : null;

    private bool RecurringInScope(string? sourceId, string repoId) =>
        IsSelfSource(sourceId) ? IsManaged(repoId) : IsManagedFleet(sourceId!, repoId);

    /// <summary>Resolve an agent reference for a recurring card and apply the scope rule.
    /// Null when fine (out params set), else the refusal.</summary>
    private ToolOutcome? RecurringScope(string tool, string? machine, string? repoRef, out string? sourceId, out string repoId)
    {
        sourceId = null; repoId = "";
        var agent = ResolveAgentRef(machine, repoRef);
        if (agent.Error is not null) { AuditTool(tool, repoRef, "unresolved"); return new ToolOutcome(false, "error", agent.Error + "; nothing was changed"); }
        repoId = agent.RepoId!;
        sourceId = agent.Target.IsSelf ? null : agent.Target.Source!.Id;
        if (!RecurringInScope(sourceId, repoId))
        {
            var key = sourceId is null ? repoId : ArchStateStore.FleetKey(sourceId, repoId);
            AuditTool(tool, key, Unmanaged);
            return new ToolOutcome(false, Unmanaged, $"{AgentLabelOf(sourceId, repoId)} is not a managed agent; recurring tasks follow the same scope rule as sends");
        }
        return null;
    }

    private static ScheduleSpec? ScheduleOf(RecurringArgs a, out string? error)
    {
        error = null;
        if (a.Every is int e && !string.IsNullOrWhiteSpace(a.At)) { error = "give either every (minutes) or at (HH:mm), not both"; return null; }
        if (a.Every is int every) return new ScheduleSpec(Recurrence.KindInterval, every);
        if (!string.IsNullOrWhiteSpace(a.At))
        {
            var days = (a.Days ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
            return new ScheduleSpec(Recurrence.KindDaily, 0, a.At.Trim(), days.Count == 0 ? null : days);
        }
        if (!string.IsNullOrWhiteSpace(a.Days)) { error = "days needs at (HH:mm) — a daily schedule"; return null; }
        return null;
    }

    private static RunSpec? RunOf(RecurringArgs a) =>
        a.Mode is null && a.MaxTurns is null ? null : new RunSpec(a.Mode ?? Recurrence.ModeGoal, a.MaxTurns ?? Recurrence.DefaultMaxTurns);

    private static string RecurringStatusOf(RecurringCommands.Result r) => r.Http switch { 403 => "gate-closed", 404 => "not-found", 409 => "busy", _ => "error" };

    private string CardLine(RecurringTask t) =>
        t.IsTracking ? $"tracking-only card \"{t.Title}\" on {AgentLabelOf(t.SourceId, t.RepoId)}{(t.AppId is null ? "" : $" (app {t.AppId})")}"
        : $"\"{t.Title}\" on {AgentLabelOf(t.SourceId, t.RepoId)} — {Recurrence.Words(t.Schedule.ToSchedule())}, {t.Run.Mode}{(t.Enabled ? "" : ", paused")}";

    /// <summary>The <c>list_recurring</c> tool: every card on the managed agents (or one
    /// machine / one agent), the tab's own projection. Read-only, like list_loops.</summary>
    public ToolOutcome ToolListRecurring(string? machine, string? repoId)
    {
        if (RecurringUnavailable("list_recurring") is { } off) return off;
        string? onlySource = null, onlyRepo = null; bool? onlySelf = null;
        if (!string.IsNullOrWhiteSpace(repoId))
        {
            if (RecurringScope("list_recurring", machine, repoId, out onlySource, out var rid) is { } refused) return refused;
            onlyRepo = rid; onlySelf = onlySource is null;
        }
        else if (!string.IsNullOrWhiteSpace(machine))
        {
            var m = ResolveMachine(machine);
            if (m.Error is not null) return new ToolOutcome(false, "error", m.Error);
            onlySelf = m.IsSelf; onlySource = m.IsSelf ? null : m.Source!.Id;
        }
        var rows = _recurringEngine!().TaskViews(t =>
            RecurringInScope(t.SourceId, t.RepoId)
            && (onlySelf is null || (onlySelf == true ? IsSelfSource(t.SourceId) : t.SourceId == onlySource))
            && (onlyRepo is null || t.RepoId == onlyRepo));
        var all = _recurringCommands!.All().Where(t => RecurringInScope(t.SourceId, t.RepoId)).ToList();
        AuditTool("list_recurring", onlyRepo, $"{rows.Count} card(s)");
        return new ToolOutcome(true, "ok",
            $"{rows.Count} recurring card(s){(onlyRepo is null && onlySelf is null ? $": {all.Count(t => !t.IsTracking)} prompt-driven, {all.Count(t => t.IsTracking)} tracking-only" : "")}", rows);
    }

    /// <summary>The <c>recurring_runs</c> tool: one card's run history, newest first.</summary>
    public ToolOutcome ToolRecurringRuns(string? id, int limit)
    {
        if (RecurringUnavailable("recurring_runs") is { } off) return off;
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required (from list_recurring)");
        var t = _recurringCommands!.Get(id.Trim());
        if (t is null) return new ToolOutcome(false, "not-found", $"no recurring card {id}");
        if (!RecurringInScope(t.SourceId, t.RepoId)) return new ToolOutcome(false, Unmanaged, $"{CardLine(t)}: its agent is not managed by you");
        if (t.IsTracking)
        {
            AuditTool("recurring_runs", t.RepoId, "tracking");
            return new ToolOutcome(true, "ok", $"{CardLine(t)} has no runs of its own — the job runs inside the agent's app; open that harness to see it", new { id = t.Id, kind = t.Kind, runs = Array.Empty<object>(), total = 0 });
        }
        var runs = _recurringLog!.Runs(t.Id, Math.Clamp(limit, 1, 100)).Select(RecurringEngine.RunView).ToList();
        AuditTool("recurring_runs", t.RepoId, $"{runs.Count} run(s)");
        return new ToolOutcome(true, "ok", $"{runs.Count} of {_recurringLog.Count(t.Id)} run(s) of {CardLine(t)}", new { id = t.Id, kind = t.Kind, runs, total = _recurringLog.Count(t.Id) });
    }

    /// <summary>The <c>create_recurring</c> tool — only on the Operator's ask (the role prompt's rule).</summary>
    public ToolOutcome ToolCreateRecurring(RecurringArgs a)
    {
        if (RecurringUnavailable("create_recurring") is { } off) return off;
        var kind = RecurringTask.NormalizeKind(a.Kind);
        if (RecurringScope("create_recurring", a.Machine, a.RepoId, out var sourceId, out var repoId) is { } refused) return refused;
        var schedule = ScheduleOf(a, out var schedErr);
        if (schedErr is not null) return new ToolOutcome(false, "error", schedErr);
        var req = new RecurringCommands.TaskRequest(kind, a.Title, sourceId, repoId, a.Instructions, schedule, RunOf(a), null, a.Description, a.AppId, a.Enabled);
        var r = _recurringCommands!.Create(req, "arch");
        var key = sourceId is null ? repoId : ArchStateStore.FleetKey(sourceId, repoId);
        if (!r.Ok) { AuditTool("create_recurring", key, RecurringStatusOf(r)); return new ToolOutcome(false, RecurringStatusOf(r), r.Error! + "; nothing was created"); }
        AuditTool("create_recurring", key, $"created {r.Task!.Id} ({kind})");
        return new ToolOutcome(true, "created", $"created {CardLine(r.Task)} · id {r.Task.Id}", _recurringEngine!().TaskView(r.Task));
    }

    /// <summary>The <c>update_recurring</c> tool: edit fields, reassign the agent, pause
    /// (enabled false) or resume (enabled true — re-anchors the schedule).</summary>
    public ToolOutcome ToolUpdateRecurring(string? id, RecurringArgs a)
    {
        if (RecurringUnavailable("update_recurring") is { } off) return off;
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required (from list_recurring)");
        var t = _recurringCommands!.Get(id.Trim());
        if (t is null) return new ToolOutcome(false, "not-found", $"no recurring card {id}");
        if (!RecurringInScope(t.SourceId, t.RepoId)) return new ToolOutcome(false, Unmanaged, $"{CardLine(t)}: its agent is not managed by you; nothing was changed");
        string? sourceId = null, repoId = null;
        if (!string.IsNullOrWhiteSpace(a.RepoId))
        {
            if (RecurringScope("update_recurring", a.Machine, a.RepoId, out sourceId, out var rid) is { } refused) return refused;
            repoId = rid;
        }
        var schedule = ScheduleOf(a, out var schedErr);
        if (schedErr is not null) return new ToolOutcome(false, "error", schedErr);
        var req = new RecurringCommands.TaskRequest(a.Kind, a.Title, sourceId, repoId, a.Instructions, schedule, RunOf(a), null, a.Description, a.AppId, a.Enabled);
        var r = _recurringCommands.Edit(t.Id, req, "arch");
        if (!r.Ok) { AuditTool("update_recurring", t.RepoId, RecurringStatusOf(r)); return new ToolOutcome(false, RecurringStatusOf(r), r.Error! + "; nothing was changed"); }
        AuditTool("update_recurring", t.RepoId, a.Enabled switch { true => "resumed", false => "paused", _ => "edited" });
        return new ToolOutcome(true, a.Enabled switch { true => "resumed", false => "paused", _ => "updated" }, $"now {CardLine(r.Task!)}", _recurringEngine!().TaskView(r.Task!));
    }

    /// <summary>The <c>delete_recurring</c> tool: removes the card and its history; refused while a run is in progress.</summary>
    public ToolOutcome ToolDeleteRecurring(string? id)
    {
        if (RecurringUnavailable("delete_recurring") is { } off) return off;
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required (from list_recurring)");
        var t = _recurringCommands!.Get(id.Trim());
        if (t is null) return new ToolOutcome(false, "not-found", $"no recurring card {id}");
        if (!RecurringInScope(t.SourceId, t.RepoId)) return new ToolOutcome(false, Unmanaged, $"{CardLine(t)}: its agent is not managed by you; nothing was deleted");
        var r = _recurringCommands.Delete(t.Id, "arch");
        if (!r.Ok) { AuditTool("delete_recurring", t.RepoId, RecurringStatusOf(r)); return new ToolOutcome(false, RecurringStatusOf(r), r.Error! + "; nothing was deleted"); }
        AuditTool("delete_recurring", t.RepoId, "deleted");
        return new ToolOutcome(true, "deleted", $"deleted {CardLine(t)}{(t.IsTracking ? "" : " and its run history")}", new { id = t.Id, title = t.Title, kind = t.Kind });
    }

    private static string? StringOf(object? data, string name) =>
        data is JsonElement el && el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static long? LongOf(object? data, string name) =>
        data is JsonElement el && el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var n) ? n : null;
}
