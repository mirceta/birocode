using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace ClaudeWeb.Services.LoopEval;

/// <summary>
/// Caches the eval scenario scripts' <c>--describe</c> manifests (openspec:
/// loop-eval-scenario-transparency). The suite stays the single source of
/// scenario knowledge: the harness only spawns
/// <c>node &lt;script&gt; --describe</c> — side-effect free by the suite's
/// contract — and relays the parsed JSON to the Tests tab.
///
/// One cache generation for the whole set, keyed on the max mtime across all
/// scenario scripts: a composed manifest (the suite's run-all contract) would
/// make per-file invalidation under-invalidate, so the whole set refreshes
/// together. A failed describe degrades to an error note on that scenario —
/// transparency never blocks running.
/// </summary>
public sealed class ScenarioManifestCache
{
    /// <summary>Manifest (parsed, detached) or the reason there isn't one.</summary>
    public sealed record Entry(JsonElement? Manifest, string? Error);

    /// <summary>Raw describe outcome — the seam the tests fake so no node
    /// process is needed to cover parse/timeout/caching behavior.</summary>
    public sealed record DescribeResult(int ExitCode, string Stdout, string Stderr, bool TimedOut);

    public const int TimeoutMs = 5_000;
    private const int MaxOutputBytes = 128 * 1024;

    private readonly Func<string, string, DescribeResult> _describe;
    private readonly object _gate = new();
    private DateTime _stamp;
    private string? _suitePath;
    private Dictionary<string, Entry>? _cache;

    public ScenarioManifestCache(Func<string, string, DescribeResult>? describe = null)
        => _describe = describe ?? RunNodeDescribe;

    /// <summary>Manifests for every (id, script-filename) pair, spawning
    /// describe only when a script under <paramref name="suitePath"/> changed
    /// since the cached generation. Safe to call concurrently; a race costs a
    /// duplicate describe, never a torn result.</summary>
    public IReadOnlyDictionary<string, Entry> Get(string suitePath, IReadOnlyList<(string Id, string Script)> scenarios)
    {
        var stamp = DateTime.MinValue;
        foreach (var (_, script) in scenarios)
        {
            var f = new FileInfo(Path.Combine(suitePath, script));
            if (f.Exists && f.LastWriteTimeUtc > stamp) stamp = f.LastWriteTimeUtc;
        }

        lock (_gate)
        {
            if (_cache is not null && _stamp == stamp && _suitePath == suitePath)
                return _cache;
        }

        var built = new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase);
        foreach (var (id, script) in scenarios)
        {
            var path = Path.Combine(suitePath, script);
            built[id] = File.Exists(path)
                ? Describe(path, suitePath)
                : new Entry(null, $"script not found: {path}");
        }

        lock (_gate)
        {
            _cache = built;
            _stamp = stamp;
            _suitePath = suitePath;
        }
        return built;
    }

    private Entry Describe(string scriptPath, string workDir)
    {
        DescribeResult r;
        try { r = _describe(scriptPath, workDir); }
        catch (Exception ex) { return new Entry(null, $"--describe failed to launch: {ex.Message}"); }

        if (r.TimedOut)
            return new Entry(null, $"--describe timed out after {TimeoutMs / 1000} s");
        if (r.ExitCode != 0)
            return new Entry(null, $"--describe exited {r.ExitCode}: {Clip(string.IsNullOrWhiteSpace(r.Stderr) ? r.Stdout : r.Stderr)}");
        if (r.Stdout.Length > MaxOutputBytes)
            return new Entry(null, $"--describe output too large ({r.Stdout.Length} chars)");

        try
        {
            using var doc = JsonDocument.Parse(r.Stdout);
            return new Entry(doc.RootElement.Clone(), null);
        }
        catch (JsonException ex)
        {
            return new Entry(null, $"--describe printed invalid JSON: {ex.Message}");
        }
    }

    private static string Clip(string s) => s.Length <= 300 ? s.Trim() : s[..300].Trim() + "…";

    private static DescribeResult RunNodeDescribe(string scriptPath, string workDir)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "node",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = workDir,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        psi.ArgumentList.Add(scriptPath);
        psi.ArgumentList.Add("--describe");

        using var proc = Process.Start(psi)
            ?? throw new InvalidOperationException("Process.Start returned null for node");
        var stdout = proc.StandardOutput.ReadToEndAsync();
        var stderr = proc.StandardError.ReadToEndAsync();
        if (!proc.WaitForExit(TimeoutMs))
        {
            try { proc.Kill(entireProcessTree: true); } catch { /* already gone */ }
            proc.WaitForExit();
            return new DescribeResult(-1, "", "", TimedOut: true);
        }
        proc.WaitForExit(); // flush async readers
        return new DescribeResult(proc.ExitCode, stdout.GetAwaiter().GetResult(), stderr.GetAwaiter().GetResult(), TimedOut: false);
    }
}
