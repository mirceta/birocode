using System.Diagnostics;
using System.Runtime.Versioning;

namespace ClaudeWeb.Services.Watchdog;

/// <summary>
/// The ONE real probe of this machine's keep-alive scheduled task (fleet task c96de7ae),
/// shared so the status-strip tile (WatchdogController) and the fleet feed
/// (FleetOverviewProvider) report the SAME state with no drift. Reads the OS via
/// <c>schtasks /query</c> — a direct exe, no PowerShell spin-up — and never throws to its
/// caller: <see cref="Read"/> degrades a probe failure to an honest "error".
/// </summary>
public static class WatchdogProbe
{
    /// <summary>(supported, exists, enabled) from the live OS, or (false, …) off Windows.
    /// Never throws: a probe failure on Windows is reported as exists=false via the caught
    /// path in <see cref="Read"/>; callers wanting the mapped string use <see cref="Read"/>.</summary>
    public static (bool exists, bool enabled) Probe()
    {
        if (!OperatingSystem.IsWindows())
            return (false, false);
        var c = Cached();
        if (c.error is not null) throw c.error;
        return (c.exists, c.enabled);
    }

    // The probe is a process spawn (schtasks), and it sat on two polled request paths: the
    // status-strip tile (every 5 s per browser) and the fleet overview inside
    // GET /api/arch/fleet/status (every 5 s per panel). On the hub a spawn takes 30 ms to
    // several seconds, and fleet status — which the Kanban waited for — took 0.5–5.6 s
    // (openspec board-load-live). The result is now kept for Ttl: a fresh value is returned
    // as is, a stale one is returned at once while ONE background probe renews it, and only
    // the very first read (or the first after Invalidate) probes on the caller's thread.
    public static readonly TimeSpan Ttl = TimeSpan.FromSeconds(15);
    private static readonly object CacheGate = new();
    private static (bool exists, bool enabled, Exception? error)? _cached;
    private static long _cachedAtMs;
    private static bool _refreshing;

    /// <summary>Forget the cached state — after the installer ran, the next read probes the OS.</summary>
    public static void Invalidate() { lock (CacheGate) { _cached = null; _cachedAtMs = 0; } }

    [SupportedOSPlatform("windows")]
    private static (bool exists, bool enabled, Exception? error) ProbeOnce()
    {
        try { var (exists, enabled) = ProbeWindows(); return (exists, enabled, null); }
        catch (Exception ex) { return (false, false, ex); }
    }

    [SupportedOSPlatform("windows")]
    private static (bool exists, bool enabled, Exception? error) Cached()
    {
        (bool exists, bool enabled, Exception? error)? cached; bool start;
        var now = Environment.TickCount64;
        lock (CacheGate)
        {
            cached = _cached;
            start = cached is not null && now - _cachedAtMs > Ttl.TotalMilliseconds && !_refreshing;
            if (start) _refreshing = true;
        }
        if (cached is null)
        {
            var first = ProbeOnce();
            lock (CacheGate) { _cached = first; _cachedAtMs = Environment.TickCount64; }
            return first;
        }
        if (start)
        {
            _ = Task.Factory.StartNew(() =>
            {
                var next = ProbeOnce();
                lock (CacheGate) { _cached = next; _cachedAtMs = Environment.TickCount64; _refreshing = false; }
            }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
        }
        return cached.Value;
    }

    /// <summary>The strip/fleet state string for this machine: unsupported (non-Windows) /
    /// not_set_up / healthy / error — always a value, never an exception.</summary>
    public static (bool supported, string state) Read()
    {
        if (!OperatingSystem.IsWindows())
            return (false, "unsupported");
        try
        {
            var (exists, enabled) = Probe();
            return (true, WatchdogPlan.StateOf(true, exists, enabled));
        }
        catch
        {
            // A probe failure (schtasks missing, locked down) is an honest ERROR, not a throw.
            return (true, "error");
        }
    }

    // schtasks exit != 0 => the task does not exist; otherwise the LIST /v output carries
    // "Scheduled Task State: Enabled|Disabled".
    [SupportedOSPlatform("windows")]
    private static (bool exists, bool enabled) ProbeWindows()
    {
        var (code, stdout) = Capture("schtasks.exe",
            new[] { "/query", "/tn", WatchdogPlan.TaskName, "/fo", "LIST", "/v" });
        if (code != 0)
            return (false, false); // ERROR: The system cannot find the file specified.

        var enabled = stdout
            .Split('\n')
            .Where(l => l.Contains("Scheduled Task State", StringComparison.OrdinalIgnoreCase))
            .Any(l => l.Contains("Enabled", StringComparison.OrdinalIgnoreCase));
        return (true, enabled);
    }

    [SupportedOSPlatform("windows")]
    private static (int code, string stdout) Capture(string file, string[] args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = file,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);

        using var proc = Process.Start(psi)
            ?? throw new InvalidOperationException($"failed to start {file}");
        var stdout = proc.StandardOutput.ReadToEnd();
        _ = proc.StandardError.ReadToEnd(); // drain so the child never blocks on a full pipe
        if (!proc.WaitForExit(15_000))
        {
            try { proc.Kill(entireProcessTree: true); } catch { /* already gone */ }
            throw new TimeoutException($"{file} timed out");
        }
        return (proc.ExitCode, stdout);
    }
}
