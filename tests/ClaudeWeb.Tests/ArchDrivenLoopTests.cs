using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Driven loop kinds on the arch agent (openspec arch-driven-loops): the
/// policy the engine applies on top of a goal/recipe/queue decision for the reserved
/// <c>@arch</c> instance — questions hold, repeats are paced by a wake OR the quiet
/// floor, the first send of an arming always goes — and the standing-loop memory the
/// arch state keeps so the wake loop returns after a driven loop ends.</summary>
public sealed class ArchDrivenLoopTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-archdriven-" + Guid.NewGuid().ToString("N"));
    private static readonly TimeSpan Floor = TimeSpan.FromMinutes(5);

    public ArchDrivenLoopTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    // A fresh arming; with `sent` > 0 the sends are stamped AFTER ArmedAt (a send from a
    // previous arming is older than the arm and must not count — that was the bug).
    private LoopConfigStore.LoopState Armed(int sent = 0, long sentOffsetMs = 1000)
    {
        var store = new LoopConfigStore(new Logger(), _dir);
        var s = store.StartGoal("@arch", "get every repo green", null, "drive", "sess");
        for (var i = 0; i < sent; i++) store.RecordSend("@arch", s.ArmedAt + sentOffsetMs);
        return store.Get("@arch")!;
    }

    private static LoopDecision Apply(LoopDecision d, LoopConfigStore.LoopState inst, string? last, long now, bool wake) =>
        ArchDrivenPolicy.Apply(d, inst, last, now, Floor, () => wake);

    // ---- NEEDS_HUMAN holds instead of stopping ----------------------------------------

    [Fact]
    public void Needs_human_stop_becomes_an_escalated_hold_naming_the_question()
    {
        var stop = new LoopDecision.Stop("escalate", "needs-human", "which repo first?");
        var hold = Assert.IsType<LoopDecision.Hold>(Apply(stop, Armed(), null, 0, false));
        Assert.True(hold.Escalate);
        Assert.Equal("which repo first?", hold.Label);
        Assert.StartsWith(ArchLoop.WaitingPrefix, hold.Reason);
    }

    [Fact]
    public void Other_stops_and_holds_pass_through_untouched()
    {
        var inst = Armed(sent: 1);
        var done = new LoopDecision.Stop("done", "verified", "GOAL_VERIFIED");
        Assert.Same(done, Apply(done, inst, "work", 0, true));
        var err = new LoopDecision.Stop("error", "error", "the turn errored");
        Assert.Same(err, Apply(err, inst, "work", 0, true));
        var hold = new LoopDecision.Hold("idle");
        Assert.Same(hold, Apply(hold, inst, "x", 0, true));
    }

    // ---- the first send of an arm always goes ---------------------------------------------

    [Fact]
    public void First_send_of_an_arm_goes_even_when_process_memory_remembers_the_same_prompt()
    {
        // The bug of 2026-09-06 00:20: a previous arm had sent the identical work prompt,
        // the in-memory last-prompt map still held it, and the fresh arm never sent.
        var inst = Armed(sent: 0);
        var work = new LoopDecision.Propose("work toward the goal");
        var probed = false;
        Assert.Same(work, Apply(work, inst, "work toward the goal", 0, wake: false));
        Assert.False(probed);
        Assert.False(ArchDrivenPolicy.HasSentThisArm(inst));

        // A send stamped BEFORE this arming (a previous arm's) does not make this arm "sent".
        var stale = Armed(sent: 1, sentOffsetMs: -60_000);
        Assert.False(ArchDrivenPolicy.HasSentThisArm(stale));
        Assert.Same(work, Apply(work, stale, "work toward the goal", stale.ArmedAt + 5000, wake: false));
    }

    [Fact]
    public void New_prompts_and_phase_changes_go_out_at_once()
    {
        var inst = Armed(sent: 1);
        var work = new LoopDecision.Propose("work toward the goal");
        Assert.Same(work, Apply(work, inst, "some other prompt", 0, false));
        var verify = new LoopDecision.Propose("verify it", EnterPhase: LoopConfigStore.PhaseVerify);
        Assert.Same(verify, Apply(verify, inst, "verify it", 0, false));
        var backToWork = new LoopDecision.Propose("work toward the goal", EnterPhase: LoopConfigStore.PhaseWork);
        Assert.Same(backToWork, Apply(backToWork, inst, "work toward the goal", 0, false));
    }

    // ---- repeats: wake OR quiet floor, whichever first ----------------------------------------

    [Fact]
    public void A_repeat_waits_for_a_wake_and_the_hold_counts_down()
    {
        var inst = Armed(sent: 1);
        var sentAt = inst.LastSentAt;
        Assert.True(ArchDrivenPolicy.HasSentThisArm(inst));
        var work = new LoopDecision.Propose("work toward the goal");

        var hold = Assert.IsType<LoopDecision.Hold>(Apply(work, inst, "work toward the goal", sentAt + 60_000, wake: false));
        Assert.False(hold.Escalate);
        Assert.StartsWith(ArchDrivenPolicy.WaitingForWake, hold.Reason);
        Assert.Contains("re-prompt in 4:00", hold.Reason);

        Assert.Same(work, Apply(work, inst, "work toward the goal", sentAt + 60_000, wake: true));
    }

    [Fact]
    public void The_quiet_floor_sends_the_repeat_even_in_silence()
    {
        var inst = Armed(sent: 1);
        var sentAt = inst.LastSentAt;
        var work = new LoopDecision.Propose("work toward the goal");
        Assert.IsType<LoopDecision.Hold>(Apply(work, inst, "work toward the goal", sentAt + (long)Floor.TotalMilliseconds - 1, wake: false));
        Assert.Same(work, Apply(work, inst, "work toward the goal", sentAt + (long)Floor.TotalMilliseconds, wake: false));
        Assert.Same(work, Apply(work, inst, "work toward the goal", sentAt + 3 * (long)Floor.TotalMilliseconds, wake: false));
    }

    [Fact]
    public void A_zero_floor_falls_back_to_the_default()
    {
        var inst = Armed(sent: 1);
        var sentAt = inst.LastSentAt;
        var work = new LoopDecision.Propose("work toward the goal");
        var hold = Assert.IsType<LoopDecision.Hold>(ArchDrivenPolicy.Apply(work, inst, "work toward the goal", sentAt + 1000, TimeSpan.Zero, () => false));
        Assert.Contains("re-prompt in 4:59", hold.Reason);
        Assert.Same(work, ArchDrivenPolicy.Apply(work, inst, "work toward the goal", sentAt + (long)ArchDrivenPolicy.DefaultQuietFloor.TotalMilliseconds, TimeSpan.Zero, () => false));
    }

    // ---- the standing loop is remembered and restored; the quiet floor persists ---------------

    [Fact]
    public void Standing_loop_memory_and_quiet_floor_round_trip()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        Assert.Null(store.StandingLoop);
        Assert.Equal(0, store.DrivenQuietSeconds);
        store.SetStandingLoop("drive", 0);
        store.SetDrivenQuietSeconds(120);
        var again = new ArchStateStore(new Logger(), _dir);
        Assert.Equal(("drive", 0), again.StandingLoop);
        Assert.Equal(120, again.DrivenQuietSeconds);
        again.ClearStandingLoop();
        Assert.Null(new ArchStateStore(new Logger(), _dir).StandingLoop);
        again.SetDrivenQuietSeconds(-5);
        Assert.Equal(0, again.DrivenQuietSeconds);
    }

    [Fact]
    public void A_driven_kind_can_take_the_reserved_slot_and_the_arch_kind_comes_back_after()
    {
        var loops = new LoopConfigStore(new Logger(), _dir);
        loops.StartArch("@arch", "drive", 0, "sess");
        var goal = loops.StartGoal("@arch", "get every repo green", null, "drive", "sess");
        Assert.Equal(LoopConfigStore.KindGoal, goal.Kind);
        Assert.True(goal.Active);
        loops.Resolve("@arch", "done", "verified", "GOAL_VERIFIED");
        var restored = loops.StartArch("@arch", "drive", 0, "sess");
        Assert.Equal(LoopConfigStore.KindArch, restored.Kind);
        Assert.True(restored.Active);
        Assert.Equal(0, restored.MaxIterations);
    }
}
