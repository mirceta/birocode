using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.StructuredAsk;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for importing externally produced findings (openspec
/// import-discovery-findings): <see cref="LocalAppExposureReport.ParseImport"/>'s
/// bare-array/report-object normalization and all-or-nothing validation, plus the
/// import-shaped union merge through <see cref="LocalAppDiscoveryCache.Save"/> —
/// the exact composition POST /api/local-apps/cache/import runs.
/// </summary>
public sealed class LocalAppImportTests : IDisposable
{
    private const string Repo = "repo-1";
    private readonly string _dir;
    private readonly LocalAppDiscoveryCache _cache;

    public LocalAppImportTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "cwtest-import-" + Guid.NewGuid().ToString("N"));
        _cache = new LocalAppDiscoveryCache(new Logger(), _dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    private static string Finding(string name, int port) =>
        $"{{\"name\":\"{name}\",\"port\":{port},\"folder\":\"{name}\",\"evidence\":\"{name}/serve.mjs:1\",\"startCommand\":\"node serve.mjs\"}}";

    private static readonly DateTimeOffset T1 = new(2026, 7, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset T2 = new(2026, 7, 28, 12, 0, 0, TimeSpan.Zero);

    // ---- ParseImport: payload shapes ------------------------------------------

    [Fact]
    public void Bare_array_is_accepted()
    {
        var report = LocalAppExposureReport.ParseImport($"[{Finding("a", 5000)},{Finding("b", 5100)}]");
        Assert.Equal(new[] { 5000, 5100 }, report.Apps.Select(a => a.Port));
    }

    [Fact]
    public void Report_object_is_accepted()
    {
        var report = LocalAppExposureReport.ParseImport($"{{\"apps\":[{Finding("a", 5000)}]}}");
        Assert.Equal("a", Assert.Single(report.Apps).Name);
    }

    [Fact]
    public void Surrounding_whitespace_is_tolerated()
    {
        var report = LocalAppExposureReport.ParseImport($"\n  [{Finding("a", 5000)}]  \n");
        Assert.Single(report.Apps);
    }

    // ---- ParseImport: all-or-nothing rejection --------------------------------

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not json at all")]
    [InlineData("42")]
    [InlineData("\"a string\"")]
    [InlineData("[{\"name\":\"a\",\"port\":5000,\"folder\":\"a\"}")] // truncated
    public void Malformed_or_non_report_payloads_throw(string payload)
    {
        Assert.Throws<JsonException>(() => LocalAppExposureReport.ParseImport(payload));
    }

    [Fact]
    public void One_bad_finding_rejects_the_whole_payload()
    {
        // Second finding has no folder — even the valid first one must not survive.
        var payload = $"[{Finding("a", 5000)},{{\"name\":\"b\",\"port\":5100,\"folder\":\"\"}}]";
        Assert.Throws<JsonException>(() => LocalAppExposureReport.ParseImport(payload));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(70000)]
    public void Out_of_range_port_rejects_the_payload(int port)
    {
        Assert.Throws<JsonException>(() => LocalAppExposureReport.ParseImport($"[{Finding("a", port)}]"));
    }

    // ---- Import merge (ParseImport → Save, as the endpoint composes them) ------

    [Fact]
    public void Import_into_empty_cache_creates_it_with_import_times()
    {
        var report = LocalAppExposureReport.ParseImport($"[{Finding("a", 5000)}]");
        var merged = _cache.Save(Repo, report, T2);

        Assert.Single(merged.Report.Apps);
        Assert.Equal(T2, merged.DiscoveredAtByPort![5000]);
        Assert.Single(_cache.Load(Repo)!.Report.Apps);
    }

    [Fact]
    public void Import_unions_with_existing_cache_by_port()
    {
        // Scanned earlier: a (5000), b (5100). Import replaces b and adds c.
        _cache.Save(Repo, LocalAppExposureReport.ParseImport($"[{Finding("a", 5000)},{Finding("b", 5100)}]"), T1);
        var import = LocalAppExposureReport.ParseImport($"[{Finding("b-renamed", 5100)},{Finding("c", 5200)}]");
        var merged = _cache.Save(Repo, import, T2);

        Assert.Equal(3, merged.Report.Apps.Count);
        Assert.Equal("b-renamed", merged.Report.Apps.Single(a => a.Port == 5100).Name);
        // Imported ports carry the import time; the untouched port keeps its own.
        Assert.Equal(T2, merged.DiscoveredAtByPort![5100]);
        Assert.Equal(T2, merged.DiscoveredAtByPort[5200]);
        Assert.Equal(T1, merged.DiscoveredAtByPort[5000]);
    }

    [Fact]
    public void Duplicate_port_within_one_import_keeps_the_first()
    {
        var import = LocalAppExposureReport.ParseImport($"[{Finding("first", 5000)},{Finding("second", 5000)}]");
        var merged = _cache.Save(Repo, import, T2);

        var app = Assert.Single(merged.Report.Apps);
        Assert.Equal("first", app.Name);
    }

    [Fact]
    public void Rejected_payload_leaves_cache_file_unchanged()
    {
        _cache.Save(Repo, LocalAppExposureReport.ParseImport($"[{Finding("a", 5000)}]"), T1);
        var before = File.ReadAllText(Path.Combine(_dir, Repo + ".json"));

        Assert.Throws<JsonException>(() => LocalAppExposureReport.ParseImport($"[{Finding("a", 5000)},{Finding("bad", 0)}]"));

        Assert.Equal(before, File.ReadAllText(Path.Combine(_dir, Repo + ".json")));
    }
}
