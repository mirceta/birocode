using System.Collections.Concurrent;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Recurring;

/// <summary>
/// The recurring-task engine (openspec recurring-tasks): one <see cref="Tick"/> advances the
/// runs in progress and then decides every card — idle / hold / fire / skip — with the pure
/// ladder in <see cref="Recurrence"/>. FIRE ARMS THE HARNESS'S GOAL LOOP on the assignee
/// (through the port); the loop engine does the run; this class only listens for how the
/// loop resolved and writes the run record. Everything is polled, so a harness restart
/// re-attaches by itself: the run record and the loop record both survive on disk.
/// Clock, zone, gate and port are injected — the scheduler service wraps this, tests drive it.
/// </summary>
public sealed class RecurringEngine
{
    public const int StripLength = 20;
    /// <summary>A run whose harness cannot be probed for this long is closed as lost.</summary>
    public static readonly TimeSpan LostAfter = TimeSpan.FromHours(12);
    /// <summary>single mode: a peer's busy flag is a cached snapshot — do not read "idle, no
    /// reply" as "ended" sooner than this after the send.</summary>
    public static readonly TimeSpan SingleGrace = TimeSpan.FromSeconds(60);

    public sealed record HoldView(long DueAt, int Missed, string Reason);
    public sealed record ActionResult(bool Ok, int Http, string Detail);

    private readonly RecurringTaskStore _store;
    private readonly RecurringRunLog _log;
    private readonly IRecurringPort _port;
    private readonly Func<bool> _gateOpen;
    private readonly Func<long> _now;
    private readonly TimeZoneInfo _tz;
    private readonly Action<string, object, object>? _publish;
    private readonly Logger? _logger;
    private readonly object _sync = new();
    private readonly ConcurrentDictionary<string, HoldView> _holds = new(StringComparer.Ordinal);

    public RecurringEngine(RecurringTaskStore store, RecurringRunLog log, IRecurringPort port, Func<bool> gateOpen,
        Func<long>? now = null, TimeZoneInfo? tz = null, Action<string, object, object>? publish = null, Logger? logger = null)
    {
        _store = store; _log = log; _port = port; _gateOpen = gateOpen;
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _tz = tz ?? TimeZoneInfo.Local;
        _publish = publish; _logger = logger;
    }

    public bool GateOpen => _gateOpen();
    public HoldView? HoldOf(string taskId) => _holds.TryGetValue(taskId, out var h) ? h : null;

    // ── the tick ────────────────────────────────────────────────────────────────────────

    public void Tick()
    {
        lock (_sync)
        {
            var now = _now();
            foreach (var run in _log.Running())
            {
                try { Advance(run, now); }
                catch (Exception ex) { _logger?.Error($"[RECURRING] advancing run {run.Id} failed: {ex.Message}"); }
            }
            foreach (var t in _store.All())
            {
                try { TickTask(t, now); }
                catch (Exception ex) { _logger?.Error($"[RECURRING] deciding \"{t.Title}\" failed: {ex.Message}"); }
            }
        }
    }

    private static DateTimeOffset At(long ms) => DateTimeOffset.FromUnixTimeMilliseconds(ms);
    private static Recurrence.Policy PolicyOf(RecurringTask t) => new(t.Policy.CatchUp, t.Policy.SkipWhenBusy);

    private Recurrence.Decision Decide(RecurringTask t, long now, bool busy, string? hold) =>
        Recurrence.Decide(t.Schedule.ToSchedule(), At(t.AnchorAt), t.LastHandledDueAt is long l ? At(l) : null, PolicyOf(t),
            new Recurrence.Situation(At(now), t.Enabled, _gateOpen(), busy, hold), _tz);

    private void TickTask(RecurringTask t, long now)
    {
        if (!t.Enabled) { _holds.TryRemove(t.Id, out _); return; }

        // Its own previous run is still looping: the next occurrence waits behind it.
        if (_log.RunningOf(t.Id) is not null)
        {
            SetHold(t.Id, Decide(t, now, false, "the previous run of this task is still in progress"));
            return;
        }

        // First without the agent: most ticks nothing is due, and the situation costs a git
        // read (or an HTTP call to a peer).
        switch (Decide(t, now, false, null))
        {
            case Recurrence.Decision.Idle: _holds.TryRemove(t.Id, out _); return;
            case Recurrence.Decision.Hold h: SetHold(t.Id, h); return;                       // the gate
            case Recurrence.Decision.Skip s: RecordNotArmed(t, s.DueAt, s.Missed, RecurringRun.Skipped, s.Reason, now, null); return;
        }

        var sit = _port.Situation(t.SourceId, t.RepoId);
        if (!sit.Known)
        {
            var f = (Recurrence.Decision.Fire)Decide(t, now, false, null);
            RecordNotArmed(t, f.DueAt, f.Missed, RecurringRun.Refused, sit.Refusal ?? "the agent cannot be reached", now, sit);
            return;
        }
        var hold = Recurrence.SlotHold(sit.LoopActive, sit.LoopArmedBy)
            ?? (t.Policy.RequireDefaultBranch && !sit.OnDefaultBranch ? "the repo is not on its default branch — it runs when it is" : null);
        switch (Decide(t, now, sit.Busy, hold))
        {
            case Recurrence.Decision.Hold h: SetHold(t.Id, h); return;
            case Recurrence.Decision.Skip s: RecordNotArmed(t, s.DueAt, s.Missed, RecurringRun.Skipped, s.Reason, now, sit); return;
            case Recurrence.Decision.Fire f:
                if (t.Policy.SkipAbovePlanUsage > 0 && sit.PlanUsagePercent is double u && u >= t.Policy.SkipAbovePlanUsage)
                {
                    RecordNotArmed(t, f.DueAt, f.Missed, RecurringRun.Skipped,
                        $"the plan's 5-hour window is at {u:0} % — at or above this task's {t.Policy.SkipAbovePlanUsage} % limit", now, sit);
                    return;
                }
                Fire(t, f.DueAt.ToUnixTimeMilliseconds(), f.Missed, f.Trigger, sit, now);
                return;
        }
    }

    private void SetHold(string taskId, Recurrence.Decision d)
    {
        if (d is Recurrence.Decision.Hold h) _holds[taskId] = new HoldView(h.DueAt.ToUnixTimeMilliseconds(), h.Missed, h.Reason);
        else _holds.TryRemove(taskId, out _);
    }

    // ── fire ────────────────────────────────────────────────────────────────────────────

    /// <summary>Returns null when the run started, else why not (a race on the run slot is a
    /// hold — nothing recorded; a refusal IS recorded).</summary>
    private string? Fire(RecurringTask t, long dueAt, int missed, string trigger, AgentSituation sit, long now)
    {
        var single = t.Run.Mode == Recurrence.ModeSingle;
        var n = t.RunCount + 1;
        var dueLocal = TimeZoneInfo.ConvertTime(At(dueAt), _tz);
        var sched = t.Schedule.ToSchedule();
        var prev = PreviousRunLine(t.Id);
        var r = single
            ? _port.SendOnce(t.SourceId, t.RepoId, Recurrence.ComposePrompt(t.Title, t.Id, n, dueLocal, sched, sit.Machine, missed, prev, t.Instructions))
            : _port.ArmGoal(t.SourceId, t.RepoId, Recurrence.ComposeGoal(t.Title, t.Id, n, dueLocal, sched, sit.Machine, missed, prev, t.Instructions),
                Math.Clamp(t.Run.MaxTurns, 2, 30));
        if (!r.Ok)
        {
            if (r.Status == "busy")
            {
                _holds[t.Id] = new HoldView(dueAt, missed, "the agent is busy — it runs when the agent is idle");
                return "the agent is busy";
            }
            if (trigger != Recurrence.TriggerManual) RecordNotArmed(t, At(dueAt), missed, RecurringRun.Refused, r.Detail, now, sit);
            else CloseNotArmed(t, dueAt, missed, trigger, RecurringRun.Refused, r.Detail, now, sit);
            return r.Detail;
        }
        _holds.TryRemove(t.Id, out _);
        var run = new RecurringRun("r-" + Guid.NewGuid().ToString("n"), t.Id, n, t.SourceId, t.RepoId, dueAt, missed, trigger,
            single ? Recurrence.ModeSingle : Recurrence.ModeGoal, RecurringRun.Running, null, single ? 1 : 0, single ? null : "work",
            now, null, null, null, null, r.SessionId, sit.Machine, sit.Agent, r.LoopArmedAt, r.SlotSnapshot);
        _log.Upsert(run);
        _store.Update(t.Id, x => x with { RunCount = n, LastHandledDueAt = trigger == Recurrence.TriggerManual ? x.LastHandledDueAt : dueAt, UpdatedAt = now });
        _logger?.Info($"[RECURRING] \"{t.Title}\" run #{n} ({trigger}) → {(single ? "one prompt sent to" : "goal loop armed on")} {sit.Machine}/{sit.Agent}");
        Publish("recurring.fired", t, new { runId = run.Id, n, trigger, mode = run.Mode, missed, dueAt });
        return null;
    }

    private void RecordNotArmed(RecurringTask t, DateTimeOffset due, int missed, string status, string reason, long now, AgentSituation? sit)
    {
        var dueMs = due.ToUnixTimeMilliseconds();
        CloseNotArmed(t, dueMs, missed, Recurrence.TriggerSchedule, status, reason, now, sit);
        _store.Update(t.Id, x => x with { LastHandledDueAt = dueMs, UpdatedAt = now });
        _holds.TryRemove(t.Id, out _);
    }

    private void CloseNotArmed(RecurringTask t, long dueAt, int missed, string trigger, string status, string reason, long now, AgentSituation? sit)
    {
        var run = new RecurringRun("r-" + Guid.NewGuid().ToString("n"), t.Id, 0, t.SourceId, t.RepoId, dueAt, missed, trigger, t.Run.Mode,
            status, null, 0, null, null, now, null, null, reason, null, sit?.Machine ?? "", sit?.Agent ?? _port.Label(t.SourceId, t.RepoId), null, null);
        _log.Upsert(run);
        _logger?.Info($"[RECURRING] \"{t.Title}\" {status}: {reason}");
        Publish("recurring.skipped", t, new { runId = run.Id, status, reason, dueAt });
        if (status == RecurringRun.Refused) AutoPauseIfFailing(t, now);
    }

    // ── advance a run in progress ───────────────────────────────────────────────────────

    private void Advance(RecurringRun run, long now)
    {
        var age = TimeSpan.FromMilliseconds(now - (run.ArmedAt ?? now));
        if (run.Mode == Recurrence.ModeSingle)
        {
            var sit = _port.Situation(run.SourceId, run.RepoId);
            if (!sit.Known) { if (age > LostAfter) Close(run, RecurringRun.Lost, null, run.Turns, new(Recurrence.OutcomeUnreported, "lost contact with the agent's harness"), now); return; }
            if (sit.Busy) return;
            var reply = _port.LastReply(run.SourceId, run.RepoId, run.ArmedAt ?? 0);
            if (reply is null && age < SingleGrace) return;
            Close(run, "done", null, 1, Recurrence.OutcomeOf("done", reply), now);
            return;
        }

        var p = _port.ProbeLoop(run.SourceId, run.RepoId);
        if (p is null) { if (age > LostAfter) Close(run, RecurringRun.Lost, null, run.Turns, new(Recurrence.OutcomeUnreported, "lost contact with the agent's harness"), now); return; }
        if (run.LoopArmedAt is long mine && p.ArmedAt != mine)
        {
            // Someone re-armed (or cleared) the slot: this run's loop is gone. Nothing to restore.
            Close(run with { SlotSnapshot = null }, RecurringRun.Lost, null, run.Turns,
                new(Recurrence.OutcomeUnreported, "the agent's loop slot was re-armed by someone else before this run resolved"), now);
            return;
        }
        // The loop's pinned session moves with every fork; a run that started the agent's
        // conversation only learns its session here.
        if (p.SessionId is { Length: > 0 } sid && sid != run.SessionId) run = run with { SessionId = sid };
        if (p.Active)
        {
            if (p.Iterations != run.Turns || p.Phase != run.Phase || run.SessionId != _log.RunningOf(run.TaskId)?.SessionId)
                _log.Upsert(run with { Turns = p.Iterations, Phase = p.Phase });
            return;
        }
        var final = _port.LastReply(run.SourceId, run.RepoId, run.ArmedAt ?? 0);
        var outcome = Recurrence.OutcomeOfLoop(p.Status, p.StopReason, p.StopDetail, p.Iterations, final);
        Close(run, p.Status == "escalate" ? "escalated" : p.Status, p.StopReason, p.Iterations, outcome, now);
    }

    private void Close(RecurringRun run, string status, string? stopReason, int turns, Recurrence.Outcome outcome, long now)
    {
        // Hand the borrowed loop slot back as it was found (local goal runs only).
        if (run.SlotSnapshot is not null && run.LoopArmedAt is long armedAt)
        {
            try { _port.RestoreSlot(run.RepoId, run.SlotSnapshot, armedAt); }
            catch (Exception ex) { _logger?.Error($"[RECURRING] restoring the loop slot of {run.RepoId} failed: {ex.Message}"); }
        }
        var closed = run with { Status = status, StopReason = stopReason, Turns = turns, Phase = null, EndedAt = now, Outcome = outcome.Kind, Summary = outcome.Summary, SlotSnapshot = null };
        _log.Upsert(closed);
        var t = _store.Get(run.TaskId);
        _logger?.Info($"[RECURRING] \"{t?.Title ?? run.TaskId}\" run #{run.N} ended {status} after {turns} turn(s): {outcome.Kind} — {outcome.Summary}");
        if (t is null) return;
        Publish("recurring.ended", t, new { runId = run.Id, n = run.N, status, stopReason, turns, outcome = outcome.Kind, summary = outcome.Summary });
        if (outcome.Kind == Recurrence.OutcomeFailed) AutoPauseIfFailing(t, now);
    }

    private void AutoPauseIfFailing(RecurringTask t, long now)
    {
        var recent = _log.Runs(t.Id, Recurrence.AutoPauseAfter + 5)
            .Where(r => !r.IsRunning && r.Status != RecurringRun.Skipped)
            .Select(r => r.Status == RecurringRun.Refused ? RecurringRun.Refused : r.Outcome ?? Recurrence.OutcomeUnreported);
        if (!Recurrence.ShouldAutoPause(recent)) return;
        var reason = $"auto: {Recurrence.AutoPauseAfter} consecutive failures";
        _store.Update(t.Id, x => x with { Enabled = false, PausedReason = reason, UpdatedAt = now });
        _holds.TryRemove(t.Id, out _);
        _logger?.Info($"[RECURRING] \"{t.Title}\" paused itself — {Recurrence.AutoPauseAfter} consecutive failed/refused runs");
        Publish("recurring.paused", t, new { reason });
    }

    private string? PreviousRunLine(string taskId)
    {
        var last = _log.Runs(taskId, 10).FirstOrDefault(r => !r.IsRunning && r.Outcome is not null);
        if (last is null) return null;
        var when = TimeZoneInfo.ConvertTime(At(last.EndedAt ?? last.ArmedAt ?? last.DueAt), _tz);
        return $"{when:yyyy-MM-dd HH:mm} — {last.Outcome!.ToUpperInvariant()}: {last.Summary}";
    }

    // ── Operator actions ────────────────────────────────────────────────────────────────

    public ActionResult RunNow(string taskId)
    {
        lock (_sync)
        {
            var t = _store.Get(taskId);
            if (t is null) return new(false, 404, "no such recurring task");
            if (!_gateOpen()) return new(false, 403, "Autopilot is disabled by the operator.");
            if (_log.RunningOf(taskId) is not null) return new(false, 409, "a run of this task is already in progress");
            var sit = _port.Situation(t.SourceId, t.RepoId);
            if (!sit.Known) return new(false, 409, sit.Refusal ?? "the agent cannot be reached");
            if (Recurrence.SlotHold(sit.LoopActive, sit.LoopArmedBy) is { } slot) return new(false, 409, slot);
            if (sit.Busy) return new(false, 409, "the agent is busy — try again when its turn ends");
            var now = _now();
            var why = Fire(t, now, 0, Recurrence.TriggerManual, sit, now);
            return why is null ? new(true, 200, "run started") : new(false, 409, why);
        }
    }

    public ActionResult StopRun(string taskId)
    {
        lock (_sync)
        {
            var run = _log.RunningOf(taskId);
            if (run is null) return new(false, 409, "no run of this task is in progress");
            if (run.Mode == Recurrence.ModeSingle) return new(false, 409, "a single-prompt run is one turn — stop it with the agent's Stop button");
            var r = _port.StopLoop(run.SourceId, run.RepoId);
            return r.Ok ? new(true, 200, r.Detail) : new(false, 409, r.Detail);
        }
    }

    // ── the board view ──────────────────────────────────────────────────────────────────

    public static string StripWord(RecurringRun r) =>
        r.IsRunning ? RecurringRun.Running
        : r.Status is RecurringRun.Skipped or RecurringRun.Refused ? r.Status
        : r.Outcome ?? Recurrence.OutcomeUnreported;

    /// <summary>What needs the Operator's eyes: a self-paused card, or a last run that ended
    /// attention / failed.</summary>
    public string? AttentionOf(RecurringTask t, RecurringRun? lastClosed) =>
        !t.Enabled && (t.PausedReason ?? "").StartsWith("auto", StringComparison.Ordinal) ? Recurrence.OutcomeFailed
        : lastClosed?.Status == RecurringRun.Refused ? Recurrence.OutcomeFailed
        : lastClosed?.Outcome is Recurrence.OutcomeAttention or Recurrence.OutcomeFailed ? lastClosed.Outcome
        : null;

    public static object RunView(RecurringRun r) => new
    {
        id = r.Id, n = r.N, dueAt = r.DueAt, missed = r.Missed, trigger = r.Trigger, mode = r.Mode, status = r.Status,
        stopReason = r.StopReason, turns = r.Turns, phase = r.Phase, armedAt = r.ArmedAt, endedAt = r.EndedAt,
        outcome = r.Outcome, summary = r.Summary, reason = r.Reason, sessionId = r.SessionId, machine = r.Machine, agent = r.Agent,
        word = StripWord(r),
    };

    public object Board()
    {
        var now = _now();
        var gate = _gateOpen();
        var tasks = _store.All().Select(t =>
        {
            var runs = _log.Runs(t.Id, StripLength);
            var running = runs.FirstOrDefault(r => r.IsRunning);
            var lastClosed = runs.FirstOrDefault(r => !r.IsRunning && r.Status != RecurringRun.Skipped);
            var hold = HoldOf(t.Id);
            long? nextDue = null;
            if (t.Enabled && hold is null && running is null)
            {
                try { nextDue = Recurrence.NextAfter(t.Schedule.ToSchedule(), At(t.AnchorAt), At(t.LastHandledDueAt ?? t.AnchorAt), _tz).ToUnixTimeMilliseconds(); }
                catch { /* an invalid schedule shows no next run */ }
            }
            return (object)new
            {
                id = t.Id, title = t.Title, sourceId = t.SourceId, repoId = t.RepoId, agentLabel = _port.Label(t.SourceId, t.RepoId),
                // Prompt text follows the loop console's rule: not disclosed while the gate is closed.
                instructions = gate ? t.Instructions : null, redacted = !gate,
                schedule = t.Schedule, scheduleWords = SafeWords(t), run = t.Run, policy = t.Policy,
                enabled = t.Enabled, pausedReason = t.PausedReason, runCount = t.RunCount, totalRuns = _log.Count(t.Id),
                createdAt = t.CreatedAt, updatedAt = t.UpdatedAt,
                nextDueAt = nextDue, hold = hold is null ? null : new { dueAt = hold.DueAt, missed = hold.Missed, reason = hold.Reason },
                running = running is null ? null : RunView(running),
                lastRun = runs.FirstOrDefault(r => !r.IsRunning) is { } lr ? RunView(lr) : null,
                strip = runs.Reverse().Select(StripWord).ToList(),
                attention = AttentionOf(t, lastClosed),
            };
        }).ToList();
        return new { at = now, gateOpen = gate, minIntervalMinutes = Recurrence.MinIntervalMinutes, tasks };
    }

    private static string SafeWords(RecurringTask t)
    {
        try { return Recurrence.Words(t.Schedule.ToSchedule()); } catch { return t.Schedule.Kind; }
    }

    private void Publish(string type, RecurringTask t, object data)
    {
        try { _publish?.Invoke(type, new { recurringId = t.Id, title = t.Title, sourceId = t.SourceId, repoId = t.RepoId }, data); }
        catch { /* the feed is best-effort */ }
    }
}
