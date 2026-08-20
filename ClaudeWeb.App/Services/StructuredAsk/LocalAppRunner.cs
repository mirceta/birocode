using System.Diagnostics;
using System.Net.NetworkInformation;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// The "live" half of local-app discovery (openspec change
/// discover-local-apps-run-controls). Discovery itself is a read-only, point-in-time
/// agent scan; this service answers the two RUNTIME questions the dock asks ABOUT a
/// discovered app:
///
///   - <see cref="IsListening"/>: is the app running RIGHT NOW? Answered by checking
///     the loopback port for an active TCP listener -- a cheap in-process snapshot,
///     no shell and no network. This is recomputed on every status fetch so the
///     dock's "running" dot reflects the present, never the (much earlier) scan time.
///     It also correctly reflects apps started outside the harness.
///
///   - <see cref="Launch"/>: start a discovered app. The command run is the one the
///     scan extracted (resolved server-side by port in the controller, never taken
///     from the client), launched DETACHED in the app's folder so it outlives the
///     request and keeps listening.
///
/// Stateless; safe as a singleton. We deliberately do NOT retain the launched
/// <see cref="Process"/> as the source of truth for "running" -- liveness is read off
/// the port instead. Stop therefore resolves the owning process LIVE from the port
/// at stop time (openspec local-app-lifecycle-controls, D1/D2): port -> owning PID
/// via Get-NetTCPConnection, kill via taskkill /T so the listener's child tree dies
/// with it -- which also makes apps started by hand on the host stoppable. The one
/// structural guard: the resolved PID must never be the harness itself or anything
/// hosting it (self-dev scans the harness repo, so a cached finding CAN claim the
/// harness's own port).
/// </summary>
public class LocalAppRunner
{
    /// <summary>True if some process is currently listening on <paramref name="port"/>
    /// (any local address). Used to project each discovered app's live running state.</summary>
    public bool IsListening(int port)
    {
        if (port < 1 || port > 65535) return false;
        try
        {
            var listeners = IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners();
            foreach (var ep in listeners)
                if (ep.Port == port) return true;
            return false;
        }
        catch
        {
            // If the OS query fails for any reason, report "not running" rather than
            // throwing -- the dot is advisory, not load-bearing.
            return false;
        }
    }

    /// <summary>
    /// Launch <paramref name="startCommand"/> detached, with the working directory set
    /// to <paramref name="workingDirectory"/> (the app's folder). Returns the launched
    /// process so the caller can surface a PID; the process is NOT awaited and its
    /// output is NOT redirected, so it runs independently of the request.
    /// </summary>
    public Process Launch(string startCommand, string workingDirectory)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = workingDirectory,
        };
        // -Command runs the discovered launch string verbatim (handles `node serve.mjs`,
        // `powershell -File serve.ps1`, npm scripts, etc.). Passed as a single argument
        // so PowerShell -- not C# string-splitting -- parses it.
        psi.ArgumentList.Add("-NoProfile");
        psi.ArgumentList.Add("-Command");
        psi.ArgumentList.Add(startCommand);

        return Process.Start(psi)
            ?? throw new InvalidOperationException("Process.Start returned null");
    }

    /// <summary>
    /// The PID of the process listening on <paramref name="port"/> (IPv4 or IPv6, any
    /// local address), or null when nothing is listening or the query fails. Resolved
    /// live at call time — no PID is ever retained from a launch — via
    /// <c>Get-NetTCPConnection -State Listen</c> (ships with Server 2019; exact PID
    /// semantics without ~100 lines of GetExtendedTcpTable interop, and Stop is a
    /// rare human action so a shell round-trip is fine).
    /// </summary>
    public int? ResolveListenerPid(int port)
    {
        if (port < 1 || port > 65535) return null;
        var output = RunShell(
            $"(Get-NetTCPConnection -State Listen -LocalPort {port} -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess");
        return int.TryParse(output?.Trim(), out var pid) && pid > 0 ? pid : null;
    }

    /// <summary>
    /// The PIDs Stop must never touch: this process and its ancestor chain (the
    /// terminal/scheduler/dev-host that spawned the harness). A PID comparison, not a
    /// port deny-list — ports are config, PIDs are ground truth (design D2). Walked
    /// fresh per call (stop is rare), bounded against parent-PID cycles/recycling.
    /// </summary>
    public HashSet<int> ProtectedPids()
    {
        var chain = new HashSet<int> { Environment.ProcessId };
        var pid = Environment.ProcessId;
        for (var hop = 0; hop < 10; hop++)
        {
            var output = RunShell(
                $"(Get-CimInstance Win32_Process -Filter \"ProcessId={pid}\" -ErrorAction SilentlyContinue).ParentProcessId");
            if (!int.TryParse(output?.Trim(), out var parent) || parent <= 0 || !chain.Add(parent))
                break;
            pid = parent;
        }
        return chain;
    }

    /// <summary>
    /// Kill <paramref name="pid"/> and its child tree via <c>taskkill /T /F</c> —
    /// locale-independent, tree semantics built in (the port's owner is typically the
    /// server process launched under our detached PowerShell wrapper, or whatever the
    /// operator started by hand). Returns success plus taskkill's output for the
    /// event log. Callers MUST have run the guards first; this method just kills.
    /// </summary>
    public (bool Ok, string Detail) KillTree(int pid)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "taskkill",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            psi.ArgumentList.Add("/PID");
            psi.ArgumentList.Add(pid.ToString());
            psi.ArgumentList.Add("/T");
            psi.ArgumentList.Add("/F");
            using var proc = Process.Start(psi)
                ?? throw new InvalidOperationException("Process.Start returned null");
            var output = proc.StandardOutput.ReadToEnd() + proc.StandardError.ReadToEnd();
            proc.WaitForExit(10_000);
            return (proc.HasExited && proc.ExitCode == 0, output.Trim());
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    /// <summary>
    /// Poll until nothing LISTENS on <paramref name="port"/> (250 ms steps). TIME_WAIT
    /// doesn't hold a listener, so this is a reliable free-port signal for restart's
    /// stop→launch gap. True when the port freed within <paramref name="timeout"/>.
    /// </summary>
    public bool WaitForPortFree(int port, TimeSpan timeout)
    {
        var deadline = DateTimeOffset.UtcNow + timeout;
        while (DateTimeOffset.UtcNow < deadline)
        {
            if (!IsListening(port)) return true;
            Thread.Sleep(250);
        }
        return !IsListening(port);
    }

    // One-shot PowerShell expression → trimmed stdout, null on any failure. Used
    // only for the rare stop-path OS queries above, never on hot paths.
    private static string? RunShell(string command)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            psi.ArgumentList.Add("-NoProfile");
            psi.ArgumentList.Add("-Command");
            psi.ArgumentList.Add(command);
            using var proc = Process.Start(psi);
            if (proc is null) return null;
            var output = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(15_000);
            return output;
        }
        catch
        {
            return null;
        }
    }
}
