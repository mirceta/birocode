using System.Text.Json;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.StructuredAsk;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec repo-agent-local-apps — <c>my_local_apps</c>: the registry's list and the discovery
/// cache joined by port (harness apps with their folders, an unregistered finding listed, a
/// finding outside the repo refused), resolve by id / name / port, the list and status wording,
/// start / stop / restart through a faked runtime with the panel's rules, the always-on refusal,
/// and the server's catalogue.
/// </summary>
public sealed class RepoAgentLocalAppsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cw-local-apps-" + Guid.NewGuid().ToString("N"));
    private readonly string _repoPath;

    public RepoAgentLocalAppsTests()
    {
        Directory.CreateDirectory(_dir);
        _repoPath = Path.Combine(_dir, "prg");
        Directory.CreateDirectory(Path.Combine(_repoPath, "apps", "admin"));
    }
    public void Dispose() { try { Directory.Delete(_dir, true); } catch { /* best effort */ } }

    private RepoFacts Repo => new("r-prg", "prg", _repoPath, "prg");
    private static JsonElement Json(object? o) => JsonSerializer.SerializeToElement(o);

    private static readonly List<RepositoryRegistry.LocalAppInfo> Registered = new()
    {
        new("admin", "Admin console", 5300, "repo"),
        new("api", "Public API", 5400, "repo"),
        new(RepositoryRegistry.UnderstandingAppId, "Understanding", 0, "harness"),
        new(RepositoryRegistry.GoalAppId, "Goal", 0, "harness"),
    };

    private CachedDiscovery Cached(params (string Name, int Port, string Folder, string Start, string Build)[] apps)
    {
        var cache = new LocalAppDiscoveryCache(new Logger(), Path.Combine(_dir, "cache"));
        var json = JsonSerializer.Serialize(new { apps = apps.Select(a => new { name = a.Name, port = a.Port, folder = a.Folder, evidence = "package.json scripts.dev", startCommand = a.Start, buildCommand = a.Build }) });
        return cache.Save("r-prg", LocalAppExposureReport.Parse(json), new DateTimeOffset(2026, 9, 22, 10, 0, 0, TimeSpan.Zero));
    }

    private sealed class FakeOps : ILocalAppOps
    {
        public HashSet<int> Listening = new();
        public List<(string Cmd, string Folder)> Launched = new();
        public List<int> Stopped = new();
        public int? Protected;
        public bool IsListening(int port) => Listening.Contains(port);
        public (int? Pid, string? Error) Launch(string startCommand, string folder) { Launched.Add((startCommand, folder)); Listening.Add(5300); return (4242, null); }
        public (int? Pid, string? Error) Stop(int port)
        {
            if (!Listening.Contains(port)) return (null, $"nothing is listening on :{port}");
            if (Protected == port) return (null, $"refusing to stop PID 1 on :{port} — that is the harness itself (or its host process)");
            Listening.Remove(port); Stopped.Add(port); return (777, null);
        }
        public bool WaitForPortFree(int port, TimeSpan timeout) => !Listening.Contains(port);
    }

    private RepoAgentToolbox Toolbox(RepoAgentEnvironment env)
    {
        var g = new TaskGraphService(new Logger(), Path.Combine(_dir, "graph"));
        return new RepoAgentToolbox(g, (src, repo) => src is null ? "spacex/" + repo : src + "/" + repo, () => 100) { Environment = env };
    }

    private RepoAgentEnvironment Env(FakeOps? ops, List<(string, string, string, string, string)>? events = null, CachedDiscovery? cached = null, IReadOnlyList<RepositoryRegistry.LocalAppInfo>? registered = null) => new()
    {
        Repo = id => id == "r-prg" ? Repo : null,
        RegisteredApps = _ => registered ?? Registered,
        Discovery = cached is null ? null : new LocalAppDiscoveryCache(new Logger(), Path.Combine(_dir, "cache")),
        LocalAppOps = ops,
        Events = events is null ? null : (r, op, phase, title, detail) => events.Add((r, op, phase, title, detail)),
        HarnessPort = 5099,
    };

    // ---- the join ------------------------------------------------------------------------------

    [Fact]
    public void The_catalog_joins_registered_apps_with_discovered_folders_and_commands_by_port_and_lists_the_rest()
    {
        var cached = Cached(("admin", 5300, "apps/admin", "npm run dev", "npm run build"), ("worker", 5500, "apps/worker", "node worker.mjs", ""), ("escape", 5600, "../../outside", "x", ""));
        var apps = LocalAppCatalog.Build(Repo, Registered, cached, p => p == 5300, 5099);

        Assert.Equal(new[] { "admin", "api", "understanding", "goal", "port-5500", "port-5600" }, apps.Select(a => a.Id));
        var admin = apps[0];
        Assert.True(admin.Registered && admin.Discovered);
        Assert.Equal(Path.Combine(_repoPath, "apps", "admin"), admin.Folder);
        Assert.Equal("npm run dev", admin.StartCommand);
        Assert.Equal("npm run build", admin.BuildCommand);
        Assert.Equal("http://127.0.0.1:5300/", admin.Url);
        Assert.Equal("http://127.0.0.1:5099/api/localview/r-prg/app/admin/", admin.ServedAt);
        Assert.True(admin.Running);
        Assert.Contains("npm run dev", admin.HowToRun);
        Assert.Contains("build first with: npm run build", admin.HowToRun);
        Assert.NotNull(admin.DiscoveredAt);

        var api = apps[1];   // registered, never discovered
        Assert.True(api.Registered); Assert.False(api.Discovered);
        Assert.Null(api.Folder); Assert.Null(api.StartCommand); Assert.False(api.Running);
        Assert.Contains("never discovered", api.HowToRun);
        Assert.Contains("Discover", api.HowToRun);

        var und = apps[2];   // always on, with its folder
        Assert.Equal(LocalAppCatalog.KindHarness, und.Kind);
        Assert.Equal(Path.Combine(_repoPath, "understanding-app"), und.Folder);
        Assert.Null(und.Url);
        Assert.Equal("http://127.0.0.1:5099/api/localview/r-prg/app/understanding/", und.ServedAt);
        Assert.True(und.Running);
        Assert.Contains("index.html", und.HowToRun);

        var worker = apps[4]; // discovered, nobody registered it
        Assert.False(worker.Registered); Assert.True(worker.Discovered);
        Assert.Equal(5500, worker.Port); Assert.Null(worker.ServedAt);
        Assert.Equal(Path.Combine(_repoPath, "apps", "worker"), worker.Folder);
        Assert.Null(worker.BuildCommand);
        Assert.Contains("node worker.mjs", worker.HowToRun);

        var escape = apps[5]; // a finding pointing outside the repo
        Assert.Null(escape.Folder);
        Assert.Contains("outside this repo", escape.HowToRun);
    }

    [Fact]
    public void Resolve_accepts_an_id_a_name_or_a_port()
    {
        var apps = LocalAppCatalog.Build(Repo, Registered, Cached(("admin", 5300, "apps/admin", "npm run dev", "")), null, 5099);
        Assert.Equal("admin", LocalAppCatalog.Resolve(apps, "admin").App!.Id);
        Assert.Equal("admin", LocalAppCatalog.Resolve(apps, "Admin Console").App!.Id);
        Assert.Equal("admin", LocalAppCatalog.Resolve(apps, ":5300").App!.Id);
        Assert.Equal("api", LocalAppCatalog.Resolve(apps, "5400").App!.Id);
        Assert.Equal("goal", LocalAppCatalog.Resolve(apps, "GOAL").App!.Id);
        var (none, candidates) = LocalAppCatalog.Resolve(apps, "nope");
        Assert.Null(none);
        Assert.Contains("admin (Admin console, :5300)", candidates);
        Assert.Null(LocalAppCatalog.Resolve(apps, "admin").App!.Running); // no liveness probe wired
    }

    // ---- list / status ---------------------------------------------------------------------------

    [Fact]
    public void List_answers_every_app_with_where_it_is_and_status_answers_one_app_live()
    {
        var ops = new FakeOps { Listening = { 5300 } };
        var tb = Toolbox(Env(ops, cached: Cached(("admin", 5300, "apps/admin", "npm run dev", ""))));
        var list = tb.MyLocalApps("r-prg", null, null);
        Assert.True(list.Ok);
        Assert.Equal("ok", list.Status);
        Assert.Contains("4 local apps for prg (3 listening)", list.Detail);
        var j = Json(list.Data);
        Assert.Equal(_repoPath, j.GetProperty("path").GetString());
        Assert.Equal("http://127.0.0.1:5099/api/localview/r-prg/", j.GetProperty("localTab").GetString());
        Assert.Equal(4, j.GetProperty("registered").GetInt32());
        Assert.Equal(1, j.GetProperty("discovered").GetInt32());
        var rows = j.GetProperty("apps").EnumerateArray().ToList();
        Assert.Equal(4, rows.Count);
        Assert.Equal(Path.Combine(_repoPath, "apps", "admin"), rows[0].GetProperty("folder").GetString());
        Assert.True(rows[0].GetProperty("running").GetBoolean());
        Assert.False(rows[1].GetProperty("running").GetBoolean());
        Assert.Equal(JsonValueKind.Null, rows[2].GetProperty("port").ValueKind);

        var one = tb.MyLocalApps("r-prg", "status", "5400");
        Assert.True(one.Ok);
        Assert.Equal("not-listening", one.Status);
        Assert.Contains("Public API (api): not listening on :5400", one.Detail);
        Assert.Single(Json(one.Data).GetProperty("apps").EnumerateArray());

        var miss = tb.MyLocalApps("r-prg", "list", "ghost");
        Assert.False(miss.Ok);
        Assert.Equal("not-found", miss.Status);
        Assert.Contains("admin (Admin console, :5300)", miss.Detail);

        var empty = Toolbox(Env(ops, registered: Array.Empty<RepositoryRegistry.LocalAppInfo>())).MyLocalApps("r-prg", null, null);
        Assert.True(empty.Ok);
        Assert.Contains("has no local apps", empty.Detail);

        Assert.Equal("error", tb.MyLocalApps("r-prg", "dance", null).Status);
        Assert.Equal("error", tb.MyLocalApps(null, null, null).Status);
    }

    // ---- start / stop / restart ------------------------------------------------------------------

    [Fact]
    public void Start_launches_the_cached_command_in_the_apps_folder_and_refuses_what_it_cannot_run()
    {
        var ops = new FakeOps();
        var events = new List<(string, string, string, string, string)>();
        var tb = Toolbox(Env(ops, events, Cached(("admin", 5300, "apps/admin", "npm run dev", ""), ("ghost", 5500, "apps/ghost", "node x", ""))));

        var noApp = tb.MyLocalApps("r-prg", "start", null);
        Assert.Equal("error", noApp.Status);
        Assert.Contains("app is required", noApp.Detail);

        var neverDiscovered = tb.MyLocalApps("r-prg", "start", "api");
        Assert.Equal("no-command", neverDiscovered.Status);

        var missingFolder = tb.MyLocalApps("r-prg", "start", "5500");
        Assert.Equal("no-folder", missingFolder.Status);

        var alwaysOn = tb.MyLocalApps("r-prg", "start", "understanding");
        Assert.Equal("always-on", alwaysOn.Status);
        Assert.Empty(ops.Launched);

        var started = tb.MyLocalApps("r-prg", "start", "Admin console");
        Assert.True(started.Ok);
        Assert.Equal("launched", started.Status);
        Assert.Contains("pid 4242", started.Detail);
        Assert.Equal(("npm run dev", Path.Combine(_repoPath, "apps", "admin")), ops.Launched.Single());
        Assert.Contains(events, e => e.Item2 == "start" && e.Item3 == "done" && e.Item4 == "Start · Admin console (agent)");

        var again = tb.MyLocalApps("r-prg", "start", "5300");
        Assert.Equal("already-listening", again.Status);
        Assert.Single(ops.Launched);

        var none = Toolbox(Env(null, cached: Cached(("admin", 5300, "apps/admin", "npm run dev", "")))).MyLocalApps("r-prg", "start", "admin");
        Assert.Equal("unavailable", none.Status);
    }

    [Fact]
    public void Stop_ends_the_listener_with_the_harness_guard_and_restart_stops_waits_and_relaunches()
    {
        var ops = new FakeOps { Listening = { 5300 } };
        var events = new List<(string, string, string, string, string)>();
        var tb = Toolbox(Env(ops, events, Cached(("admin", 5300, "apps/admin", "npm run dev", ""))));

        var idle = tb.MyLocalApps("r-prg", "stop", "api");
        Assert.True(idle.Ok);
        Assert.Equal("not-listening", idle.Status);

        ops.Protected = 5300;
        var guarded = tb.MyLocalApps("r-prg", "stop", "admin");
        Assert.False(guarded.Ok);
        Assert.Equal("stop-failed", guarded.Status);
        Assert.Contains("harness itself", guarded.Detail);
        Assert.Contains(events, e => e.Item2 == "stop" && e.Item3 == "error");
        ops.Protected = null;

        var stopped = tb.MyLocalApps("r-prg", "stop", "admin");
        Assert.True(stopped.Ok);
        Assert.Equal("stopped", stopped.Status);
        Assert.Contains("PID 777", stopped.Detail);
        Assert.Equal(new[] { 5300 }, ops.Stopped);
        Assert.Contains(events, e => e.Item2 == "stop" && e.Item3 == "done" && e.Item4 == "Stop · Admin console (agent)");

        ops.Listening.Add(5300);
        var restarted = tb.MyLocalApps("r-prg", "restart", "5300");
        Assert.True(restarted.Ok);
        Assert.Equal("launched", restarted.Status);
        Assert.Equal(new[] { 5300, 5300 }, ops.Stopped);
        Assert.Single(ops.Launched);
        Assert.Contains(events, e => e.Item2 == "restart" && e.Item3 == "done");

        var harness = tb.MyLocalApps("r-prg", "stop", "goal");
        Assert.Equal("always-on", harness.Status);
    }

    // ---- the server -----------------------------------------------------------------------------

    [Fact]
    public void The_server_lists_and_dispatches_my_local_apps()
    {
        var tool = RepoAgentMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "my_local_apps")!;
        Assert.Contains("where they live", tool["description"]!.GetValue<string>());
        Assert.Null(tool["inputSchema"]!["required"]);
        Assert.Equal(2, tool["inputSchema"]!["properties"]!.AsObject().Count);

        var server = new RepoAgentMcpServer(Toolbox(Env(new FakeOps(), cached: Cached(("admin", 5300, "apps/admin", "npm run dev", "")))));
        var call = server.Handle(System.Text.Json.Nodes.JsonNode.Parse("""{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"my_local_apps","arguments":{"app":"admin"}}}"""), "r-prg");
        var outcome = JsonDocument.Parse(call.Body!["result"]!["content"]![0]!["text"]!.GetValue<string>()).RootElement;
        Assert.True(outcome.GetProperty("ok").GetBoolean());
        Assert.Equal("not-listening", outcome.GetProperty("status").GetString());
        Assert.Equal("npm run dev", outcome.GetProperty("data").GetProperty("apps")[0].GetProperty("startCommand").GetString());
        var init = server.Handle(System.Text.Json.Nodes.JsonNode.Parse("""{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"""), "r-prg");
        Assert.Contains("my_local_apps", init.Body!["result"]!["instructions"]!.GetValue<string>());
    }
}
