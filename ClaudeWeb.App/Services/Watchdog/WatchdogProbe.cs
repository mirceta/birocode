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
        return ProbeWindows();
    }

    /// <summary>The strip/fleet state string for this machine: unsupported (non-Windows) /
    /// not_set_up / healthy / error — always a value, never an exception.</summary>
    public static (bool supported, string state) Read()
    {
        if (!OperatingSystem.IsWindows())
            return (false, "unsupported");
        try
        {
            var (exists, enabled) = ProbeWindows();
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
