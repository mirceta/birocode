using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.StructuredAsk;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for local-app-lifecycle-controls' contract pieces that a live e2e
/// cannot force deterministically:
///  - <see cref="BuildCommandReport.Parse"/> — the backfill ask's validating
///    parse must reject any port outside the enumerated set (the ask cannot
///    invent apps) while accepting empty build commands (build-less is valid);
///  - <see cref="LocalAppExposureReport"/> back-compat — findings without
///    `buildCommand` (old caches, old imports, old exports) parse to "";
///  - <see cref="LocalAppDiscoveryCache.UpdateBuildCommands"/> — the backfill
///    merge is surgical: only `buildCommand` on matching ports, nothing else.
/// </summary>
public sealed class LocalAppLifecycleTests : IDisposable
{
    private const string Repo = "repo-1";
    private readonly string _dir;
    private readonly LocalAppDiscoveryCache _cache;

    public LocalAppLifecycleTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "cwtest-lifecycle-" + Guid.NewGuid().ToString("N"));
        _cache = new LocalAppDiscoveryCache(new Logger(), _dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    private static readonly DateTimeOffset T1 = new(2026, 8, 1, 12, 0, 0, TimeSpan.Zero);

    // ---- BuildCommandReport.Parse (the backfill ask's validator) ----

    [Fact]
    public void Backfill_parse_rejects_port_outside_the_enumerated_set()
    {
        var allowed = new HashSet<int> { 5000, 5100 };
        var json = """{ "apps": [ { "port": 5000, "buildCommand": "npm run build" }, { "port": 6000, "buildCommand": "make" } ] }""";

        var ex = Assert.Throws<JsonException>(() => BuildCommandReport.Parse(json, allowed));
        Assert.Contains("6000", ex.Message);
    }

    [Fact]
    public void Backfill_parse_accepts_enumerated_ports_and_empty_build_commands()
    {
        var allowed = new HashSet<int> { 5000, 5100 };
        var json = """{ "apps": [ { "port": 5000, "buildCommand": "npm run build" }, { "port": 5100, "buildCommand": "" } ] }""";

        var report = BuildCommandReport.Parse(json, allowed);

        Assert.Equal(2, report.Apps.Count);
        Assert.Equal("npm run build", report.Apps.Single(a => a.Port == 5000).BuildCommand);
        Assert.Equal("", report.Apps.Single(a => a.Port == 5100).BuildCommand);
    }

    [Fact]
    public void Backfill_parse_accepts_an_empty_answer_list()
    {
        var report = BuildCommandReport.Parse("""{ "apps": [] }""", new HashSet<int> { 5000 });
        Assert.Empty(report.Apps);
    }

    // ---- buildCommand back-compat on the discovery contract ----

    [Fact]
    public void Finding_without_buildCommand_parses_to_empty()
    {
        var report = LocalAppExposureReport.Parse(
            """{ "apps": [ { "name": "a", "port": 5000, "folder": "a", "evidence": "a/serve.mjs:1", "startCommand": "node serve.mjs" } ] }""");

        Assert.Equal("", Assert.Single(report.Apps).BuildCommand);
    }

    [Fact]
    public void Export_shape_with_buildCommand_round_trips_via_ParseImport()
    {
        // Exactly as the panel now emits it: buildCommand present when known,
        // omitted otherwise — both must import.
        var payload = """
        {
          "apps": [
            {
              "name": "homepage",
              "port": 5210,
              "folder": "homepage",
              "evidence": "homepage/serve.mjs:22",
              "startCommand": "node serve.mjs",
              "buildCommand": "npm run build"
            },
            {
              "name": "docs",
              "port": 5300,
              "folder": "docs-site",
              "evidence": "docs-site/server.js:10"
            }
          ]
        }
        """;

        var report = LocalAppExposureReport.ParseImport(payload);

        Assert.Equal("npm run build", report.Apps[0].BuildCommand);
        Assert.Equal("", report.Apps[1].BuildCommand);
    }

    // ---- pre-buildCommand cache files still load ----

    [Fact]
    public void Pre_buildCommand_cache_file_loads_with_empty_build_command()
    {
        Directory.CreateDirectory(_dir);
        var legacy = JsonSerializer.Serialize(new
        {
            Report = new { apps = new[] { new { name = "a", port = 5000, folder = "a", evidence = "", startCommand = "node serve.mjs" } } },
            CachedAt = T1,
        });
        File.WriteAllText(Path.Combine(_dir, Repo + ".json"), legacy);

        var loaded = _cache.Load(Repo)!;
        var app = Assert.Single(loaded.Report.Apps);
        Assert.Equal("node serve.mjs", app.StartCommand);
        Assert.Equal("", app.BuildCommand);
    }

    // ---- UpdateBuildCommands: surgical merge ----

    private LocalAppExposureReport TwoApps() => new()
    {
        Apps = new List<LocalAppFinding>
        {
            new() { Name = "a", Port = 5000, Folder = "a", Evidence = "a/serve.mjs:1", StartCommand = "node a.mjs", BuildCommand = "" },
            new() { Name = "b", Port = 5100, Folder = "b", Evidence = "b/serve.mjs:1", StartCommand = "node b.mjs", BuildCommand = "npm run build" },
        },
    };

    [Fact]
    public void UpdateBuildCommands_touches_only_matching_ports_build_command()
    {
        _cache.Save(Repo, TwoApps(), T1);

        var updated = _cache.UpdateBuildCommands(Repo, new Dictionary<int, string> { [5000] = "node build.mjs" })!;

        var a = updated.Report.Apps.Single(x => x.Port == 5000);
        var b = updated.Report.Apps.Single(x => x.Port == 5100);
        Assert.Equal("node build.mjs", a.BuildCommand);
        // Every other field, the untouched finding, timestamps: byte-identical.
        Assert.Equal("a", a.Name);
        Assert.Equal("node a.mjs", a.StartCommand);
        Assert.Equal("npm run build", b.BuildCommand);
        Assert.Equal(T1, updated.CachedAt);
        Assert.Equal(T1, updated.DiscoveredAtByPort![5000]);
        Assert.Equal(T1, updated.DiscoveredAtByPort[5100]);

        // And the write persisted.
        var reloaded = _cache.Load(Repo)!;
        Assert.Equal("node build.mjs", reloaded.Report.Apps.Single(x => x.Port == 5000).BuildCommand);
        Assert.Equal(T1, reloaded.CachedAt);
    }

    [Fact]
    public void UpdateBuildCommands_records_empty_answers_as_empty()
    {
        _cache.Save(Repo, TwoApps(), T1);

        var updated = _cache.UpdateBuildCommands(Repo, new Dictionary<int, string> { [5000] = "" })!;

        Assert.Equal("", updated.Report.Apps.Single(x => x.Port == 5000).BuildCommand);
    }

    [Fact]
    public void UpdateBuildCommands_ignores_unknown_ports()
    {
        _cache.Save(Repo, TwoApps(), T1);

        var updated = _cache.UpdateBuildCommands(Repo, new Dictionary<int, string> { [9999] = "make" })!;

        Assert.All(updated.Report.Apps, a => Assert.NotEqual("make", a.BuildCommand));
    }

    [Fact]
    public void UpdateBuildCommands_without_cache_returns_null()
    {
        Assert.Null(_cache.UpdateBuildCommands(Repo, new Dictionary<int, string> { [5000] = "make" }));
    }
}
