using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for openspec advance-queue-loop: the driven-loop ladder's operator-stop
/// attribution (D1) via a minimal DrivenLoop, plus the LoopConfigStore's one-step
/// Resume with phase reset (D3/D4) against a throwaway temp dir (the ctor's
/// test-only dir override). The word-level deny fence that used to sit on this
/// ladder was removed (openspec remove-deny-fence, 2026-09-03): a reply is judged
/// only by the operator stop, the run outcome, NEEDS_HUMAN and the kind's own rules.
/// </summary>
public sealed class AdvanceQueueLoopTests : IDisposable
{
    private const string Repo = "repo-1";
    private const string Tab = "tab-1";
    private readonly string _dir;
    private readonly LoopConfigStore _store;

    public AdvanceQueueLoopTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "cwtest-loops-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _store = new LoopConfigStore(new Logger(), _dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    // A DrivenLoop with inert semantics, so Decide exercises ONLY the shared
    // safety ladder (stop attribution, NEEDS_HUMAN).
    private sealed class LadderOnlyLoop : DrivenLoop
    {
        public override string Kind => "test";
        protected override LoopDecision DecideCore(LoopContext ctx) => new LoopDecision.Hold("held");
    }

    private LoopContext Ctx(string? reply, bool errored = false, bool stopped = false) =>
        new(_store.Get(Repo) ?? _store.StartQueue(Repo, Tab, null, null),
            reply, errored, stopped,
            0.9, Array.Empty<PromptClassifier.Routine>());

    // --- D1: operator stop is never an agent error --------------------------

    [Fact]
    public void Operator_stop_resolves_stopped_by_operator()
    {
        var d = new LadderOnlyLoop().Decide(Ctx("half done", errored: false, stopped: true));
        var stop = Assert.IsType<LoopDecision.Stop>(d);
        Assert.Equal("stopped", stop.Status);
        Assert.Equal("by-operator", stop.Reason);
    }

    [Fact]
    public void Operator_stop_wins_over_errored_flag()
    {
        var d = new LadderOnlyLoop().Decide(Ctx(null, errored: true, stopped: true));
        var stop = Assert.IsType<LoopDecision.Stop>(d);
        Assert.Equal("stopped", stop.Status);
    }

    [Fact]
    public void Genuine_error_still_reports_error()
    {
        var d = new LadderOnlyLoop().Decide(Ctx(null, errored: true, stopped: false));
        var stop = Assert.IsType<LoopDecision.Stop>(d);
        Assert.Equal("error", stop.Status);
        Assert.Equal("error", stop.Reason);
    }

    // --- remove-deny-fence: risky words in a reply are NOT a stop ------------

    [Theory]
    [InlineData("Next I will commit and push to main.")]
    [InlineData("Running git reset --hard origin/main now.")]
    [InlineData("Time to DEPLOY this, then merge and delete the branch.")]
    public void Risky_words_in_a_reply_no_longer_escalate(string reply)
    {
        var d = new LadderOnlyLoop().Decide(Ctx(reply));
        Assert.IsType<LoopDecision.Hold>(d);
    }

    [Fact]
    public void Needs_human_still_escalates()
    {
        var d = new LadderOnlyLoop().Decide(Ctx("Blocked. NEEDS_HUMAN: which branch do you want?"));
        var stop = Assert.IsType<LoopDecision.Stop>(d);
        Assert.Equal("escalate", stop.Status);
        Assert.Equal("needs-human", stop.Reason);
        Assert.Contains("which branch", stop.Detail);
    }

    // --- D3/D4: resume -------------------------------------------------------

    [Fact]
    public void Resume_reactivates_same_instance_with_fresh_budget_and_reset_phase()
    {
        _store.StartQueue(Repo, Tab, null, 10);
        _store.RecordQueueStep(Repo, "step one");           // phase -> verify-owed, sent history grows
        _store.RecordSend(Repo, 1234);                      // iteration counted
        _store.Resolve(Repo, "escalate", "needs-human", "which branch?");

        var before = _store.Get(Repo)!;
        Assert.False(before.Active);
        Assert.Equal(LoopConfigStore.PhaseVerifyOwed, before.Phase);

        var resumed = _store.Resume(Repo)!;
        Assert.True(resumed.Active);
        Assert.Equal("looping", resumed.Status);
        Assert.Equal(0, resumed.IterationsDone);
        Assert.Equal(LoopConfigStore.PhaseWork, resumed.Phase);
        Assert.Null(resumed.LastStepText);
        Assert.Null(resumed.StopReason);
        Assert.True(resumed.ArmedAt >= before.ArmedAt);
        // Survivors: the sent-history and the binding.
        Assert.Equal(1, resumed.QueueSent);
        Assert.Equal(new[] { "step one" }, resumed.QueueSentTexts);
        Assert.Equal(Tab, resumed.QueueTabId);
    }

    [Fact]
    public void Resume_refuses_active_or_non_queue_instances()
    {
        _store.StartQueue(Repo, Tab, null, null);
        Assert.Null(_store.Resume(Repo)); // still active

        _store.Start("repo-2", "keep going", null, null); // recipe kind
        _store.Resolve("repo-2", "escalate", "needs-human", "x");
        Assert.Null(_store.Resume("repo-2"));
    }
}
