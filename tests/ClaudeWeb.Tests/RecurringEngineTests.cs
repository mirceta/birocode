using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Recurring;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec recurring-tasks: the engine against a fake port — a due occurrence ARMS
/// a goal loop and the run's outcome is the loop's resolution; the loop slot arbitrates
/// (held, never queued) and is handed back; refusals and usage are recorded honestly; three
/// failures pause the task; everything survives a restart because it is polled from disk.</summary>
public sealed class RecurringEngineTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-recurring-" + Guid.NewGuid().ToString("N"));
    public RecurringEngineTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private const long T0 = 1_800_000_000_000;   // an arbitrary "now"
    private const long Min = 60_000;

    private sealed class FakePort : IRecurringPort
    {
        public bool Known = true, Busy, LoopActive, OnDefault = true;
        public string? LoopArmedBy, Refusal;
        public double? Usage;
        public LoopProbe? Probe;
        public string? Reply;
        public PortResult? ArmResult;
        public readonly List<string> Armed = new(), Sent = new(), Restored = new();
        public int Stops;
        public long NextArmedAt = 111;

        public string Label(string? sourceId, string repoId) => $"{sourceId ?? "hub"}/{repoId}";
        public AgentSituation Situation(string? sourceId, string repoId) =>
            new(Known, sourceId ?? "hub", repoId, Busy, LoopActive, LoopArmedBy, OnDefault, Usage, Known ? null : Refusal ?? "unreachable");
        public PortResult ArmGoal(string? sourceId, string repoId, string goal, int maxTurns)
        {
            if (ArmResult is { } forced) return forced;
            Armed.Add(goal);
            Probe = new LoopProbe(true, "looping", null, null, 0, "work", NextArmedAt, LoopConfigStore.ArmedByRecurring);
            return new PortResult(true, "armed", "armed", NextArmedAt, "sess-1", "{\"Kind\":\"recipe\"}");
        }
        public LoopProbe? ProbeLoop(string? sourceId, string repoId) => Probe;
        public PortResult StopLoop(string? sourceId, string repoId) { Stops++; Probe = Probe! with { Active = false, Status = "stopped", StopReason = "operator" }; return new(true, "stopped", "stopped"); }
        public bool RestoreSlot(string repoId, string snapshot, long loopArmedAt) { Restored.Add($"{repoId}|{snapshot}|{loopArmedAt}"); return true; }
        public PortResult SendOnce(string? sourceId, string repoId, string text) { Sent.Add(text); Busy = true; return new(true, "sent", "sent"); }
        public string? LastReply(string? sourceId, string repoId, long sinceMs) => Reply;
    }

    private sealed class Rig
    {
        public long Now = T0;
        public bool Gate = true;
        public readonly FakePort Port = new();
        public readonly RecurringTaskStore Store;
        public readonly RecurringRunLog Log;
        public readonly RecurringEngine Engine;
        public readonly List<string> Events = new();
        public Rig(string dir)
        {
            Store = new RecurringTaskStore(new Logger(), dir);
            Log = new RecurringRunLog(new Logger(), dir);
            Engine = new RecurringEngine(Store, Log, Port, () => Gate, () => Now, TimeZoneInfo.Utc, (type, _, _) => Events.Add(type));
        }
        public RecurringTask Add(string mode = Recurrence.ModeGoal, PolicySpec? policy = null, int every = 60) =>
            Store.Add(new RecurringTask("t1", "CI health check", null, "repo1", "Look at the last 10 runs.", new ScheduleSpec("interval", every),
                new RunSpec(mode, 6), policy ?? new PolicySpec(), true, null, T0, null, 0, T0, T0, "operator"));
        public RecurringRun Last => Log.Runs("t1", 1)[0];
    }

    [Fact]
    public void A_due_occurrence_arms_a_goal_loop_and_the_loops_resolution_is_the_runs_outcome()
    {
        var r = new Rig(_dir); r.Add();
        r.Engine.Tick();
        Assert.Empty(r.Port.Armed);                                           // creating a card does not fire it

        r.Now = T0 + 60 * Min + 4000;
        r.Engine.Tick();
        var goal = Assert.Single(r.Port.Armed);
        Assert.StartsWith("[Recurring task] CI health check\n", goal);
        Assert.Contains("run #1", goal);
        Assert.Contains("Previous run: none", goal);
        Assert.Equal("running", r.Last.Status);
        Assert.Equal("work", r.Last.Phase);
        Assert.Equal(T0 + 60 * Min, r.Store.Get("t1")!.LastHandledDueAt);
        Assert.Equal(1, r.Store.Get("t1")!.RunCount);

        // The loop engine moves it on; the card follows by polling.
        r.Port.Probe = r.Port.Probe! with { Iterations = 2, Phase = "verify" };
        r.Now += 30_000; r.Engine.Tick();
        Assert.Equal((2, "verify"), (r.Last.Turns, r.Last.Phase));
        Assert.Single(r.Port.Armed);                                          // still one run — nothing re-armed

        // Verified, with a result line above the token.
        r.Port.Probe = r.Port.Probe with { Active = false, Status = "done", StopReason = "verified", Iterations = 3, Phase = "verify" };
        r.Port.Reply = "Re-checked with gh.\nRUN ATTENTION: deploy.yml failed twice on main\nGOAL_VERIFIED";
        r.Now += 30_000; r.Engine.Tick();
        Assert.Equal(("done", "verified", 3), (r.Last.Status, r.Last.StopReason, r.Last.Turns));
        Assert.Equal((Recurrence.OutcomeAttention, "deploy.yml failed twice on main"), (r.Last.Outcome, r.Last.Summary));
        Assert.Null(r.Last.SlotSnapshot);                                     // the prompts do not linger in the history
        Assert.Equal("repo1|{\"Kind\":\"recipe\"}|111", Assert.Single(r.Port.Restored));   // the borrowed slot went back
        Assert.Equal(new[] { "recurring.fired", "recurring.ended" }, r.Events);

        // The next run is told how the previous one ended.
        r.Now = T0 + 120 * Min + 1000; r.Port.NextArmedAt = 222;
        r.Engine.Tick();
        Assert.Contains("— ATTENTION: deploy.yml failed twice on main", r.Port.Armed[1]);
        Assert.Contains("run #2", r.Port.Armed[1]);
    }

    [Fact]
    public void A_loop_slot_in_use_holds_the_occurrence_and_nothing_is_recorded()
    {
        var r = new Rig(_dir); r.Add();
        r.Port.LoopActive = true; r.Port.LoopArmedBy = "operator";
        r.Now = T0 + 61 * Min;
        r.Engine.Tick();
        Assert.Empty(r.Port.Armed);
        Assert.Empty(r.Log.Runs("t1"));
        Assert.Contains("loop slot is in use", r.Engine.HoldOf("t1")!.Reason);

        r.Port.LoopActive = false; r.Port.Busy = true;                         // now a turn is running
        r.Engine.Tick();
        Assert.Contains("busy", r.Engine.HoldOf("t1")!.Reason);

        r.Port.Busy = false; r.Now = T0 + 95 * Min;                            // free at last, 35 min late
        r.Engine.Tick();
        Assert.Single(r.Port.Armed);
        Assert.Equal(Recurrence.TriggerCatchUp, r.Last.Trigger);
        Assert.Equal(T0 + 60 * Min, r.Last.DueAt);                             // still the 1-hour occurrence
        Assert.Null(r.Engine.HoldOf("t1"));
    }

    [Fact]
    public void While_its_own_run_is_looping_the_next_occurrence_waits_behind_it()
    {
        var r = new Rig(_dir); r.Add();
        r.Now = T0 + 60 * Min + 1000; r.Engine.Tick();
        r.Now = T0 + 121 * Min; r.Engine.Tick();                               // the 2-hour occurrence comes due mid-run
        Assert.Single(r.Port.Armed);
        Assert.Contains("previous run of this task", r.Engine.HoldOf("t1")!.Reason);
    }

    [Fact]
    public void The_gate_holds_everything_and_run_now_is_refused_while_it_is_closed()
    {
        var r = new Rig(_dir); r.Add();
        r.Gate = false; r.Now = T0 + 61 * Min;
        r.Engine.Tick();
        Assert.Empty(r.Port.Armed);
        Assert.Contains("gate", r.Engine.HoldOf("t1")!.Reason);
        Assert.Equal(403, r.Engine.RunNow("t1").Http);

        r.Gate = true;
        Assert.True(r.Engine.RunNow("t1").Ok);
        Assert.Equal(Recurrence.TriggerManual, r.Last.Trigger);
        Assert.Null(r.Store.Get("t1")!.LastHandledDueAt);                      // a manual run does not consume the schedule
        Assert.Equal(409, r.Engine.RunNow("t1").Http);                         // one run at a time
    }

    [Fact]
    public void An_escalation_is_attention_with_the_question_and_a_capped_run_is_failed()
    {
        var r = new Rig(_dir); r.Add();
        r.Now = T0 + 60 * Min + 1000; r.Engine.Tick();
        r.Port.Probe = r.Port.Probe! with { Active = false, Status = "escalate", StopReason = "needs-human", Iterations = 1 };
        r.Port.Reply = "Stopped.\nNEEDS_HUMAN: origin/main was force-pushed — reset or keep local commits?";
        r.Engine.Tick();
        Assert.Equal(("escalated", Recurrence.OutcomeAttention), (r.Last.Status, r.Last.Outcome));
        Assert.Equal("the agent asks: origin/main was force-pushed — reset or keep local commits?", r.Last.Summary);

        r.Now = T0 + 120 * Min + 1000; r.Port.NextArmedAt = 222; r.Engine.Tick();
        r.Port.Probe = r.Port.Probe! with { Active = false, Status = "capped", StopReason = "cap", Iterations = 6 };
        r.Engine.Tick();
        Assert.Equal((Recurrence.OutcomeFailed, "not verified within 6 turns"), (r.Last.Outcome, r.Last.Summary));
        Assert.True(r.Store.Get("t1")!.Enabled);                               // one failure does not pause it
    }

    [Fact]
    public void Three_refusals_in_a_row_pause_the_task()
    {
        var r = new Rig(_dir); r.Add();
        r.Port.Known = false; r.Port.Refusal = "living-room is unreachable";
        for (var h = 1; h <= 3; h++) { r.Now = T0 + h * 60 * Min + 1000; r.Engine.Tick(); }
        var runs = r.Log.Runs("t1");
        Assert.Equal(3, runs.Count);
        Assert.All(runs, x => Assert.Equal(("refused", "living-room is unreachable"), (x.Status, x.Reason)));
        var t = r.Store.Get("t1")!;
        Assert.False(t.Enabled);
        Assert.Equal("auto: 3 consecutive failures", t.PausedReason);
        Assert.Contains("recurring.paused", r.Events);
        r.Now = T0 + 4 * 60 * Min + 1000; r.Engine.Tick();
        Assert.Equal(3, r.Log.Runs("t1").Count);                               // paused: nothing more is attempted
    }

    [Fact]
    public void Plan_usage_above_the_limit_skips_the_run_and_says_so()
    {
        var r = new Rig(_dir); r.Add();
        r.Port.Usage = 91;
        r.Now = T0 + 60 * Min + 1000; r.Engine.Tick();
        Assert.Empty(r.Port.Armed);
        Assert.Equal("skipped", r.Last.Status);
        Assert.Contains("91 %", r.Last.Reason);
        Assert.Equal(T0 + 60 * Min, r.Store.Get("t1")!.LastHandledDueAt);      // the occurrence is spent; the next one tries again
        r.Port.Usage = 40; r.Now = T0 + 120 * Min + 1000; r.Engine.Tick();
        Assert.Single(r.Port.Armed);
    }

    [Fact]
    public void A_slot_re_armed_by_someone_else_loses_the_run_and_restores_nothing()
    {
        var r = new Rig(_dir); r.Add();
        r.Now = T0 + 60 * Min + 1000; r.Engine.Tick();
        r.Port.Probe = new LoopProbe(true, "looping", null, null, 0, "work", 999, "operator");   // the Operator armed their own loop
        r.Engine.Tick();
        Assert.Equal((RecurringRun.Lost, Recurrence.OutcomeUnreported), (r.Last.Status, r.Last.Outcome));
        Assert.Empty(r.Port.Restored);
    }

    [Fact]
    public void Stop_run_stops_the_loop_and_the_run_closes_as_stopped_by_the_operator()
    {
        var r = new Rig(_dir); r.Add();
        r.Now = T0 + 60 * Min + 1000; r.Engine.Tick();
        Assert.True(r.Engine.StopRun("t1").Ok);
        r.Engine.Tick();
        Assert.Equal(("stopped", Recurrence.OutcomeFailed, "stopped by the Operator"), (r.Last.Status, r.Last.Outcome, r.Last.Summary));
        Assert.Equal(409, r.Engine.StopRun("t1").Http);
    }

    [Fact]
    public void Single_mode_sends_one_prompt_and_reads_the_closing_line_when_the_turn_ends()
    {
        var r = new Rig(_dir); r.Add(Recurrence.ModeSingle);
        r.Now = T0 + 60 * Min + 1000; r.Engine.Tick();
        Assert.Contains("RUN FAILED:", Assert.Single(r.Port.Sent));
        Assert.Empty(r.Port.Armed);
        r.Now += 20_000; r.Engine.Tick();
        Assert.Equal("running", r.Last.Status);                                // the turn is still running
        r.Port.Busy = false; r.Port.Reply = "Port 5099 answers.\nRUN OK: up";
        r.Now += 20_000; r.Engine.Tick();
        Assert.Equal(("done", Recurrence.OutcomeOk, "up", 1), (r.Last.Status, r.Last.Outcome, r.Last.Summary, r.Last.Turns));
    }

    [Fact]
    public void A_restart_re_attaches_to_the_run_because_cards_runs_and_loops_live_on_disk()
    {
        var a = new Rig(_dir); a.Add();
        a.Now = T0 + 60 * Min + 1000; a.Engine.Tick();
        var id = a.Last.Id;

        var b = new Rig(_dir);                                                  // the harness came back
        Assert.Equal("running", b.Last.Status);
        b.Port.Probe = new LoopProbe(false, "done", "verified", null, 2, "verify", 111, LoopConfigStore.ArmedByRecurring);
        b.Port.Reply = "RUN OK: all green\nGOAL_VERIFIED";
        b.Now = a.Now + 5 * Min; b.Engine.Tick();
        Assert.Equal((id, "done", Recurrence.OutcomeOk), (b.Last.Id, b.Last.Status, b.Last.Outcome));
        Assert.Single(b.Log.Runs("t1"));                                        // replaced by id, not duplicated
        // …and the jsonl is compacted to one line per run on the next start.
        _ = new RecurringRunLog(new Logger(), _dir);
        Assert.Single(File.ReadAllLines(Path.Combine(_dir, "recurring-runs.jsonl")));
    }

    [Fact]
    public void The_board_view_orders_nothing_but_tells_the_tab_everything_it_shows()
    {
        var r = new Rig(_dir); r.Add();
        r.Now = T0 + 60 * Min + 1000; r.Engine.Tick();
        var json = System.Text.Json.JsonSerializer.Serialize(r.Engine.Board());
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        var t = doc.RootElement.GetProperty("tasks")[0];
        Assert.Equal("every hour", t.GetProperty("scheduleWords").GetString());
        Assert.Equal("running", t.GetProperty("running").GetProperty("status").GetString());
        Assert.Equal("running", t.GetProperty("strip")[0].GetString());
        Assert.Equal("hub/repo1", t.GetProperty("agentLabel").GetString());
        Assert.DoesNotContain("slotSnapshot", json);                            // the borrowed record never leaves the harness
        r.Gate = false;
        Assert.DoesNotContain("Look at the last 10 runs.", System.Text.Json.JsonSerializer.Serialize(r.Engine.Board()));   // redacted while the gate is closed
    }

    [Fact]
    public void The_loop_store_lends_its_slot_and_takes_it_back_only_from_the_recurring_run()
    {
        var loops = new LoopConfigStore(new Logger(), _dir);
        loops.Start("repo1", "the Operator's recipe prompt", "LOOP_DONE", 5);
        loops.Stop("repo1");
        var snapshot = loops.SnapshotInactive("repo1");
        Assert.NotNull(snapshot);

        var armed = loops.StartGoal("repo1", "[Recurring task] x", 6, LoopConfigStore.ModeDrive, null, null, LoopConfigStore.ArmedByRecurring);
        Assert.Null(loops.SnapshotInactive("repo1"));                                        // active: nothing to lend
        Assert.False(loops.RestoreSnapshot("repo1", snapshot!, armed.ArmedAt));               // …and nothing to take back while it runs
        loops.Resolve("repo1", "done", "verified");
        Assert.False(loops.RestoreSnapshot("repo1", snapshot!, armed.ArmedAt + 1));           // not this run's generation
        Assert.True(loops.RestoreSnapshot("repo1", snapshot!, armed.ArmedAt));
        var back = loops.Get("repo1")!;
        Assert.Equal((LoopConfigStore.KindRecipe, "the Operator's recipe prompt", false), (back.Kind, back.Prompt, back.Active));

        // An empty slot is handed back empty.
        var again = loops.StartGoal("repo2", "[Recurring task] y", 6, LoopConfigStore.ModeDrive, null, null, LoopConfigStore.ArmedByRecurring);
        loops.Resolve("repo2", "done", "verified");
        Assert.True(loops.RestoreSnapshot("repo2", "", again.ArmedAt));
        Assert.Null(loops.Get("repo2"));
    }

    [Fact]
    public void A_recurring_runs_words_are_not_a_board_cards_progress()
    {
        Assert.True(Recurrence.IsRecurringTail(new[] { ("user", "fix the bug"), ("assistant", "done"), ("user", "Work toward this goal…\n[Recurring task] CI health check\n…"), ("assistant", "RUN OK: fine\nGOAL_VERIFIED") }));
        Assert.False(Recurrence.IsRecurringTail(new[] { ("user", "[Recurring task] old"), ("assistant", "ok"), ("user", "now fix the bug"), ("assistant", "working") }));
        Assert.False(Recurrence.IsRecurringTail(Array.Empty<(string, string)>()));
    }
}
