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

    // ---- openspec fleet-overview-honest: the strip's whole field set rides the describe ----

    private const string HonestDescribe = """
    {
      "protocol": 1, "version": "1.0.0+84cd5a8", "machine": "SPACEX",
      "acceptsSends": true, "gateOpen": true, "repos": [],
      "overview": {
        "capturedAt": 1789000000000,
        "claude": { "installed": true, "authenticated": true, "account": "me@x.com", "plan": "Max",
          "usage": { "available": true, "stale": false, "fetchedAt": "2026-09-07T10:00:00Z",
            "session": { "label": null, "percent": 23.4, "resetsAt": "2026-09-07T14:00:00Z", "severity": "normal" },
            "weekly": { "label": null, "percent": 61.0, "resetsAt": "2026-09-10T00:00:00Z", "severity": "normal" },
            "scopedWeekly": [ { "label": "Opus", "percent": 12.0, "resetsAt": "2026-09-10T00:00:00Z", "severity": "normal" } ],
            "error": null } },
        "github": { "installed": true, "authenticated": true, "account": "octocat", "host": "github.com" },
        "host": { "timeZoneId": "Central Europe Standard Time", "utcOffsetMinutes": 120, "nowUnixMs": 1789000000123, "nowIso": "2026-09-07T12:26:40+02:00" },
        "admin": { "supported": true, "state": "active", "registrySet": true, "elevated": true }
      }
    }
    """;

    [Fact]
    public void Describe_carries_the_plan_usage_host_clock_and_admin_facts_of_a_peer()
    {
        var info = JsonSerializer.Deserialize<FleetClient.PeerInfo>(HonestDescribe, Web)!;
        var o = info.Overview!;
        Assert.Equal(1789000000000, o.CapturedAt);
        var u = o.Claude!.Usage!;
        Assert.True(u.Available);
        Assert.Equal(23.4, u.Session!.Percent);
        Assert.Equal("2026-09-07T14:00:00Z", u.Session.ResetsAt);
        Assert.Equal(61.0, u.Weekly!.Percent);
        Assert.Single(u.ScopedWeekly!);
        Assert.Equal("Opus", u.ScopedWeekly![0].Label);
        Assert.Equal(1789000000123, o.Host!.NowUnixMs);
        Assert.True(o.Admin!.RegistrySet);
        Assert.True(o.Admin.Elevated);
    }

    [Fact]
    public void A_peer_from_before_the_honest_overview_leaves_the_new_fields_null_not_blank()
    {
        // The modern (fleet-status-panels) shape, without usage / clock / admin facts / capturedAt.
        var info = JsonSerializer.Deserialize<FleetClient.PeerInfo>(ModernDescribe, Web)!;
        var o = info.Overview!;
        Assert.Null(o.CapturedAt);
        Assert.Null(o.Claude!.Usage);
        Assert.Null(o.Host!.NowUnixMs);
        Assert.Null(o.Admin!.RegistrySet);
        Assert.Null(o.Admin.Elevated);
        Assert.Equal("Max", o.Claude.Plan); // the older facts still read
    }

    [Fact]
    public void Usage_maps_one_to_one_from_the_strips_probe_including_an_honest_failure()
    {
        var ok = new ClaudeWeb.Services.Accounts.ClaudeUsageService.ClaudeUsageStatus(true, true, "2026-09-07T10:00:00Z",
            new ClaudeWeb.Services.Accounts.ClaudeUsageService.UsageLimit(null, 23.4, "r1", "normal"),
            new ClaudeWeb.Services.Accounts.ClaudeUsageService.UsageLimit(null, 61, "r2", "elevated"),
            new[] { new ClaudeWeb.Services.Accounts.ClaudeUsageService.UsageLimit("Opus", 12, "r3", "normal") }, null);
        var m = FleetOverviewProvider.MapUsage(ok);
        Assert.True(m.Available);
        Assert.True(m.Stale);
        Assert.Equal(23.4, m.Session!.Percent);
        Assert.Equal("elevated", m.Weekly!.Severity);
        Assert.Equal("Opus", m.ScopedWeekly![0].Label);

        var failed = new ClaudeWeb.Services.Accounts.ClaudeUsageService.ClaudeUsageStatus(false, false, null, null, null, Array.Empty<ClaudeWeb.Services.Accounts.ClaudeUsageService.UsageLimit>(), "session expired");
        var f = FleetOverviewProvider.MapUsage(failed);
        Assert.False(f.Available);
        Assert.Equal("session expired", f.Error);
        Assert.Null(f.Session);
    }

    [Fact]
    public void The_poll_payload_never_carries_a_scoreboard_field()
    {
        // The Overview is what rides the periodic fleet poll. Enforce that it holds only
        // identity groups — no analytics/scoreboard/concurrency — so the heavy, uncached
        // analytics fold can never sneak into the poll (openspec fleet-status-panels 3).
        var props = typeof(FleetOverview).GetProperties().Select(p => p.Name).OrderBy(n => n).ToArray();
        Assert.Equal(new[] { "Admin", "CapturedAt", "Claude", "GitHub", "Host" }, props);
        Assert.DoesNotContain(props, n => n.Contains("Score", StringComparison.OrdinalIgnoreCase) || n.Contains("Analytic", StringComparison.OrdinalIgnoreCase));
    }
}
