using ClaudeWeb.Services.Arch;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec arch-peer-upgrades, task 3.1: the pure parts of a peer upgrade —
/// the hub-side posture check, the commit-suffix comparison and the config-key carry.</summary>
public class PeerUpgradeTests
{
    // ---- posture (hub side) -------------------------------------------------------

    [Theory]
    [InlineData("ok", true, "1.0.0+aaaaaaa", "1.0.0+bbbbbbb", null)]                 // go
    [InlineData("ok", true, null, "1.0.0+bbbbbbb", null)]                            // unknown peer version → let the peer decide
    [InlineData("ok", true, "1.0.0+bbbbbbb", "1.0.0+bbbbbbb", "current")]             // same build
    [InlineData("ok", false, "1.0.0+aaaaaaa", "1.0.0+bbbbbbb", "not-accepting")]      // opt-in off
    [InlineData("unreachable", true, "1.0.0+aaaaaaa", "1.0.0+bbbbbbb", "unreachable")]
    [InlineData("no-peer-api", true, null, "1.0.0+bbbbbbb", "no-peer-api")]
    [InlineData("unauthorized", true, null, "1.0.0+bbbbbbb", "unauthorized")]
    public void UpgradePosture_refuses_in_order(string status, bool accepts, string? peerVersion, string hub, string? expected)
    {
        var p = ArchAgentService.UpgradePosture(status, accepts, peerVersion, hub);
        Assert.Equal(expected, p?.Status);
    }

    // ---- commit comparison (peer side) ------------------------------------------------

    [Theory]
    [InlineData("1.0.0+abc1234", "abc1234")]
    [InlineData("1.0.0+abc1234def5678", "abc1234def5678")]
    [InlineData("1.0.0", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void CommitOf_reads_the_suffix(string? version, string? expected) =>
        Assert.Equal(expected, PeerUpgradeService.CommitOf(version));

    [Theory]
    [InlineData("abc1234", "abc1234def5678abc1234def5678abc1234def56", true)] // short vs full
    [InlineData("ABC1234", "abc1234def", true)]
    [InlineData("abc1234", "abc1235def", false)]
    [InlineData("abc", "abc1234", false)]                                     // too short to trust
    [InlineData(null, "abc1234", false)]
    public void SameCommit_compares_the_common_prefix(string? a, string b, bool expected) =>
        Assert.Equal(expected, PeerUpgradeService.SameCommit(a, b));

    // ---- config-key carry (proposal item 5) -------------------------------------------

    [Fact]
    public void MergeMissingKeys_adds_only_absent_top_level_keys()
    {
        const string template = """{ "Port": 5099, "LanBypassCidrs": [], "NewFlag": { "a": 1 } }""";
        const string live = """{ "Port": 5099, "LanBypassCidrs": ["192.168.0.0/24"], "AuthPassword": "x" }""";
        var (merged, added) = PeerUpgradeService.MergeMissingKeys(template, live);
        Assert.Equal(new[] { "NewFlag" }, added);
        using var doc = System.Text.Json.JsonDocument.Parse(merged);
        var root = doc.RootElement;
        Assert.Equal("192.168.0.0/24", root.GetProperty("LanBypassCidrs")[0].GetString()); // live value kept
        Assert.Equal("x", root.GetProperty("AuthPassword").GetString());                    // live-only key kept
        Assert.Equal(1, root.GetProperty("NewFlag").GetProperty("a").GetInt32());            // template value carried
    }

    [Fact]
    public void MergeMissingKeys_is_a_no_op_when_nothing_is_missing()
    {
        var (_, added) = PeerUpgradeService.MergeMissingKeys("""{ "Port": 1 }""", """{ "Port": 2 }""");
        Assert.Empty(added);
    }

    // ---- reconcile (peer side; openspec deploy-final-no-deadman) ----------------------

    [Fact]
    public void A_healthy_restart_on_the_target_build_is_done_at_once_with_nothing_to_keep()
    {
        var o = PeerUpgradeService.Outcome(runningIsTarget: true, "abc1234def5678", rolledBackSince: false, aborted: false, age: TimeSpan.Zero);
        Assert.Equal(PeerUpgradeService.StateDone, o!.Value.State);
        Assert.Contains("final", o.Value.Detail);
        Assert.Contains("nothing to keep", o.Value.Detail);
        Assert.DoesNotContain("disarm", o.Value.Detail);
        // No grace period: the target build answering IS the proof; the age does not matter.
        Assert.Equal(PeerUpgradeService.StateDone, PeerUpgradeService.Outcome(true, "abc1234", false, false, TimeSpan.FromHours(3))!.Value.State);
    }

    [Fact]
    public void A_restore_to_last_good_or_an_abort_or_the_window_end_each_other_build_reads_the_right_state()
    {
        Assert.Null(PeerUpgradeService.Outcome(false, "abc1234", false, false, TimeSpan.FromSeconds(30)));           // still deploying
        Assert.Null(PeerUpgradeService.Outcome(false, "abc1234", true, false, TimeSpan.FromSeconds(30)));            // a rollback line too early to trust
        var rb = PeerUpgradeService.Outcome(false, "abc1234", true, false, TimeSpan.FromMinutes(2));
        Assert.Equal(PeerUpgradeService.StateRolledBack, rb!.Value.State);
        Assert.Contains("on purpose", rb.Value.Detail);                                                                // manual rollback is a first-class cause now
        Assert.Equal(PeerUpgradeService.StateFailed, PeerUpgradeService.Outcome(false, "abc1234", false, true, TimeSpan.FromMinutes(2))!.Value.State);
        Assert.Equal(PeerUpgradeService.StateRolledBack, PeerUpgradeService.Outcome(false, "abc1234", false, false, TimeSpan.FromMinutes(30))!.Value.State);
    }
}
