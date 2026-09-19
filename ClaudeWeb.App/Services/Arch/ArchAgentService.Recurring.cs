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

    private static string? StringOf(object? data, string name) =>
        data is JsonElement el && el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static long? LongOf(object? data, string name) =>
        data is JsonElement el && el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var n) ? n : null;
}
