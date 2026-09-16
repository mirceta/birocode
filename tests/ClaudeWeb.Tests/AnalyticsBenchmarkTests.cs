using System.Diagnostics;
using System.Text;
using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Analytics;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Xunit;
using Xunit.Abstractions;

namespace ClaudeWeb.Tests;

/// <summary>
/// The scoreboard cost benchmark (openspec fleet-status-panels, deliverable 3): measures
/// how big and how slow the analytics payload is, to justify loading the Fleet Status
/// Scoreboard ON DEMAND rather than in the periodic fleet poll. Prints bytes + ms per
/// window. Uses the machine's REAL activity ledger when present (a true on-this-box number
/// for the PR); otherwise a synthetic ~1000-event ledger so it still runs in CI. The
/// bound is generous — this is a measurement, not a tight SLA, and must never flake.
/// </summary>
public sealed class AnalyticsBenchmarkTests : IDisposable
{
    private readonly ITestOutputHelper _out;
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-bench-" + Guid.NewGuid().ToString("N"));

    public AnalyticsBenchmarkTests(ITestOutputHelper output)
    {
        _out = output;
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    [Fact]
    public void Scoreboard_payload_size_and_compute_time_per_window()
    {
        // Prefer the real ledger for a true on-this-box measurement; else synthesize.
        var realLedger = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb", "activity.jsonl");
        var dest = Path.Combine(_dir, "activity.jsonl");
        string source;
        if (File.Exists(realLedger))
        {
            File.Copy(realLedger, dest, overwrite: true);
            source = $"real ledger ({new FileInfo(dest).Length} bytes on disk)";
        }
        else
        {
            File.WriteAllText(dest, Synthesize(runs: 1000, days: 14));
            source = $"synthetic ({new FileInfo(dest).Length} bytes on disk)";
        }

        var logger = new Logger();
        var activity = new ActivityLog(logger, _dir);
        var repos = new RepositoryRegistry(new AppConfig(), logger); // reads the real store read-only
        var analytics = new AnalyticsService(activity, repos);
        var jsonOpts = new JsonSerializerOptions(JsonSerializerDefaults.Web);

        _out.WriteLine($"[scoreboard-benchmark] source: {source}; fleet poll interval: 5000 ms (Scoreboard is on-demand, not polled)");
        foreach (var win in new[] { "today", "7d", "all" })
        {
            // Warm once (first read parses the file), then time a representative call.
            analytics.Compute(win);
            var sw = Stopwatch.StartNew();
            var payload = analytics.Compute(win);
            sw.Stop();
            var bytes = Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(payload, jsonOpts));
            _out.WriteLine($"[scoreboard-benchmark] window={win,-5} compute={sw.ElapsedMilliseconds,4} ms  payload={bytes,7} bytes");
            Assert.NotNull(payload);
            Assert.True(sw.ElapsedMilliseconds < 1500, $"compute for {win} took {sw.ElapsedMilliseconds} ms");
        }
    }

    // A jsonl ledger of `runs` start/finish pairs spread across the last `days` days,
    // matching ActivityLog.Event's shape so AnalyticsService folds it like real data.
    private static string Synthesize(int runs, int days)
    {
        var sb = new StringBuilder();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var rnd = new Random(1);
        for (var i = 0; i < runs; i++)
        {
            var start = now - (long)(rnd.NextDouble() * days * 24 * 3600_000);
            var finish = start + rnd.Next(2_000, 600_000);
            var agent = $"repo-{i % 8}";
            var sid = Guid.NewGuid().ToString("N");
            sb.Append($"{{\"Ts\":{start},\"EventType\":\"start\",\"Agent\":\"{agent}\",\"Session\":\"{sid}\"}}\n");
            sb.Append($"{{\"Ts\":{finish},\"EventType\":\"finish\",\"Agent\":\"{agent}\",\"Session\":\"{sid}\",\"CostUsd\":0.12}}\n");
        }
        return sb.ToString();
    }
}
