using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec chrome-per-agent-mode: the browser gate serialises BROWSER turns only. A turn
/// that does not ask for the browser is never a browser turn — whatever another agent
/// holds — so it never reaches the gate; a second browser turn is refused naming the
/// holder; the holder is reported with its repo id so a UI can tell "held by me" from
/// "held by another agent".
/// </summary>
public sealed class ChromeGateTests
{
    [Fact]
    public void A_turn_is_a_browser_turn_only_when_it_asks_on_the_builder_lane_on_claude()
    {
        Assert.True(ChromeGateService.IsBrowserTurn(true, "builder", AgentProviders.Claude));
        // No request → never a browser turn, whatever else is going on.
        Assert.False(ChromeGateService.IsBrowserTurn(null, "builder", AgentProviders.Claude));
        Assert.False(ChromeGateService.IsBrowserTurn(false, "builder", AgentProviders.Claude));
        // The read-only ask lane and a non-Claude engine never get the browser.
        Assert.False(ChromeGateService.IsBrowserTurn(true, "ask", AgentProviders.Claude));
        Assert.False(ChromeGateService.IsBrowserTurn(true, "builder", AgentProviders.Codex));
        Assert.False(ChromeGateService.IsBrowserTurn(true, null, AgentProviders.Claude));
    }

    [Fact]
    public void While_one_agent_holds_the_browser_another_browser_turn_is_refused_naming_it_and_a_plain_turn_never_asks()
    {
        var gate = new ChromeGateService(new Logger());
        Assert.True(gate.TryAcquire("agent-a", "repo-a", out var holder));
        Assert.Null(holder);

        // B with 🌐 on: refused, A named.
        Assert.False(gate.TryAcquire("agent-b", "repo-b", out holder));
        Assert.Equal("agent-a", holder);

        // B with 🌐 off: not a browser turn, so the controller never consults the gate —
        // the decision is made before any acquire (see ChatController).
        Assert.False(ChromeGateService.IsBrowserTurn(null, "builder", AgentProviders.Claude));

        // The holder is reported with its id so A's own UI does not read "held by A".
        var (busy, repo, repoId) = gate.HolderState();
        Assert.True(busy);
        Assert.Equal("agent-a", repo);
        Assert.Equal("repo-a", repoId);
        Assert.Equal((true, "agent-a"), gate.BusyState());
    }

    [Fact]
    public void Release_frees_the_browser_for_the_next_agent_and_is_safe_when_nothing_is_held()
    {
        var gate = new ChromeGateService(new Logger());
        gate.Release(); // nothing held — no throw
        Assert.True(gate.TryAcquire("agent-a", "repo-a", out _));
        gate.Release();
        Assert.Equal((false, null, null), gate.HolderState());
        Assert.True(gate.TryAcquire("agent-b", "repo-b", out var holder));
        Assert.Null(holder);
        // The legacy overload still works and records no id.
        gate.Release();
        Assert.True(gate.TryAcquire("agent-c", out _));
        Assert.Equal((true, "agent-c", null), gate.HolderState());
    }
}
