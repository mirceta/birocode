using System.Globalization;
using System.Text.RegularExpressions;

namespace ClaudeWeb.Services.Recurring;

/// <summary>
/// The pure core of recurring tasks (openspec recurring-tasks, fleet task 31d0fd28): the
/// rules RecurringEngine applies, kept free of clock and I/O so they are pinned by tests.
///
/// A recurring task is a card: one repo agent, instructions, a schedule, a run history.
/// This file holds:
///   * the schedule and its FIXED GRID of occurrences (a late run never shifts the next);
///   * the per-tick decision ladder — idle / hold / fire / skip — with missed occurrences
///     COALESCED into one catch-up run, and a busy agent holding (never queueing) the run;
///   * the closing-line contract (RUN OK | RUN ATTENTION | RUN FAILED) read from the reply's
///     final line without a model, and the self-pause rule;
///   * the send envelope.
/// Framework-free: no clock, no I/O — the caller passes "now", the zone and the situation.
/// </summary>
public static class Recurrence
{
    public const string KindInterval = "interval";
    public const string KindDaily = "daily";
    public const int MinIntervalMinutes = 5;
    public const int MaxIntervalMinutes = 60 * 24 * 30;

    /// <summary>An occurrence sent later than this after its time is a catch-up (and, with
    /// catch-up off, is skipped instead).</summary>
    public static readonly TimeSpan OnTimeTolerance = TimeSpan.FromMinutes(10);

    /// <summary>Consecutive failed/refused runs after which a task pauses itself.</summary>
    public const int AutoPauseAfter = 3;

    public const string TriggerSchedule = "schedule", TriggerCatchUp = "catch-up", TriggerManual = "manual";
    public const string OutcomeOk = "ok", OutcomeAttention = "attention", OutcomeFailed = "failed", OutcomeUnreported = "unreported";

    /// <summary>interval: every <see cref="EveryMinutes"/> from the anchor. daily: at
    /// <see cref="At"/> ("HH:mm", harness-local) on <see cref="Days"/> (null/empty = every day).</summary>
    public sealed record Schedule(string Kind, int EveryMinutes = 0, string? At = null, IReadOnlyList<DayOfWeek>? Days = null);

    public sealed record Policy(bool CatchUp = true, bool SkipWhenBusy = false);

    /// <summary>What the scheduler observed this tick. <see cref="HoldReason"/> is any
    /// external reason to wait (an active drive loop on the agent, a precondition).</summary>
    public sealed record Situation(DateTimeOffset Now, bool Enabled, bool GateOpen, bool AgentBusy, string? HoldReason = null);

    public abstract record Decision
    {
        /// <summary>Nothing due. <see cref="NextDue"/> is null when the task is paused.</summary>
        public sealed record Idle(DateTimeOffset? NextDue) : Decision;
        /// <summary>Due but waiting; nothing is written to history — the card shows the reason.</summary>
        public sealed record Hold(DateTimeOffset DueAt, int Missed, string Reason) : Decision;
        /// <summary>Send now. The caller records the run and sets lastHandledDue = DueAt.</summary>
        public sealed record Fire(DateTimeOffset DueAt, int Missed, string Trigger) : Decision;
        /// <summary>Record a skipped run and set lastHandledDue = DueAt.</summary>
        public sealed record Skip(DateTimeOffset DueAt, int Missed, string Reason) : Decision;
    }

    public sealed record Outcome(string Kind, string Summary);

    // ── schedule ────────────────────────────────────────────────────────────────────────

    /// <summary>Null when valid, else the sentence to show the Operator.</summary>
    public static string? Validate(Schedule? s)
    {
        if (s is null) return "a schedule is required";
        switch (s.Kind)
        {
            case KindInterval:
                if (s.EveryMinutes < MinIntervalMinutes) return $"the interval must be at least {MinIntervalMinutes} minutes";
                if (s.EveryMinutes > MaxIntervalMinutes) return "the interval must be at most 30 days";
                return null;
            case KindDaily:
                return TryAt(s.At, out _) ? null : "the time of day must be HH:mm (00:00–23:59)";
            default:
                return $"unknown schedule kind '{s.Kind}' — use '{KindInterval}' or '{KindDaily}'";
        }
    }

    /// <summary>The first occurrence strictly after <paramref name="after"/>. Interval
    /// occurrences are anchor + k·every (k ≥ 1): creating a task does not fire it.</summary>
    public static DateTimeOffset NextAfter(Schedule s, DateTimeOffset anchor, DateTimeOffset after, TimeZoneInfo tz)
    {
        if (after < anchor) after = anchor;
        if (s.Kind == KindInterval)
        {
            var every = TimeSpan.FromMinutes(s.EveryMinutes).Ticks;
            var k = (after - anchor).Ticks / every + 1;
            return anchor + TimeSpan.FromTicks(every * k);
        }
        TryAt(s.At, out var at);
        var day = TimeZoneInfo.ConvertTime(after, tz).Date;
        for (var d = 0; d < 15; d++)
        {
            var date = day.AddDays(d);
            if (!DayAllowed(s, date.DayOfWeek)) continue;
            var candidate = LocalAt(date, at, tz);
            if (candidate > after) return candidate;
        }
        throw new InvalidOperationException("no allowed weekday in the schedule");
    }

    /// <summary>The newest occurrence at or before <paramref name="now"/> (after the anchor),
    /// or null when none has happened yet.</summary>
    public static DateTimeOffset? LatestAtOrBefore(Schedule s, DateTimeOffset anchor, DateTimeOffset now, TimeZoneInfo tz)
    {
        if (s.Kind == KindInterval)
        {
            var every = TimeSpan.FromMinutes(s.EveryMinutes).Ticks;
            if (now < anchor) return null;
            var k = (now - anchor).Ticks / every;
            return k < 1 ? null : anchor + TimeSpan.FromTicks(every * k);
        }
        TryAt(s.At, out var at);
        var day = TimeZoneInfo.ConvertTime(now, tz).Date;
        for (var d = 0; d < 15; d++)
        {
            var date = day.AddDays(-d);
            if (!DayAllowed(s, date.DayOfWeek)) continue;
            var candidate = LocalAt(date, at, tz);
            if (candidate <= now) return candidate > anchor ? candidate : null;
        }
        return null;
    }

    /// <summary>How many occurrences lie in (from, to].</summary>
    public static int CountBetween(Schedule s, DateTimeOffset anchor, DateTimeOffset from, DateTimeOffset to, TimeZoneInfo tz)
    {
        var n = 0;
        for (var at = NextAfter(s, anchor, from, tz); at <= to && n < 100_000; at = NextAfter(s, anchor, at, tz)) n++;
        return n;
    }

    // ── the decision ladder ─────────────────────────────────────────────────────────────

    /// <summary>One card, one tick. <paramref name="lastHandledDue"/> is the newest occurrence
    /// already fired or skipped (null = none yet). At most ONE occurrence is ever pending:
    /// when several have passed, the pending one is the newest and the rest are counted in
    /// <c>Missed</c> — after downtime a task runs once, not n times.</summary>
    public static Decision Decide(Schedule s, DateTimeOffset anchor, DateTimeOffset? lastHandledDue, Policy p, Situation now, TimeZoneInfo tz)
    {
        if (!now.Enabled) return new Decision.Idle(null);
        var from = lastHandledDue is { } h && h > anchor ? h : anchor;
        var first = NextAfter(s, anchor, from, tz);
        if (first > now.Now) return new Decision.Idle(first);

        var due = LatestAtOrBefore(s, anchor, now.Now, tz) ?? first;
        var missed = Math.Max(0, CountBetween(s, anchor, from, due, tz) - 1);
        var late = now.Now - due > OnTimeTolerance;

        if (!now.GateOpen) return new Decision.Hold(due, missed, "the Operator's autopilot gate is closed");
        if (!p.CatchUp && late) return new Decision.Skip(due, missed, "missed — it could not be sent at its time and catch-up is off");
        if (now.HoldReason is { Length: > 0 } why) return new Decision.Hold(due, missed, why);
        if (now.AgentBusy)
            return p.SkipWhenBusy
                ? new Decision.Skip(due, missed, "the agent was busy")
                : new Decision.Hold(due, missed, "the agent is busy — it runs when the agent is idle");
        return new Decision.Fire(due, missed, missed > 0 || late ? TriggerCatchUp : TriggerSchedule);
    }

    // ── outcome ─────────────────────────────────────────────────────────────────────────

    private static readonly Regex Closing = new(@"^RUN\s+(OK|ATTENTION|FAILED)\b\s*[:\-—–]?\s*(.*)$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly char[] Wrapping = { '*', '`', '"', '\'', '_', '>', ' ', '\t' };

    /// <summary>The closing-line contract, read from the reply's FINAL non-empty line
    /// (markdown-tolerant), the DrivenLoop precedent. No such line → unreported.</summary>
    public static Outcome ParseClosingLine(string? reply)
    {
        var last = (reply ?? "").Split('\n').Select(l => l.Trim()).LastOrDefault(l => l.Length > 0) ?? "";
        var m = Closing.Match(last.Trim(Wrapping));
        if (!m.Success) return new Outcome(OutcomeUnreported, Clip(last.Length > 0 ? last : "the run ended without a reply"));
        var kind = m.Groups[1].Value.ToUpperInvariant() switch { "OK" => OutcomeOk, "ATTENTION" => OutcomeAttention, _ => OutcomeFailed };
        var summary = m.Groups[2].Value.Trim(Wrapping);
        return new Outcome(kind, Clip(summary.Length > 0 ? summary : kind));
    }

    /// <summary>runStatus is RunSession's: done | error | stopped.</summary>
    public static Outcome OutcomeOf(string runStatus, string? reply) => runStatus switch
    {
        "error" => new Outcome(OutcomeFailed, "the turn ended with an error"),
        "stopped" => new Outcome(OutcomeFailed, "stopped by the Operator"),
        _ => ParseClosingLine(reply),
    };

    /// <summary>newestFirst: each run's outcome, or "refused" for a send that never left.
    /// Skipped runs are not passed in (a busy agent is not a failure).</summary>
    public static bool ShouldAutoPause(IEnumerable<string> newestFirst) =>
        newestFirst.Take(AutoPauseAfter).Count(o => o is OutcomeFailed or "refused") == AutoPauseAfter;

    // ── words ───────────────────────────────────────────────────────────────────────────

    public static string Words(Schedule s)
    {
        if (s.Kind == KindDaily)
        {
            var days = (s.Days ?? Array.Empty<DayOfWeek>()).Distinct().OrderBy(d => ((int)d + 6) % 7).ToList();
            var which = days.Count is 0 or 7 ? ""
                : days.SequenceEqual(new[] { DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday }) ? " (Mon–Fri)"
                : $" ({string.Join(", ", days.Select(d => d.ToString()[..3]))})";
            return $"daily at {s.At}{which}";
        }
        var m = s.EveryMinutes;
        if (m % 1440 == 0) return m == 1440 ? "every day" : $"every {m / 1440} d";
        if (m % 60 == 0) return m == 60 ? "every hour" : $"every {m / 60} h";
        return m < 60 ? $"every {m} min" : $"every {m / 60} h {m % 60} min";
    }

    // ── a run is a goal loop (revision 2) ────────────────────────────────────────────────

    /// <summary>goal (default): an occurrence ARMS the harness's goal loop — work until
    /// LOOP_DONE, verify, GOAL_VERIFIED. single: one prompt with a closing line.</summary>
    public const string ModeGoal = "goal", ModeSingle = "single";

    /// <summary>The loop cap of one run: work + verify + one repair round + slack.</summary>
    public const int DefaultMaxTurns = 6;

    /// <summary>The GOAL a recurring run arms the goal loop with. The loop's templates wrap
    /// it into both the work and the verify prompt, so everything here must read well in
    /// both. The result line sits ABOVE GOAL_VERIFIED (which must stay the final line).</summary>
    public static string ComposeGoal(string title, string id, int runNumber, DateTimeOffset dueLocal, Schedule s,
        string machine, int missed, string? previousRun, string instructions) =>
        $"[Recurring task] {title}\n" +
        $"Recurring id: {id} · run #{runNumber} · due {dueLocal:yyyy-MM-dd HH:mm} · {Words(s)} · armed by the harness scheduler on {machine}" +
        (missed > 0 ? $" · covers {missed} earlier occurrence{(missed == 1 ? "" : "s")} that could not be run" : "") + "\n" +
        $"Previous run: {(string.IsNullOrWhiteSpace(previousRun) ? "none — this is the first run" : previousRun)}\n\n" +
        instructions.Trim() + "\n\n" +
        "This is an unattended, recurring run. Do what the instructions say and nothing else; if there is nothing to do, " +
        "say so in one sentence. Do not push, merge or deploy unless the instructions explicitly say so. " +
        "When you confirm the goal is verified, put ONE result line directly above GOAL_VERIFIED: " +
        "\"RUN OK: <one-line result>\" or \"RUN ATTENTION: <what the Operator should look at>\".";

    /// <summary>The last RUN … line anywhere in the reply — in a goal run the final line is
    /// GOAL_VERIFIED, so the result line sits above it. Null when there is none.</summary>
    public static Outcome? FindResultLine(string? reply) =>
        (reply ?? "").Split('\n').Reverse().Select(ParseClosingLine).FirstOrDefault(o => o.Kind != OutcomeUnreported);

    private static readonly Regex NeedsHuman = new(@"NEEDS_HUMAN:\s*(.+)", RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>A goal-loop run's outcome IS the loop's resolution (LoopConfigStore statuses:
    /// done | escalate | capped | error | stopped). A verified run is refined by its result
    /// line; an escalation is ATTENTION with the agent's question — not a failure.</summary>
    public static Outcome OutcomeOfLoop(string loopStatus, string? stopReason, string? detail, int turns, string? finalReply)
    {
        switch (loopStatus)
        {
            case "done":
                return FindResultLine(finalReply) ?? new Outcome(OutcomeOk, "goal verified");
            case "escalate":
                var q = NeedsHuman.Matches(finalReply ?? "").LastOrDefault()?.Groups[1].Value.Trim(Wrapping);
                return new Outcome(OutcomeAttention, Clip("the agent asks: " + (string.IsNullOrEmpty(q) ? detail ?? "it needs a decision from the Operator" : q)));
            case "capped":
                return new Outcome(OutcomeFailed, $"not verified within {turns} turns");
            case "stopped":
                return new Outcome(OutcomeFailed, "stopped by the Operator");
            case "error":
                return new Outcome(OutcomeFailed, Clip(detail ?? stopReason ?? "the loop ended with an error"));
            default:
                return new Outcome(OutcomeUnreported, Clip(detail ?? loopStatus));
        }
    }

    /// <summary>The marker every recurring send carries (goal text and single prompt alike).</summary>
    public const string Marker = "[Recurring task]";

    /// <summary>True when the newest USER message of a transcript tail is a recurring run's —
    /// so whatever the agent said last belongs to that run, not to a board card.</summary>
    public static bool IsRecurringTail(IEnumerable<(string Role, string Text)> tail)
    {
        var lastUser = tail.LastOrDefault(m => m.Role == "user");
        return lastUser.Text is { } text && text.Contains(Marker, StringComparison.Ordinal);
    }

    /// <summary>The slot rule: a recurring run needs the agent's ONE loop slot. Null when it
    /// may arm, else the hold reason the card shows.</summary>
    public static string? SlotHold(bool loopSlotActive, string? activeArmedBy) =>
        !loopSlotActive ? null
        : activeArmedBy is not null && (activeArmedBy == "recurring" || activeArmedBy.StartsWith("recurring@", StringComparison.Ordinal)) ? "another recurring run is using the agent's loop slot — it runs when that ends"
        : $"the agent's loop slot is in use ({activeArmedBy ?? "operator"}'s loop) — it runs when that ends";

    /// <summary>SINGLE mode's send envelope. "Previous run" gives the agent continuity across runs
    /// without the task owning a session.</summary>
    public static string ComposePrompt(string title, string id, int runNumber, DateTimeOffset dueLocal, Schedule s,
        string machine, int missed, string? previousRun, string instructions) =>
        $"[Recurring task] {title}\n" +
        $"Recurring id: {id} · run #{runNumber} · due {dueLocal:yyyy-MM-dd HH:mm} · {Words(s)} · sent by the harness scheduler on {machine}" +
        (missed > 0 ? $" · covers {missed} earlier occurrence{(missed == 1 ? "" : "s")} that could not be sent" : "") + "\n" +
        $"Previous run: {(string.IsNullOrWhiteSpace(previousRun) ? "none — this is the first run" : previousRun)}\n\n" +
        instructions.Trim() + "\n\n" +
        "This is an unattended, recurring run. Do what the instructions say and nothing else; if there is nothing to do, " +
        "say so in one sentence. Do not push, merge or deploy unless the instructions explicitly say so. " +
        "End your reply with ONE closing line, exactly one of:\n" +
        "\"RUN OK: <one-line result>\" · \"RUN ATTENTION: <what the Operator should look at>\" · \"RUN FAILED: <why>\".\n" +
        "The harness reads that line into this task's run history.";

    // ── helpers ─────────────────────────────────────────────────────────────────────────

    private static bool TryAt(string? at, out TimeSpan t) =>
        TimeSpan.TryParseExact(at ?? "", @"hh\:mm", CultureInfo.InvariantCulture, out t);

    private static bool DayAllowed(Schedule s, DayOfWeek d) => s.Days is not { Count: > 0 } || s.Days.Contains(d);

    /// <summary>A wall-clock time on a local date; a time swallowed by the DST gap moves one hour on.</summary>
    private static DateTimeOffset LocalAt(DateTime date, TimeSpan at, TimeZoneInfo tz)
    {
        var local = DateTime.SpecifyKind(date.Date + at, DateTimeKind.Unspecified);
        if (tz.IsInvalidTime(local)) local = local.AddHours(1);
        return new DateTimeOffset(local, tz.GetUtcOffset(local));
    }

    private static string Clip(string s) => s.Length <= 300 ? s : s[..297] + "…";
}
