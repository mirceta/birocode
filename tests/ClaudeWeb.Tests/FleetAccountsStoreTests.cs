using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec fleet-accounts-subtab: the fleet's Claude plan usage re-keyed BY
/// ACCOUNT from the same per-machine overview records the Overview shows. Every account
/// seen in a pass is refreshed from the freshest capture among its machines; an account
/// no machine uses any more keeps its LAST-SEEN record (usage, plan, machines, when);
/// the store persists across instances so that memory survives a restart.</summary>
public sealed class FleetAccountsStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-fleetacc-" + Guid.NewGuid().ToString("N"));
    public FleetAccountsStoreTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private static FleetOverview Ov(string? account, string? plan, double? fiveHour, string? fetchedAt, long capturedAt, bool authenticated = true) =>
        new(new OverviewClaude(true, authenticated, account, plan,
                fiveHour is null ? null : new OverviewUsage(true, false, fetchedAt, new OverviewUsageLimit("5h", fiveHour, null, "normal"), new OverviewUsageLimit("weekly", 10, null, "normal"), new(), null)),
            null, null, null, capturedAt);

    [Fact]
    public void Machines_on_the_same_account_group_together_and_the_freshest_usage_wins()
    {
        var prev = new Dictionary<string, FleetAccountsStore.AccountSeen>();
        var seen = FleetAccountsStore.Merge(prev, new[]
        {
            new FleetAccountsStore.Observed("hub", Ov("Me@X.com", "Max", 24, "2026-09-17T09:00:00Z", 1000)),
            new FleetAccountsStore.Observed("spacex", Ov("me@x.com", "Max", 31, "2026-09-17T09:05:00Z", 900)),
            new FleetAccountsStore.Observed("laptop", Ov("other@y.com", "Pro", 5, "2026-09-17T09:01:00Z", 950)),
            new FleetAccountsStore.Observed("dark", null),                                  // unreachable: contributes nothing
            new FleetAccountsStore.Observed("guest", Ov(null, null, null, null, 800, authenticated: false)),
        }, now: 5000);
        Assert.Equal(2, seen.Count);
        var me = seen["me@x.com"];
        Assert.Equal(new[] { "hub", "spacex" }, me.Machines);
        Assert.Equal(31, me.Usage!.Session!.Percent);                                       // spacex fetched later → its usage
        Assert.Equal("Max", me.Plan);
        Assert.Equal(5000, me.LastSeenAt);
        Assert.Equal(new[] { "laptop" }, seen["other@y.com"].Machines);
    }

    [Fact]
    public void An_account_no_machine_uses_any_more_keeps_its_last_seen_record()
    {
        var first = FleetAccountsStore.Merge(new Dictionary<string, FleetAccountsStore.AccountSeen>(), new[]
        {
            new FleetAccountsStore.Observed("hub", Ov("me@x.com", "Max", 24, "2026-09-17T09:00:00Z", 1000)),
            new FleetAccountsStore.Observed("laptop", Ov("old@z.com", "Pro", 77, "2026-09-17T08:00:00Z", 700)),
        }, now: 1000);
        // Next pass: the laptop switched accounts; old@z.com is used by nobody now.
        var second = FleetAccountsStore.Merge(first, new[]
        {
            new FleetAccountsStore.Observed("hub", Ov("me@x.com", "Max", 30, "2026-09-17T09:10:00Z", 2000)),
            new FleetAccountsStore.Observed("laptop", Ov("me@x.com", "Max", 30, "2026-09-17T09:10:00Z", 2000)),
        }, now: 2000);
        Assert.Equal(2, second.Count);
        var old = second["old@z.com"];
        Assert.Equal(77, old.Usage!.Session!.Percent);   // last known state, untouched
        Assert.Equal(1000, old.LastSeenAt);              // when it was last seen, not now
        Assert.Equal(new[] { "laptop" }, old.Machines);  // where it was last seen
        Assert.Equal(2000, second["me@x.com"].LastSeenAt);
        Assert.Equal(new[] { "hub", "laptop" }, second["me@x.com"].Machines);
    }

    [Fact]
    public void The_store_persists_and_orders_live_accounts_first()
    {
        var a = new FleetAccountsStore(new Logger(), _dir);
        a.Record(new[] { new FleetAccountsStore.Observed("hub", Ov("me@x.com", "Max", 24, "2026-09-17T09:00:00Z", 1000)) }, now: 1000);
        a.Record(new[] { new FleetAccountsStore.Observed("hub", Ov("new@x.com", "Team", 1, "2026-09-17T09:30:00Z", 3000)) }, now: 3000);
        Assert.True(File.Exists(Path.Combine(_dir, "fleet-accounts.json")));
        // A fresh instance (a restart) remembers both, the most recently seen first.
        var b = new FleetAccountsStore(new Logger(), _dir);
        var all = b.All();
        Assert.Equal(new[] { "new@x.com", "me@x.com" }, all.Select(x => x.Account).ToArray());
        Assert.Equal(1000, all[1].LastSeenAt);
        Assert.Equal(24, all[1].Usage!.Session!.Percent);
    }
}
