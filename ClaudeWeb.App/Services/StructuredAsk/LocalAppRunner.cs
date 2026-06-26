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
/// the port instead (which is why there is no Stop here yet: without retained PIDs
/// there is nothing to kill; a Stop endpoint is a separate, larger change).
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
}
