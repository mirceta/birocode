using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.StructuredAsk;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for the union-by-port discovery cache (openspec discover-apps-panel):
/// <see cref="LocalAppDiscoveryCache"/> Save/Load/Delete against a throwaway temp
/// dir (the ctor's test-only dir override), plus the in-memory job-result removal
/// that backs DELETE /api/local-apps/cache/{port}.
/// </summary>
public sealed class LocalAppDiscoveryCacheTests : IDisposable
{
    private const string Repo = "repo-1";
    private readonly string _dir;
    private readonly LocalAppDiscoveryCache _cache;

    public LocalAppDiscoveryCacheTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "cwtest-cache-" + Guid.NewGuid().ToString("N"));
        _cache = new LocalAppDiscoveryCache(new Logger(), _dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    private static LocalAppExposureReport Report(params (string Name, int Port)[] apps) => new()
    {
        Apps = apps.Select(a => new LocalAppFinding
        {
            Name = a.Name,
            Port = a.Port,
            Folder = a.Name,
            Evidence = $"{a.Name}/serve.mjs:1",
            StartCommand = $"node serve-{a.Name}.mjs",
        }).ToList(),
    };

    private static readonly DateTimeOffset T1 = new(2026, 7, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset T2 = new(2026, 7, 20, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Partial_rescan_keeps_earlier_findings()
    {
        _cache.Save(Repo, Report(("a", 5000), ("b", 5100), ("c", 5200)), T1);
        var merged = _cache.Save(Repo, Report(("b", 5100)), T2);

        Assert.Equal(new[] { 5100, 5000, 5200 }, merged.Report.Apps.Select(a => a.Port));
        var loaded = _cache.Load(Repo)!;
        Assert.Equal(3, loaded.Report.Apps.Count);
        Assert.Equal(T2, loaded.CachedAt);
        // Rescanned port carries the new time; kept ports keep their original.
        Assert.Equal(T2, loaded.DiscoveredAtByPort![5100]);
        Assert.Equal(T1, loaded.DiscoveredAtByPort[5000]);
        Assert.Equal(T1, loaded.DiscoveredAtByPort[5200]);
    }

    [Fact]
    public void Matching_port_is_refreshed_not_duplicated()
    {
        _cache.Save(Repo, Report(("old-name", 5100)), T1);
        var report = Report(("new-name", 5100));
        report.Apps[0].StartCommand = "node changed.mjs";
        _cache.Save(Repo, report, T2);

        var loaded = _cache.Load(Repo)!;
        var app = Assert.Single(loaded.Report.Apps);
        Assert.Equal("new-name", app.Name);
        Assert.Equal("node changed.mjs", app.StartCommand);
        Assert.Equal(T2, loaded.DiscoveredAtByPort![5100]);
    }

    [Fact]
    public void Save_returns_the_merged_union()
    {
        _cache.Save(Repo, Report(("a", 5000)), T1);
        var merged = _cache.Save(Repo, Report(("b", 5100)), T2);

        Assert.Equal(2, merged.Report.Apps.Count);
        Assert.Equal(T1, merged.DiscoveredAtByPort![5000]);
        Assert.Equal(T2, merged.DiscoveredAtByPort[5100]);
    }

    [Fact]
    public void Pre_union_cache_file_loads_with_defaulted_times()
    {
        // A file exactly as the pre-union code wrote it: no DiscoveredAtByPort.
        Directory.CreateDirectory(_dir);
        var legacy = JsonSerializer.Serialize(new
        {
            Report = new { apps = new[] { new { name = "a", port = 5000, folder = "a", evidence = "", startCommand = "" } } },
            CachedAt = T1,
        }, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(Path.Combine(_dir, Repo + ".json"), legacy);

        var loaded = _cache.Load(Repo)!;
        Assert.Single(loaded.Report.Apps);
        Assert.Equal(T1, loaded.DiscoveredAtByPort![5000]);
    }

    [Fact]
    public void Delete_removes_one_finding_and_persists()
    {
        _cache.Save(Repo, Report(("a", 5000), ("b", 5100)), T1);
        var (outcome, updated) = _cache.Delete(Repo, 5000);

        Assert.Equal(CacheDeleteOutcome.Deleted, outcome);
        Assert.Equal(new[] { 5100 }, updated!.Report.Apps.Select(a => a.Port));
        var loaded = _cache.Load(Repo)!;
        Assert.Equal(new[] { 5100 }, loaded.Report.Apps.Select(a => a.Port));
        Assert.False(loaded.DiscoveredAtByPort!.ContainsKey(5000));
    }

    [Fact]
    public void Deleting_last_finding_leaves_cached_empty_not_no_cache()
    {
        _cache.Save(Repo, Report(("a", 5000)), T1);
        var (outcome, updated) = _cache.Delete(Repo, 5000);

        Assert.Equal(CacheDeleteOutcome.Deleted, outcome);
        Assert.Empty(updated!.Report.Apps);
        // Distinct from "no cache": Load still returns a record, just an empty one.
        var loaded = _cache.Load(Repo);
        Assert.NotNull(loaded);
        Assert.Empty(loaded!.Report.Apps);
    }

    [Fact]
    public void Delete_without_cache_reports_no_cache()
    {
        var (outcome, updated) = _cache.Delete(Repo, 5000);
        Assert.Equal(CacheDeleteOutcome.NoCache, outcome);
        Assert.Null(updated);
    }

    [Fact]
    public void Delete_with_unmatched_port_reports_not_found_and_changes_nothing()
    {
        _cache.Save(Repo, Report(("a", 5000)), T1);
        var (outcome, _) = _cache.Delete(Repo, 9999);

        Assert.Equal(CacheDeleteOutcome.NotFound, outcome);
        Assert.Single(_cache.Load(Repo)!.Report.Apps);
    }

    [Fact]
    public void Cache_is_keyed_by_repo()
    {
        _cache.Save("repo-a", Report(("a", 5000)), T1);
        Assert.Null(_cache.Load("repo-b"));
    }

    [Fact]
    public void Job_result_removal_drops_the_port_from_result_and_times()
    {
        var cached = _cache.Save(Repo, Report(("a", 5000), ("b", 5100)), T1);
        var job = DiscoveryJob.Completed(cached);

        job.RemoveResultApp(5000);

        Assert.Equal(new[] { 5100 }, job.Result!.Apps.Select(a => a.Port));
        Assert.False(job.DiscoveredAt!.ContainsKey(5000));
        // Removing an unknown port is a no-op, not an error.
        job.RemoveResultApp(4242);
        Assert.Single(job.Result!.Apps);
    }
}
