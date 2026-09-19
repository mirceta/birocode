using ClaudeWeb.Services.Recurring;
using Xunit;
using static ClaudeWeb.Services.Recurring.Recurrence;

namespace ClaudeWeb.Tests;

/// <summary>openspec recurring-tasks (design-pass prototype): the scheduling semantics worth
/// pinning before any service exists — fixed grid, one pending occurrence with missed ones
/// coalesced, busy holds (never queues), the gate holds, the closing line is machine-read,
/// a task that keeps failing pauses itself.</summary>
public sealed class RecurrenceTests
{
    private static readonly TimeZoneInfo Utc = TimeZoneInfo.Utc;
    private static DateTimeOffset T(int d, int h, int m = 0) => new(2026, 9, d, h, m, 0, TimeSpan.Zero);
    private static readonly Schedule Hourly = new(KindInterval, EveryMinutes: 60);
    private static Situation At(DateTimeOffset now, bool busy = false, bool gate = true, bool enabled = true, string? hold = null) =>
        new(now, enabled, gate, busy, hold);

    [Fact]
    public void Interval_occurrences_sit_on_a_fixed_grid_and_creation_does_not_fire()
    {
        var anchor = T(21, 10);
        Assert.Equal(T(21, 11), NextAfter(Hourly, anchor, anchor, Utc));          // first = one interval after the anchor
        Assert.Equal(T(21, 12), NextAfter(Hourly, anchor, T(21, 11), Utc));       // strictly after
        Assert.Equal(T(21, 12), NextAfter(Hourly, anchor, T(21, 11, 59), Utc));   // a late run does not shift the grid
        Assert.Null(LatestAtOrBefore(Hourly, anchor, T(21, 10, 30), Utc));
        Assert.Equal(T(21, 13), LatestAtOrBefore(Hourly, anchor, T(21, 13, 59), Utc));
        Assert.IsType<Decision.Idle>(Decide(Hourly, anchor, null, new Policy(), At(anchor), Utc));
    }

    [Fact]
    public void Validate_names_what_is_wrong()
    {
        Assert.Null(Validate(Hourly));
        Assert.Null(Validate(new Schedule(KindDaily, At: "07:00")));
        Assert.Contains("at least 5", Validate(new Schedule(KindInterval, EveryMinutes: 1)));
        Assert.Contains("HH:mm", Validate(new Schedule(KindDaily, At: "7am")));
        Assert.Contains("HH:mm", Validate(new Schedule(KindDaily, At: "24:00")));
        Assert.Contains("unknown schedule kind", Validate(new Schedule("cron")));
        Assert.NotNull(Validate(null));
    }

    [Fact]
    public void Daily_schedule_honours_the_weekdays()
    {
        var weekdays = new Schedule(KindDaily, At: "07:00",
            Days: new[] { DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday });
        var friday = T(18, 8);
        Assert.Equal(DayOfWeek.Friday, friday.DayOfWeek);
        var next = NextAfter(weekdays, T(1, 0), friday, Utc);
        Assert.Equal(DayOfWeek.Monday, next.DayOfWeek);
        Assert.Equal(T(21, 7), next);
        Assert.Equal(T(18, 7), LatestAtOrBefore(weekdays, T(1, 0), T(20, 12), Utc));   // Sunday noon → Friday's was the newest
    }

    [Fact]
    public void A_daily_time_swallowed_by_the_DST_gap_moves_one_hour_on()
    {
        TimeZoneInfo cet;
        try { cet = TimeZoneInfo.FindSystemTimeZoneById("Europe/Ljubljana"); }
        catch { cet = TimeZoneInfo.FindSystemTimeZoneById("Central European Standard Time"); }
        var s = new Schedule(KindDaily, At: "02:30");
        var after = new DateTimeOffset(2026, 3, 28, 12, 0, 0, TimeSpan.Zero);
        var next = NextAfter(s, after.AddDays(-5), after, cet);
        Assert.Equal(new DateTime(2026, 3, 29, 1, 30, 0, DateTimeKind.Utc), next.UtcDateTime);   // 03:30 +02:00
    }

    [Fact]
    public void Due_and_idle_agent_fires_on_schedule_then_goes_idle_until_the_next()
    {
        var anchor = T(21, 10);
        var fire = Assert.IsType<Decision.Fire>(Decide(Hourly, anchor, null, new Policy(), At(T(21, 11, 0).AddSeconds(8)), Utc));
        Assert.Equal(T(21, 11), fire.DueAt);
        Assert.Equal(0, fire.Missed);
        Assert.Equal(TriggerSchedule, fire.Trigger);
        var idle = Assert.IsType<Decision.Idle>(Decide(Hourly, anchor, fire.DueAt, new Policy(), At(T(21, 11, 1)), Utc));
        Assert.Equal(T(21, 12), idle.NextDue);
    }

    [Fact]
    public void A_busy_agent_holds_the_run_and_nothing_is_queued_unless_the_task_says_skip()
    {
        var anchor = T(21, 10);
        var hold = Assert.IsType<Decision.Hold>(Decide(Hourly, anchor, null, new Policy(), At(T(21, 11, 3), busy: true), Utc));
        Assert.Equal(T(21, 11), hold.DueAt);
        Assert.Contains("busy", hold.Reason);
        // Idle again at 11:07 → it fires then, still for the 11:00 occurrence, on time (< 10 min).
        var fire = Assert.IsType<Decision.Fire>(Decide(Hourly, anchor, null, new Policy(), At(T(21, 11, 7)), Utc));
        Assert.Equal(T(21, 11), fire.DueAt);
        Assert.Equal(TriggerSchedule, fire.Trigger);
        var skip = Assert.IsType<Decision.Skip>(Decide(Hourly, anchor, null, new Policy(SkipWhenBusy: true), At(T(21, 11, 3), busy: true), Utc));
        Assert.Equal("the agent was busy", skip.Reason);
    }

    [Fact]
    public void Missed_occurrences_coalesce_into_one_catch_up_run()
    {
        var anchor = T(21, 0);
        // Handled 01:00; the harness was off 01:30–06:20 → 02,03,04,05 missed, 06:00 is the pending one.
        var fire = Assert.IsType<Decision.Fire>(Decide(Hourly, anchor, T(21, 1), new Policy(), At(T(21, 6, 20)), Utc));
        Assert.Equal(T(21, 6), fire.DueAt);
        Assert.Equal(4, fire.Missed);
        Assert.Equal(TriggerCatchUp, fire.Trigger);
        var idle = Assert.IsType<Decision.Idle>(Decide(Hourly, anchor, fire.DueAt, new Policy(), At(T(21, 6, 21)), Utc));
        Assert.Equal(T(21, 7), idle.NextDue);                                       // once, not five times
    }

    [Fact]
    public void With_catch_up_off_a_late_occurrence_is_skipped_not_run()
    {
        var skip = Assert.IsType<Decision.Skip>(Decide(Hourly, T(21, 0), T(21, 1), new Policy(CatchUp: false), At(T(21, 6, 20)), Utc));
        Assert.Equal(T(21, 6), skip.DueAt);
        Assert.Equal(4, skip.Missed);
        // …but an on-time one still fires.
        Assert.IsType<Decision.Fire>(Decide(Hourly, T(21, 0), T(21, 5), new Policy(CatchUp: false), At(T(21, 6, 2)), Utc));
    }

    [Fact]
    public void The_gate_a_pause_and_an_external_reason_all_keep_the_send_back()
    {
        var anchor = T(21, 10);
        var gate = Assert.IsType<Decision.Hold>(Decide(Hourly, anchor, null, new Policy(), At(T(21, 11, 1), gate: false), Utc));
        Assert.Contains("gate", gate.Reason);
        var paused = Assert.IsType<Decision.Idle>(Decide(Hourly, anchor, null, new Policy(), At(T(21, 11, 1), enabled: false), Utc));
        Assert.Null(paused.NextDue);
        var loop = Assert.IsType<Decision.Hold>(Decide(Hourly, anchor, null, new Policy(), At(T(21, 11, 1), hold: "a drive loop owns the agent"), Utc));
        Assert.Equal("a drive loop owns the agent", loop.Reason);
    }

    [Theory]
    [InlineData("All green.\n\nRUN OK: 10 of 10 runs passed", OutcomeOk, "10 of 10 runs passed")]
    [InlineData("…\n**RUN ATTENTION: deploy.yml failed twice on main**\n\n", OutcomeAttention, "deploy.yml failed twice on main")]
    [InlineData("`run failed - gh is not authenticated`", OutcomeFailed, "gh is not authenticated")]
    [InlineData("RUN OK", OutcomeOk, "ok")]
    [InlineData("RUN OK: early\nand then more words", OutcomeUnreported, "and then more words")]     // only the FINAL line counts
    [InlineData("", OutcomeUnreported, "the run ended without a reply")]
    public void The_closing_line_is_read_from_the_final_line_without_a_model(string reply, string kind, string summary)
    {
        var o = ParseClosingLine(reply);
        Assert.Equal(kind, o.Kind);
        Assert.Equal(summary, o.Summary);
    }

    [Fact]
    public void An_errored_or_stopped_turn_is_a_failed_run_whatever_it_said()
    {
        Assert.Equal(OutcomeFailed, OutcomeOf("error", "RUN OK: fine").Kind);
        Assert.Equal("stopped by the Operator", OutcomeOf("stopped", null).Summary);
        Assert.Equal(OutcomeOk, OutcomeOf("done", "RUN OK: fine").Kind);
    }

    [Fact]
    public void Three_consecutive_failures_pause_the_task_but_an_ok_in_between_does_not()
    {
        Assert.True(ShouldAutoPause(new[] { OutcomeFailed, "refused", OutcomeFailed, OutcomeOk }));
        Assert.False(ShouldAutoPause(new[] { OutcomeFailed, OutcomeOk, OutcomeFailed, OutcomeFailed }));
        Assert.False(ShouldAutoPause(new[] { OutcomeFailed, OutcomeFailed }));
        Assert.False(ShouldAutoPause(new[] { OutcomeAttention, OutcomeAttention, OutcomeAttention }));   // attention is a result, not a failure
    }

    [Fact]
    public void Words_and_the_envelope_say_what_the_agent_and_the_Operator_need()
    {
        Assert.Equal("every 2 h", Words(new Schedule(KindInterval, EveryMinutes: 120)));
        Assert.Equal("every 15 min", Words(new Schedule(KindInterval, EveryMinutes: 15)));
        Assert.Equal("every 1 h 30 min", Words(new Schedule(KindInterval, EveryMinutes: 90)));
        Assert.Equal("every day", Words(new Schedule(KindInterval, EveryMinutes: 1440)));
        Assert.Equal("daily at 07:00 (Mon–Fri)", Words(new Schedule(KindDaily, At: "07:00",
            Days: new[] { DayOfWeek.Friday, DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday })));
        Assert.Equal("daily at 22:30 (Sat, Sun)", Words(new Schedule(KindDaily, At: "22:30", Days: new[] { DayOfWeek.Sunday, DayOfWeek.Saturday })));

        var text = ComposePrompt("CI health check", "9f2c", 42, T(21, 14), new Schedule(KindInterval, EveryMinutes: 120),
            "DESKTOP-POAPPP3", missed: 2, previousRun: "2026-09-21 12:00 — OK: all green", instructions: "  Look at the last 10 runs.  ");
        Assert.StartsWith("[Recurring task] CI health check\n", text);
        Assert.Contains("run #42 · due 2026-09-21 14:00 · every 2 h", text);
        Assert.Contains("covers 2 earlier occurrences", text);
        Assert.Contains("Previous run: 2026-09-21 12:00 — OK: all green", text);
        Assert.Contains("\n\nLook at the last 10 runs.\n\n", text);
        Assert.Contains("RUN ATTENTION:", text);
        Assert.Contains("first run", ComposePrompt("t", "i", 1, T(21, 14), Hourly, "m", 0, null, "x"));
    }
}
