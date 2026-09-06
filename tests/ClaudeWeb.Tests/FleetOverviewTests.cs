using System.Text.Json;
using ClaudeWeb.Services.Arch;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec fleet-status-panels: the fleet describe carries the per-machine Overview
/// (Claude / GitHub / host / admin), and a peer on an older build that sends no
/// <c>overview</c> degrades to null → the UI shows "n/a", never an error. Also guards
/// that the poll payload (FleetOverview) never grows a scoreboard/analytics field — the
/// scoreboard is on-demand, so it must not ride the periodic fleet poll.
/// </summary>
public class FleetOverviewTests
{
    // Same options FleetClient uses to read a peer's describe.
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private const string ModernDescribe = """
    {
      "protocol": 1, "version": "1.0.0+a288bb4", "machine": "RAZVOJ2016",
      "acceptsSends": true, "gateOpen": true, "repos": [],
      "overview": {
        "claude": { "installed": true, "authenticated": true, "account": "me@x.com", "plan": "Max" },
        "github": { "installed": true, "authenticated": true, "account": "octocat", "host": "github.com" },
        "host": { "timeZoneId": "Central European Standard Time", "utcOffsetMinutes": 120 },
        "admin": { "supported": true, "state": "active" }
      }
    }
    """;

    // A build that predates this change: a valid describe with NO overview key.
    private const string OldDescribe = """
    { "protocol": 1, "version": "1.0.0+deadbee", "machine": "OLDBOX",
      "acceptsSends": false, "gateOpen": false, "repos": [] }
    """;

    [Fact]
    public void Describe_carries_the_overview_for_a_modern_peer()
    {
        var info = JsonSerializer.Deserialize<FleetClient.PeerInfo>(ModernDescribe, Web);
        Assert.NotNull(info);
        Assert.NotNull(info!.Overview);
        Assert.Equal("me@x.com", info.Overview!.Claude!.Account);
        Assert.Equal("Max", info.Overview.Claude.Plan);
        Assert.Equal("octocat", info.Overview.GitHub!.Account);
        Assert.Equal("github.com", info.Overview.GitHub.Host);
        Assert.Equal(120, info.Overview.Host!.UtcOffsetMinutes);
        Assert.Equal("active", info.Overview.Admin!.State);
        Assert.True(info.Overview.Admin.Supported);
    }

    [Fact]
    public void Describe_from_an_old_peer_degrades_overview_to_null()
    {
        var info = JsonSerializer.Deserialize<FleetClient.PeerInfo>(OldDescribe, Web);
        Assert.NotNull(info);
        Assert.Null(info!.Overview); // the hub then surfaces "n/a" per field, never an error
        // The pre-existing fields still parse, so an old peer is otherwise unaffected.
        Assert.Equal(1, info.Protocol);
        Assert.Equal("OLDBOX", info.Machine);
    }

    [Fact]
    public void A_partial_overview_leaves_missing_sub_objects_null()
    {
        const string partial = """
        { "protocol": 1, "version": "v", "machine": "M", "acceptsSends": true, "gateOpen": true, "repos": [],
          "overview": { "claude": { "installed": true, "authenticated": false, "account": null, "plan": null } } }
        """;
        var info = JsonSerializer.Deserialize<FleetClient.PeerInfo>(partial, Web)!;
        Assert.NotNull(info.Overview);
        Assert.False(info.Overview!.Claude!.Authenticated);
        Assert.Null(info.Overview.GitHub);
        Assert.Null(info.Overview.Host);
        Assert.Null(info.Overview.Admin);
    }

    [Fact]
    public void The_poll_payload_never_carries_a_scoreboard_field()
    {
        // The Overview is what rides the periodic fleet poll. Enforce that it holds only
        // identity groups — no analytics/scoreboard/concurrency — so the heavy, uncached
        // analytics fold can never sneak into the poll (openspec fleet-status-panels 3).
        var props = typeof(FleetOverview).GetProperties().Select(p => p.Name).OrderBy(n => n).ToArray();
        Assert.Equal(new[] { "Admin", "Claude", "GitHub", "Host" }, props);
    }
}
