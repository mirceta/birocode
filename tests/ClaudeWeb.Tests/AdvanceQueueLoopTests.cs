using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for openspec advance-queue-loop: the driven-loop ladder's operator-stop
/// attribution (D1) and whole-word deny matching (D2) via a minimal DrivenLoop,
/// plus the LoopConfigStore's per-arm deny-list storage (D2) and one-step Resume
/// with phase reset (D3/D4) against a throwaway temp dir (the ctor's test-only
/// dir override).
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
    // safety ladder (stop attribution, NEEDS_HUMAN, deny-list).
    private sealed class LadderOnlyLoop : DrivenLoop
    {
        public override string Kind => "test";
        protected override LoopDecision DecideCore(LoopContext ctx) => new LoopDecision.Hold("held");
    }

    private LoopContext Ctx(string? reply, string[]? deny = null,
        bool errored = false, bool stopped = false) =>
        new(_store.Get(Repo) ?? _store.StartQueue(Repo, Tab, null, null),
            reply, errored, stopped,
            deny ?? Array.Empty<string>(), 0.9, Array.Empty<PromptClassifier.Routine>());

    // --- D1: operator stop is never an agent error --------------------------

    [Fact]
    public void Operator_stop_resolves_stopped_by_operator()
    {
        var d = new LadderOnlyLoop().Decide(Ctx("partial reply", stopped: true));
        var stop = Assert.IsType<LoopDecision.Stop>(d);
        Assert.Equal("stopped", stop.Status);
        Assert.Equal("by-operator", stop.Reason);
    }

    [Fact]
    public void Operator_stop_wins_over_run_error()
    {
        var d = new LadderOnlyLoop().Decide(Ctx(null, errored: true, stopped: true));
        var stop = Assert.IsType<LoopDecision.Stop>(d);
        Assert.Equal("stopped", stop.Status);
    }

    [Fact]
    public void Genuine_run_error_still_reports_error()
    {
        var d = new LadderOnlyLoop().Decide(Ctx(null, errored: true));
        var stop = Assert.IsType<LoopDecision.Stop>(d);
        Assert.Equal("error", stop.Status);
        Assert.Equal("error", stop.Reason);
    }

    // --- D2: whole-word deny matching ---------------------------------------

    [Theory]
    [InlineData("I committed and pushed the change.", "push")] // past tense — no whole word
    [InlineData("Our product is ready.", "prod")]              // embedded substring
    [InlineData("They were merged upstream weeks ago.", "merge")]
    public void Deny_term_inside_larger_word_does_not_escalate(string reply, string term)
    {
        var d = new LadderOnlyLoop().Decide(Ctx(reply, new[] { term }));
        Assert.IsType<LoopDecision.Hold>(d);
    }

    [Theory]
    [InlineData("Next I will commit and push to main.", "push")]
    [InlineData("Running git reset --hard origin/main now.", "reset --hard")]
    [InlineData("Time to DEPLOY this.", "deploy")] // case-insensitive
    public void Whole_word_deny_term_escalates_naming_it(string reply, string term)
    {
        var d = new LadderOnlyLoop().Decide(Ctx(reply, new[] { term }));
        var stop = Assert.IsType<LoopDecision.Stop>(d);
        Assert.Equal("escalate", stop.Status);
        Assert.Equal("deny-list", stop.Reason);
        Assert.Contains(term, stop.Detail);
    }

    // --- D2: per-arm deny-list storage ---------------------------------------

    [Fact]
    public void Queue_arm_without_deny_list_stays_null_for_global_default()
    {
        var s = _store.StartQueue(Repo, Tab, null, null);
        Assert.Null(s.DenyList);
    }

    [Fact]
    public void Queue_arm_stores_trimmed_deny_list_and_keeps_explicit_empty()
    {
        var s = _store.StartQueue(Repo, Tab, null, null,
            denyList: new List<string> { " merge ", "deploy", "merge" });
        Assert.NotNull(s.DenyList);
        Assert.Equal(new[] { "merge", "deploy" }, s.DenyList);

        var empty = _store.StartQueue(Repo, Tab, null, null, denyList: new List<string>());
        Assert.NotNull(empty.DenyList);
        Assert.Empty(empty.DenyList!);
    }

    // --- D3/D4: resume -------------------------------------------------------

    [Fact]
    public void Resume_reactivates_same_instance_with_fresh_budget_and_reset_phase()
    {
        _store.StartQueue(Repo, Tab, null, 10, denyList: new List<string> { "deploy" });
        _store.RecordQueueStep(Repo, "step one");           // phase -> verify-owed, sent history grows
        _store.RecordSend(Repo, 1234);                      // iteration counted
        _store.Resolve(Repo, "escalate", "deny-list", "reply mentions deny-listed \"push\"");

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
        // Survivors: the sent-history, the binding, and the per-arm deny-list.
        Assert.Equal(1, resumed.QueueSent);
        Assert.Equal(new[] { "step one" }, resumed.QueueSentTexts);
        Assert.Equal(Tab, resumed.QueueTabId);
        Assert.Equal(new[] { "deploy" }, resumed.DenyList);
    }

    [Fact]
    public void Resume_refuses_active_or_non_queue_instances()
    {
        _store.StartQueue(Repo, Tab, null, null);
        Assert.Null(_store.Resume(Repo)); // still active

        _store.Start("repo-2", "keep going", null, null); // recipe kind
        _store.Resolve("repo-2", "escalate", "deny-list", "x");
        Assert.Null(_store.Resume("repo-2"));
    }
}
