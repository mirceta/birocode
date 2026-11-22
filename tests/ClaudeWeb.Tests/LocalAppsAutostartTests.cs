using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.LocalApps;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// fleet task f88f97fe (openspec local-apps-autostart-sentry): the autostart + sentry state machine on one machine
/// and the hub's fleet store. Only flagged apps are ever started or probed; boot / apply start the flagged apps that
/// are down, in order, with their delays; the sentry makes ONE restart attempt (stopping a hung listener first),
/// then marks the app failing and never loops; a just-launched app gets a grace period; the hub's store versions
/// each machine's slice.
/// </summary>
public sealed class LocalAppsAutostartTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-autostart-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private sealed class FakeOps : ILocalAppOps
    {
        public readonly HashSet<int> Listening = new();
        public readonly List<(string Cmd, string Folder)> Launches = new();
        public readonly List<int> Stops = new();
        /// <summary>What a launch does to the port (true = the app comes up).</summary>
        public Func<string, bool> Comes = _ => true;
        public Dictionary<string, int> PortOfCommand = new();
        public bool IsListening(int port) => Listening.Contains(port);
        public (int? Pid, string? Error) Launch(string startCommand, string folder)
        {
            Launches.Add((startCommand, folder));
            if (Comes(startCommand) && PortOfCommand.TryGetValue(startCommand, out var p)) Listening.Add(p);
            return (1000 + Launches.Count, null);
        }
        public (int? Pid, string? Error) Stop(int port) { Stops.Add(port); Listening.Remove(port); return (42, null); }
        public bool WaitForPortFree(int port, TimeSpan timeout) => !Listening.Contains(port);
    }

    private long _now = 1_000_000;
    private readonly List<string> _log = new();
    private readonly List<TimeSpan> _delays = new();

    private (LocalAppSentry Sentry, FakeOps Ops, AutostartStore Store) Make(Dictionary<string, string?>? health = null)
    {
        var repoDir = Path.Combine(_dir, "repo");
        Directory.CreateDirectory(Path.Combine(repoDir, "web"));
        var repo = new RepoFacts("r1", "demo", repoDir, "demo");
        var apps = new List<RepositoryRegistry.LocalAppInfo>
        {
            new("api", "api", 47001, "repo"),
            new("web", "web", 47002, "repo"),
            new("docs", "docs", 47003, "repo"),
            new("understanding", "Understanding", 0, "harness"),
        };
        var ops = new FakeOps { PortOfCommand = { ["node api.mjs"] = 47001, ["node web.mjs"] = 47002, ["node docs.mjs"] = 47003 } };
        var store = new AutostartStore(_logger, Path.Combine(_dir, "data"));
        var env = new LocalAppSentry.Env
        {
            Repos = () => new[] { new LocalAppSentry.RepoEntry(repo, apps) },
            Discovery = _ => null,
            Ops = ops,
            ProbeHttp = (url, expect, ct) => Task.FromResult(health is not null && health.TryGetValue(url, out var e) ? e : null),
            Now = () => _now,
            Delay = (d, ct) => { _delays.Add(d); return Task.CompletedTask; },
            Log = _log.Add,
            Machine = "hub",
        };
        return (new LocalAppSentry(env, store), ops, store);
    }

    private static MachineSlice Slice(long version, params AutostartFlag[] flags) => new(flags.ToList(), new SentrySettings(5, 15), version, "hub");

    [Fact]
    public void Every_registered_app_is_listed_and_only_flagged_ones_carry_a_sentry_state()
    {
        var (sentry, ops, store) = Make();
        store.Replace(Slice(1, new AutostartFlag("r1", "api", true, StartCommand: "node api.mjs")));
        ops.Listening.Add(47002);
        var o = sentry.Snapshot();
        Assert.Equal(new[] { "api", "web", "docs", "understanding" }, o.Rows.Select(r => r.AppId));
        Assert.Equal("unknown", o.Rows[0].State);       // flagged, never checked
        Assert.Equal("running", o.Rows[1].State);       // not flagged: the live port only
        Assert.Equal("stopped", o.Rows[2].State);
        Assert.Equal("always-on", o.Rows[3].State);     // harness-served
        Assert.Equal("entry", o.Rows[0].StartSource);
        Assert.Null(o.Rows[1].StartCommand);            // no discovery, no entry command
        Assert.Equal(1, o.Flagged);
    }

    [Fact]
    public async Task Apply_starts_the_flagged_apps_that_are_down_in_order_with_their_delays_and_never_touches_the_rest()
    {
        var (sentry, ops, store) = Make();
        store.Replace(Slice(1,
            new AutostartFlag("r1", "web", true, Order: 2, StartCommand: "node web.mjs", Folder: "web"),
            new AutostartFlag("r1", "api", true, Order: 1, DelaySec: 7, StartCommand: "node api.mjs"),
            new AutostartFlag("r1", "docs", false, StartCommand: "node docs.mjs")));
        var o = await sentry.ApplyAsync("boot");
        Assert.Equal(new[] { "node api.mjs", "node web.mjs" }, ops.Launches.Select(l => l.Cmd));   // order 1 then 2; docs not flagged
        Assert.EndsWith("web", ops.Launches[1].Folder);
        Assert.Equal(new[] { TimeSpan.FromSeconds(7) }, _delays);
        Assert.StartsWith("launched pid", o.Rows.First(r => r.AppId == "api").LastStartResult);
        // Already up: a second apply launches nothing.
        await sentry.ApplyAsync("apply-now");
        Assert.Equal(2, ops.Launches.Count);
        Assert.Equal("up", sentry.Snapshot().Rows.First(r => r.AppId == "api").State);
    }

    [Fact]
    public async Task An_app_without_a_start_command_is_reported_not_launched()
    {
        var (sentry, ops, store) = Make();
        store.Replace(Slice(1, new AutostartFlag("r1", "docs", true)));
        var o = await sentry.ApplyAsync("boot");
        Assert.Empty(ops.Launches);
        Assert.StartsWith("no-command", o.Rows.First(r => r.AppId == "docs").LastStartResult);
    }

    [Fact]
    public async Task The_sentry_restarts_a_dead_app_once_then_marks_it_failing_and_stops_trying()
    {
        var (sentry, ops, store) = Make();
        store.Replace(Slice(1, new AutostartFlag("r1", "api", true, StartCommand: "node api.mjs")));
        ops.Listening.Add(47001);
        Assert.Equal("up", (await sentry.CheckAsync("sentry")).Rows[0].State);

        ops.Listening.Remove(47001);         // killed
        ops.Comes = _ => false;              // and it will not come back
        _now += 300_000;
        var o = await sentry.CheckAsync("sentry");
        Assert.Single(ops.Launches);         // the one restart attempt
        Assert.Equal("starting", o.Rows[0].State);   // just relaunched: starting until it answers or the grace runs out

        _now += StartGrace();                // past the grace period: judged
        o = await sentry.CheckAsync("sentry");
        Assert.Equal("failing", o.Rows[0].State);
        for (var i = 0; i < 5; i++) { _now += 300_000; await sentry.CheckAsync("sentry"); }
        Assert.Single(ops.Launches);         // never a loop
        Assert.Contains(_log, l => l.Contains("FAILING"));

        // The Operator's "apply now" is a fresh attempt; once it is up again the sentry forgets the failure.
        ops.Comes = _ => true;
        await sentry.ApplyAsync("apply-now");
        Assert.Equal(2, ops.Launches.Count);
        Assert.Equal("up", (await sentry.CheckAsync("sentry")).Rows[0].State);
    }

    private static long StartGrace() => LocalAppSentry.StartGraceMs + 1;

    [Fact]
    public async Task A_restarted_app_is_given_the_start_grace_before_it_is_judged_and_comes_back_up()
    {
        var (sentry, ops, store) = Make();
        store.Replace(Slice(1, new AutostartFlag("r1", "api", true, StartCommand: "node api.mjs")));
        ops.Comes = _ => false;                      // slow: not up right after the launch
        await sentry.CheckAsync("sentry");           // down → one restart
        Assert.Single(ops.Launches);
        _now += 30_000;
        Assert.Equal("starting", (await sentry.CheckAsync("sentry")).Rows[0].State);   // within the grace: no second launch, not failing
        Assert.Single(ops.Launches);
        ops.Listening.Add(47001);                    // it finished starting
        _now += 30_000;
        Assert.Equal("up", (await sentry.CheckAsync("sentry")).Rows[0].State);
    }

    [Fact]
    public async Task A_crash_right_after_a_successful_start_is_restarted_not_mistaken_for_a_slow_start()
    {
        var (sentry, ops, store) = Make();
        store.Replace(Slice(1, new AutostartFlag("r1", "api", true, StartCommand: "node api.mjs")));
        await sentry.ApplyAsync("apply-now");                         // launched, comes up
        Assert.Equal("up", (await sentry.CheckAsync("sentry")).Rows[0].State);
        ops.Listening.Remove(47001);                                  // crashes seconds later, well inside the grace
        _now += 5_000;
        await sentry.CheckAsync("sentry");
        Assert.Equal(2, ops.Launches.Count);                          // restarted at once
    }

    [Fact]
    public async Task A_hung_app_failing_its_health_url_is_stopped_and_relaunched_once()
    {
        var health = new Dictionary<string, string?> { ["http://127.0.0.1:47001/health"] = "HTTP 500" };
        var (sentry, ops, store) = Make(health);
        store.Replace(Slice(1, new AutostartFlag("r1", "api", true, HealthUrl: "http://127.0.0.1:47001/health", StartCommand: "node api.mjs")));
        ops.Listening.Add(47001);
        // apply never kills a running app…
        await sentry.ApplyAsync("apply-now");
        Assert.Empty(ops.Stops);
        Assert.Empty(ops.Launches);
        // …the sentry does, once.
        await sentry.CheckAsync("sentry");
        Assert.Equal(new[] { 47001 }, ops.Stops);
        Assert.Single(ops.Launches);
    }

    [Fact]
    public async Task Going_down_again_within_the_cooldown_marks_failing_without_a_second_restart()
    {
        var (sentry, ops, store) = Make();
        store.Replace(Slice(1, new AutostartFlag("r1", "api", true, StartCommand: "node api.mjs")));
        await sentry.CheckAsync("sentry");                // down → restart → comes up
        _now += StartGrace();
        Assert.Equal("up", (await sentry.CheckAsync("sentry")).Rows[0].State);
        ops.Listening.Remove(47001);                      // dies again 2 min after the restart (cooldown 15 min)
        _now += 120_000;
        Assert.Equal("failing", (await sentry.CheckAsync("sentry")).Rows[0].State);
        Assert.Single(ops.Launches);
    }

    [Fact]
    public void Flags_are_normalised_and_the_fleet_store_versions_each_machine()
    {
        var f = new AutostartFlag(" r1 ", " api ", true, "ftp://x", 999, 5000, -3, "  node a.mjs ", "..\\escape").Normalized(7);
        Assert.Equal(("r1", "api"), (f.RepoId, f.AppId));
        Assert.Null(f.HealthUrl);           // only http(s)
        Assert.Null(f.ExpectStatus);
        Assert.Equal(1000, f.Order);
        Assert.Equal(0, f.DelaySec);
        Assert.Equal("node a.mjs", f.StartCommand);
        Assert.Null(f.Folder);              // never outside the repo

        var fleet = new FleetAutostartStore(_logger, Path.Combine(_dir, "hub"));
        Assert.Equal(0, fleet.Slice("spacex", "hub").Version);
        var v1 = fleet.Upsert("spacex", new AutostartFlag("r9", "admin", true), 100);
        var v2 = fleet.Upsert("spacex", new AutostartFlag("r9", "admin", false), 100);
        Assert.True(v2 > v1);
        var slice = fleet.Slice("SPACEX", "hub");               // labels are case-insensitive
        Assert.False(Assert.Single(slice.Flags).Autostart);     // one entry per app, the newest
        fleet.SetSettings(new SentrySettings(0, 99999), 200);
        Assert.Equal(new SentrySettings(5, 1440), fleet.Settings());
        Assert.True(fleet.Slice("spacex", "hub").Version > v2); // a settings change re-pushes every machine

        // A reload reads the same.
        Assert.Equal(fleet.Slice("spacex", "hub").Version, new FleetAutostartStore(_logger, Path.Combine(_dir, "hub")).Slice("spacex", "hub").Version);
    }
}
