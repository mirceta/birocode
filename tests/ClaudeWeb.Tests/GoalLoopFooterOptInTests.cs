using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for openspec expose-goal-loop-denylist (minus the deny-list, removed by
/// openspec remove-deny-fence): goal and recipe arms persist the footer-clauses opt-in
/// exactly like queue arms, and the
/// briefed-send composition appends active footer clauses to work sends only —
/// never to verification sends, never when the list is empty.
/// </summary>
public sealed class GoalLoopFooterOptInTests : IDisposable
{
    private const string Repo = "repo-1";
    private readonly string _dir;
    private readonly LoopConfigStore _store;

    public GoalLoopFooterOptInTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "cwtest-goal-footer-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _store = new LoopConfigStore(new Logger(), _dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    [Fact]
    public void GoalArm_PersistsFooterOptIn()
    {
        var s = _store.StartGoal(Repo, "ship it", null, includeFooterClauses: true);
        Assert.True(s.IncludeFooterClauses);
        // Survives a reload from disk (a restart must re-arm identically).
        var reloaded = new LoopConfigStore(new Logger(), _dir).Get(Repo)!;
        Assert.True(reloaded.IncludeFooterClauses);
    }

    [Fact]
    public void RecipeArm_PersistsFooterOptIn()
    {
        var s = _store.Start(Repo, "do the ritual", null, null, includeFooterClauses: true);
        Assert.True(s.IncludeFooterClauses);
    }

    [Fact]
    public void UntouchedArm_KeepsFooterOff()
    {
        var s = _store.StartGoal(Repo, "ship it", null);
        Assert.False(s.IncludeFooterClauses);
    }

    [Fact]
    public void WorkSend_AppendsActiveClausesAfterStoredText()
    {
        var clauses = new[] { "run watchers detached", "never push without asking" };
        var composed = LoopConfigStore.ComposeBriefedPrompt(
            "goal", null, "LOOP_DONE", "the stored prompt",
            Array.Empty<string>(), footerClauses: clauses);
        var footerAt = composed.IndexOf(LoopConfigStore.FooterClausesDelimiter, StringComparison.Ordinal);
        var storedAt = composed.IndexOf("the stored prompt", StringComparison.Ordinal);
        Assert.True(footerAt > storedAt, "footer must come AFTER the stored prompt");
        Assert.Contains("run watchers detached", composed);
        Assert.Contains("never push without asking", composed);
    }

    [Fact]
    public void VerifySend_NeverCarriesClauses()
    {
        var composed = LoopConfigStore.ComposeBriefedPrompt(
            "goal", LoopConfigStore.PhaseVerify, "LOOP_DONE", "verify this",
            Array.Empty<string>(), footerClauses: new[] { "run watchers detached" });
        Assert.DoesNotContain(LoopConfigStore.FooterClausesDelimiter, composed);
        Assert.DoesNotContain("run watchers detached", composed);
    }

    [Fact]
    public void EmptyOrNullClauses_LeaveTheSendUnchanged()
    {
        var plain = LoopConfigStore.ComposeBriefedPrompt(
            "goal", null, "LOOP_DONE", "the stored prompt", Array.Empty<string>());
        var withNull = LoopConfigStore.ComposeBriefedPrompt(
            "goal", null, "LOOP_DONE", "the stored prompt", Array.Empty<string>(),
            footerClauses: null);
        var withEmpty = LoopConfigStore.ComposeBriefedPrompt(
            "goal", null, "LOOP_DONE", "the stored prompt", Array.Empty<string>(),
            footerClauses: Array.Empty<string>());
        Assert.Equal(plain, withNull);
        Assert.Equal(plain, withEmpty);
    }
}
