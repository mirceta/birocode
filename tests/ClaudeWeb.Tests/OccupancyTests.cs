using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec manual-agent-occupancy: the Operator's occupancy overrides the branch
/// rule for availability (occupied → claimed, free → available), never busy / unmanaged /
/// unreachable; the store persists per agent and clears back to automatic.</summary>
public sealed class OccupancyTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-occupancy-" + Guid.NewGuid().ToString("N"));
    public OccupancyTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private static ArchClaims.Verdict V(string availability, string? reason = null) => new(availability, reason);

    [Fact]
    public void No_override_leaves_the_branch_rule_alone()
    {
        var v = V(ArchAgentService.Claimed, ArchClaims.ReasonHumanActive);
        Assert.Same(v, ArchClaims.ApplyOccupancy(v, null));
    }

    [Fact]
    public void Occupied_makes_an_available_agent_claimed_with_the_operator_reason()
    {
        var v = ArchClaims.ApplyOccupancy(V(ArchAgentService.Available), true);
        Assert.Equal(ArchAgentService.Claimed, v.Availability);
        Assert.Equal(ArchClaims.ReasonOperatorOccupied, v.ClaimedReason);
        Assert.False(v.OnUnassignedBranch);
    }

    [Fact]
    public void Free_makes_a_claimed_agent_available_but_an_unassigned_branch_still_has_to_be_named()
    {
        var human = ArchClaims.ApplyOccupancy(V(ArchAgentService.Claimed, ArchClaims.ReasonHumanActive), false);
        Assert.Equal(ArchAgentService.Available, human.Availability);
        Assert.Equal(ArchClaims.ReasonUnassignedBranch, human.ClaimedReason);   // the arch must still name the branch in a send
        Assert.True(human.OnUnassignedBranch);

        var pinned = ArchClaims.ApplyOccupancy(V(ArchAgentService.Claimed, ArchClaims.ReasonPinned), false);
        Assert.Equal((ArchAgentService.Available, (string?)null), (pinned.Availability, pinned.ClaimedReason));

        var onMain = ArchClaims.ApplyOccupancy(V(ArchAgentService.Available), false);
        Assert.Equal((ArchAgentService.Available, (string?)null), (onMain.Availability, onMain.ClaimedReason));
    }

    [Theory]
    [InlineData(ArchAgentService.Busy)]
    [InlineData(ArchAgentService.Unmanaged)]
    [InlineData(ArchAgentService.Unreachable)]
    public void Busy_unmanaged_and_unreachable_are_never_overridden(string availability)
    {
        Assert.Equal(availability, ArchClaims.ApplyOccupancy(V(availability), true).Availability);
        Assert.Equal(availability, ArchClaims.ApplyOccupancy(V(availability), false).Availability);
    }

    [Fact]
    public void The_store_keys_like_the_board_persists_and_clears()
    {
        var a = new OccupancyStore(new Logger(), _dir);
        Assert.Null(a.Get(null, "r1"));
        var set = a.Set(null, "r1", true, note: "prg is on a feature branch", now: 1000);
        Assert.Equal((true, 1000L, "operator", "prg is on a feature branch"), (set!.Occupied, set.SetAt, set.SetBy, set.Note));
        Assert.Equal("|r1", OccupancyStore.Key("self", "r1"));                    // "self" and null both mean this machine
        Assert.Same(a.Get("self", "r1"), a.Get("", "r1"));
        a.Set("src-a", "r2", false, now: 2000);

        var b = new OccupancyStore(new Logger(), _dir);                            // a restart
        Assert.True(b.Get(null, "r1")!.Occupied);
        Assert.False(b.Get("src-a", "r2")!.Occupied);
        Assert.Equal(2, b.All().Count);

        Assert.Null(b.Set(null, "r1", null));                                     // back to automatic
        Assert.Null(new OccupancyStore(new Logger(), _dir).Get(null, "r1"));
    }
}
