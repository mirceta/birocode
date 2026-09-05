using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Driven loop kinds on the arch agent (openspec arch-driven-loops): the
/// policy the engine applies on top of a goal/recipe/queue decision for the reserved
/// <c>@arch</c> instance, and the standing-loop memory the arch state keeps so the
/// wake loop returns after a driven loop ends.</summary>
public sealed class ArchDrivenLoopTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-archdriven-" + Guid.NewGuid().ToString("N"));

    public ArchDrivenLoopTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    // ---- NEEDS_HUMAN holds instead of stopping ----------------------------------------

    [Fact]
    public void Needs_human_stop_becomes_an_escalated_hold_naming_the_question()
    {
        var stop = new LoopDecision.Stop("escalate", "needs-human", "which repo first?");
        var hold = Assert.IsType<LoopDecision.Hold>(ArchDrivenPolicy.Apply(stop, null, () => false));
        Assert.True(hold.Escalate);
        Assert.Equal("which repo first?", hold.Label);
        Assert.StartsWith(ArchLoop.WaitingPrefix, hold.Reason);
    }

    [Fact]
    public void Other_stops_pass_through_untouched()
    {
        var done = new LoopDecision.Stop("done", "verified", "GOAL_VERIFIED");
        Assert.Same(done, ArchDrivenPolicy.Apply(done, "work", () => true));
        var err = new LoopDecision.Stop("error", "error", "the turn errored");
        Assert.Same(err, ArchDrivenPolicy.Apply(err, "work", () => true));
        var byOp = new LoopDecision.Stop("stopped", "by-operator", "stopped");
        Assert.Same(byOp, ArchDrivenPolicy.Apply(byOp, null, () => true));
    }

    // ---- re-prompts are paced by wakes ----------------------------------------------------

    [Fact]
    public void First_send_and_new_prompts_go_out_at_once()
    {
        var work = new LoopDecision.Propose("work toward the goal");
        // nothing sent yet → immediate, the wake probe is not even consulted
        var probed = false;
        Assert.Same(work, ArchDrivenPolicy.Apply(work, null, () => { probed = true; return false; }));
        Assert.False(probed);
        // a different prompt than the last one (next queue step) → immediate
        Assert.Same(work, ArchDrivenPolicy.Apply(work, "some other prompt", () => false));
        // a phase transition (verification, back-to-work) → immediate even if the text repeats
        var verify = new LoopDecision.Propose("verify it", EnterPhase: LoopConfigStore.PhaseVerify);
        Assert.Same(verify, ArchDrivenPolicy.Apply(verify, "verify it", () => false));
        var backToWork = new LoopDecision.Propose("work toward the goal", EnterPhase: LoopConfigStore.PhaseWork);
        Assert.Same(backToWork, ArchDrivenPolicy.Apply(backToWork, "work toward the goal", () => false));
    }

    [Fact]
    public void Repeating_the_last_prompt_waits_for_a_wake()
    {
        var work = new LoopDecision.Propose("work toward the goal");
        var hold = Assert.IsType<LoopDecision.Hold>(ArchDrivenPolicy.Apply(work, "work toward the goal", () => false));
        Assert.False(hold.Escalate);
        Assert.Equal(ArchDrivenPolicy.WaitingForWake, hold.Reason);

        Assert.Same(work, ArchDrivenPolicy.Apply(work, "work toward the goal", () => true));
    }

    [Fact]
    public void Holds_pass_through()
    {
        var hold = new LoopDecision.Hold("idle");
        Assert.Same(hold, ArchDrivenPolicy.Apply(hold, "x", () => true));
    }

    // ---- the standing loop is remembered and restored -------------------------------------

    [Fact]
    public void Standing_loop_memory_round_trips_and_clears()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        Assert.Null(store.StandingLoop);
        store.SetStandingLoop("drive", 0);
        Assert.Equal(("drive", 0), store.StandingLoop);
        var again = new ArchStateStore(new Logger(), _dir);
        Assert.Equal(("drive", 0), again.StandingLoop);
        again.SetStandingLoop("suggest", 4);
        Assert.Equal(("suggest", 4), new ArchStateStore(new Logger(), _dir).StandingLoop);
        again.ClearStandingLoop();
        Assert.Null(again.StandingLoop);
        Assert.Null(new ArchStateStore(new Logger(), _dir).StandingLoop);
    }

    [Fact]
    public void A_driven_kind_can_take_the_reserved_slot_and_the_arch_kind_comes_back_after()
    {
        // The store side of the round trip: goal displaces the arch kind under the same
        // key; StartArch afterwards restores a wake loop with the remembered mode + cap.
        var loops = new LoopConfigStore(new Logger(), _dir);
        loops.StartArch("@arch", "drive", 0, "sess");
        var goal = loops.StartGoal("@arch", "get every repo green", null, "drive", "sess");
        Assert.Equal(LoopConfigStore.KindGoal, goal.Kind);
        Assert.True(goal.Active);
        Assert.Equal("sess", goal.SessionId);
        loops.Resolve("@arch", "done", "verified", "GOAL_VERIFIED");
        var restored = loops.StartArch("@arch", "drive", 0, "sess");
        Assert.Equal(LoopConfigStore.KindArch, restored.Kind);
        Assert.True(restored.Active);
        Assert.Equal(0, restored.MaxIterations);
    }
}
