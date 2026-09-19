using System.Text.Json.Serialization;

namespace ClaudeWeb.Services.Recurring;

// Recurring tasks (openspec recurring-tasks, fleet task 31d0fd28): the card, the run record,
// and the PORT the engine talks to the harness through. The engine never touches the loop
// store, the run slot, the fleet client or a transcript itself — that is ArchAgentService's
// job (ArchAgentService.Recurring.cs) — so the engine unit-tests against a fake port.

/// <summary>interval: every N minutes on a fixed grid from the task's anchor. daily: HH:mm
/// (harness-local) on the named weekdays (none = every day).</summary>
public sealed record ScheduleSpec(
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("everyMinutes")] int EveryMinutes = 0,
    [property: JsonPropertyName("at")] string? At = null,
    [property: JsonPropertyName("days")] List<string>? Days = null)
{
    public Recurrence.Schedule ToSchedule() => new((Kind ?? "").Trim().ToLowerInvariant(), EveryMinutes, At?.Trim(),
        (Days ?? new()).Select(d => Enum.TryParse<DayOfWeek>(d?.Trim(), true, out var v) ? (DayOfWeek?)v : null)
            .Where(v => v is not null).Select(v => v!.Value).Distinct().ToList());

    /// <summary>Null when valid, else the sentence for the Operator.</summary>
    public static string? Validate(ScheduleSpec? s)
    {
        if (s is null) return "a schedule is required";
        if ((s.Days ?? new()).FirstOrDefault(d => !Enum.TryParse<DayOfWeek>(d?.Trim(), true, out _)) is { } bad)
            return $"unknown weekday \"{bad}\"";
        return Recurrence.Validate(s.ToSchedule());
    }

    public ScheduleSpec Normalized() => new((Kind ?? "").Trim().ToLowerInvariant(), EveryMinutes, At?.Trim(),
        ToSchedule().Days?.Select(d => d.ToString()).ToList());
}

/// <summary>goal (default): an occurrence arms the harness's goal loop, capped at MaxTurns.
/// single: one prompt with a closing line — for trivial read-only checks.</summary>
public sealed record RunSpec(
    [property: JsonPropertyName("mode")] string Mode = Recurrence.ModeGoal,
    [property: JsonPropertyName("maxTurns")] int MaxTurns = Recurrence.DefaultMaxTurns);

public sealed record PolicySpec(
    [property: JsonPropertyName("catchUp")] bool CatchUp = true,
    [property: JsonPropertyName("skipWhenBusy")] bool SkipWhenBusy = false,
    // Skip (and record it) while the assignee account's 5-hour plan window is at or above
    // this percentage. 0 = off.
    [property: JsonPropertyName("skipAbovePlanUsage")] int SkipAbovePlanUsage = 85,
    [property: JsonPropertyName("requireDefaultBranch")] bool RequireDefaultBranch = false);

public sealed record RecurringTask(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("title")] string Title,
    // The board's assignee key: sourceId (null = this harness) + repoId.
    [property: JsonPropertyName("sourceId")] string? SourceId,
    [property: JsonPropertyName("repoId")] string RepoId,
    [property: JsonPropertyName("instructions")] string Instructions,
    [property: JsonPropertyName("schedule")] ScheduleSpec Schedule,
    [property: JsonPropertyName("run")] RunSpec Run,
    [property: JsonPropertyName("policy")] PolicySpec Policy,
    [property: JsonPropertyName("enabled")] bool Enabled,
    [property: JsonPropertyName("pausedReason")] string? PausedReason,
    // The grid origin: set on create, on a schedule edit and on resume.
    [property: JsonPropertyName("anchorAt")] long AnchorAt,
    // The newest occurrence already fired or skipped.
    [property: JsonPropertyName("lastHandledDueAt")] long? LastHandledDueAt,
    [property: JsonPropertyName("runCount")] int RunCount,
    [property: JsonPropertyName("createdAt")] long CreatedAt,
    [property: JsonPropertyName("updatedAt")] long UpdatedAt,
    [property: JsonPropertyName("createdBy")] string CreatedBy);

/// <summary>One occurrence. Status: running | done | escalated | capped | error | stopped |
/// lost (armed runs — the goal loop's own resolution) | skipped | refused (never armed).
/// Outcome: ok | attention | failed | unreported — null while running / when never armed.</summary>
public sealed record RecurringRun(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("taskId")] string TaskId,
    [property: JsonPropertyName("n")] int N,
    [property: JsonPropertyName("sourceId")] string? SourceId,
    [property: JsonPropertyName("repoId")] string RepoId,
    [property: JsonPropertyName("dueAt")] long DueAt,
    [property: JsonPropertyName("missed")] int Missed,
    [property: JsonPropertyName("trigger")] string Trigger,
    [property: JsonPropertyName("mode")] string Mode,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("stopReason")] string? StopReason,
    [property: JsonPropertyName("turns")] int Turns,
    [property: JsonPropertyName("phase")] string? Phase,
    [property: JsonPropertyName("armedAt")] long? ArmedAt,
    [property: JsonPropertyName("endedAt")] long? EndedAt,
    [property: JsonPropertyName("outcome")] string? Outcome,
    [property: JsonPropertyName("summary")] string? Summary,
    [property: JsonPropertyName("reason")] string? Reason,
    [property: JsonPropertyName("sessionId")] string? SessionId,
    [property: JsonPropertyName("machine")] string Machine,
    [property: JsonPropertyName("agent")] string Agent,
    // The loop record's arming generation — how the run recognises ITS loop in the slot.
    [property: JsonPropertyName("loopArmedAt")] long? LoopArmedAt,
    // The borrowed slot: the agent's previous (inactive) loop record, put back when the run
    // resolves. "" = the slot was empty. Null = nothing to restore (a peer's agent, single
    // mode, or already restored). Never leaves the harness — the API view omits it.
    [property: JsonPropertyName("slotSnapshot")] string? SlotSnapshot)
{
    public const string Running = "running", Skipped = "skipped", Refused = "refused", Lost = "lost";
    public bool IsRunning => Status == Running;
}

// ── the port ────────────────────────────────────────────────────────────────────────────

/// <summary>What the engine needs to know about the assignee at a due occurrence.
/// <see cref="Known"/> false = it cannot be run at all right now; <see cref="Refusal"/> says why
/// (repo gone, peer unreachable, sends not allowed/accepted, not managed there).</summary>
public sealed record AgentSituation(bool Known, string Machine, string Agent, bool Busy, bool LoopActive,
    string? LoopArmedBy, bool OnDefaultBranch, double? PlanUsagePercent, string? Refusal = null);

public sealed record PortResult(bool Ok, string Status, string Detail, long? LoopArmedAt = null, string? SessionId = null, string? SlotSnapshot = null);

/// <summary>The agent's loop slot as the harness that owns it reports it.</summary>
public sealed record LoopProbe(bool Active, string Status, string? StopReason, string? StopDetail, int Iterations, string? Phase, long ArmedAt, string? ArmedBy, string? SessionId = null);

public interface IRecurringPort
{
    string Label(string? sourceId, string repoId);
    AgentSituation Situation(string? sourceId, string repoId);
    /// <summary>Arm the harness's goal loop on the agent (drive mode, capped). Locally the
    /// previous inactive loop record is snapshotted first — the slot is borrowed.</summary>
    PortResult ArmGoal(string? sourceId, string repoId, string goal, int maxTurns);
    /// <summary>Null = cannot tell right now (the peer did not answer).</summary>
    LoopProbe? ProbeLoop(string? sourceId, string repoId);
    PortResult StopLoop(string? sourceId, string repoId);
    /// <summary>Put the borrowed slot back — only if it still holds THIS run's resolved loop.</summary>
    bool RestoreSlot(string repoId, string snapshot, long loopArmedAt);
    /// <summary>single mode: one prompt into the agent's builder lane.</summary>
    PortResult SendOnce(string? sourceId, string repoId, string text);
    /// <summary>The agent's last assistant message at or after <paramref name="sinceMs"/>.</summary>
    string? LastReply(string? sourceId, string repoId, long sinceMs);
}
