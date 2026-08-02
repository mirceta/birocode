using System.Text.Json;
using ClaudeWeb.Services.LoopEval;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for openspec loop-eval-scenario-transparency: the harness-side
/// manifest cache around the suite's --describe contract. The describe seam is
/// faked (no node process): valid JSON is parsed and served, bad JSON /
/// non-zero exit / timeout degrade to a manifestError entry (transparency
/// never blocks running), and the cache invalidates when any scenario script's
/// mtime moves — one generation for the whole set, since run-all composes the
/// others. Script files live in a throwaway temp dir, never the real suite.
/// </summary>
public sealed class ScenarioManifestCacheTests : IDisposable
{
    private readonly string _dir;

    public ScenarioManifestCacheTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "cwtest-manifests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, "goal.mjs"), "// fake scenario script");
        File.WriteAllText(Path.Combine(_dir, "queue.mjs"), "// fake scenario script");
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    private static readonly IReadOnlyList<(string Id, string Script)> Both =
        new[] { ("goal", "goal.mjs"), ("queue", "queue.mjs") };

    private static ScenarioManifestCache.DescribeResult Ok(string json) => new(0, json, "", TimedOut: false);

    [Fact]
    public void Valid_describe_output_is_parsed_and_served()
    {
        var cache = new ScenarioManifestCache((path, _) =>
            Ok($$"""{"describeVersion":1,"id":"{{Path.GetFileNameWithoutExtension(path)}}","title":"T"}"""));

        var got = cache.Get(_dir, Both);

        Assert.Null(got["goal"].Error);
        Assert.Equal("goal", got["goal"].Manifest!.Value.GetProperty("id").GetString());
        Assert.Equal("queue", got["queue"].Manifest!.Value.GetProperty("id").GetString());
    }

    [Fact]
    public void Bad_json_degrades_to_manifestError()
    {
        var cache = new ScenarioManifestCache((_, _) => Ok("this is not json {"));

        var got = cache.Get(_dir, Both);

        Assert.Null(got["goal"].Manifest);
        Assert.Contains("invalid JSON", got["goal"].Error);
    }

    [Fact]
    public void Nonzero_exit_and_timeout_degrade_to_manifestError()
    {
        var cache = new ScenarioManifestCache((path, _) =>
            path.EndsWith("goal.mjs")
                ? new ScenarioManifestCache.DescribeResult(1, "", "boom", TimedOut: false)
                : new ScenarioManifestCache.DescribeResult(-1, "", "", TimedOut: true));

        var got = cache.Get(_dir, Both);

        Assert.Contains("exited 1", got["goal"].Error);
        Assert.Contains("boom", got["goal"].Error);
        Assert.Contains("timed out", got["queue"].Error);
    }

    [Fact]
    public void Missing_script_reports_without_spawning()
    {
        var spawns = 0;
        var cache = new ScenarioManifestCache((_, _) => { spawns++; return Ok("{}"); });

        var got = cache.Get(_dir, new[] { ("ghost", "ghost.mjs") });

        Assert.Equal(0, spawns);
        Assert.Contains("script not found", got["ghost"].Error);
    }

    [Fact]
    public void Second_call_hits_the_cache_no_new_spawns()
    {
        var spawns = 0;
        var cache = new ScenarioManifestCache((_, _) => { spawns++; return Ok("""{"id":"x"}"""); });

        cache.Get(_dir, Both);
        var again = cache.Get(_dir, Both);

        Assert.Equal(2, spawns); // one per script, first call only
        Assert.Equal(JsonValueKind.Object, again["goal"].Manifest!.Value.ValueKind);
    }

    [Fact]
    public void Touching_any_script_invalidates_the_whole_generation()
    {
        var spawns = 0;
        var cache = new ScenarioManifestCache((_, _) => { spawns++; return Ok("""{"id":"x"}"""); });

        cache.Get(_dir, Both);
        File.SetLastWriteTimeUtc(Path.Combine(_dir, "queue.mjs"), DateTime.UtcNow.AddMinutes(1));
        cache.Get(_dir, Both);

        Assert.Equal(4, spawns); // both re-described, not just the touched one
    }
}
