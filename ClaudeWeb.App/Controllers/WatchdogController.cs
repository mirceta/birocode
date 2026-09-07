using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.Versioning;
using ClaudeWeb.Models;
using ClaudeWeb.Services;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Watchdog;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Harness keep-alive watchdog status + one-click enabler for the header STATUS strip
/// (fleet task c96de7ae). The keep-alive is an OS-level Scheduled Task
/// (<see cref="WatchdogPlan.TaskName"/>) that outlives the harness process: it launches a
/// watchdog loop at BOOT and at LOGON, restarts that loop on failure, and the loop
/// health-checks the harness port and relaunches the harness (detached) whenever it is down.
///
/// GET /status is a pure, non-privileged probe of the real OS task (exists? enabled?) and
/// always returns 200 — HEALTHY vs NOT SET UP vs ERROR, never a guess. POST /enable writes
/// the generated scripts to the data dir and tries to register the task: directly first, then
/// elevating ONCE (a single UAC consent on the HOST desktop, the way AlwaysAdminController
/// does). Registering a boot-trigger task needs admin, so when the harness is denied this is
/// privilege-honest: it returns "needs-elevation" carrying the EXACT command the Operator must
/// run elevated and the path to the generated .cmd — it never claims a success it did not get.
/// Same idiom as AlwaysAdminController: typed records, _logger.CountRequest(), degrade-not-throw.
/// </summary>
[ApiController]
[Route("api/watchdog")]
public class WatchdogController : ControllerBase
{
    // ERROR_CANCELLED — Process.Start throws this Win32 code when the Operator dismisses the
    // UAC consent dialog for a runas launch.
    private const int ErrorCancelled = 1223;

    private readonly Logger _logger;
    private readonly AppConfig _config;

    public WatchdogController(Logger logger, AppConfig config)
    {
        _logger = logger;
        _config = config;
    }

    public record WatchdogStatus(
        bool Supported,
        bool Exists,
        bool Enabled,
        string TaskName,
        string State);

    public record EnableResult(
        bool Ok,
        string Method,
        string State,
        string? Error,
        string? ElevatedCommand,
        string? CmdPath,
        string? InstallScriptPath);

    [HttpGet("status")]
    public IActionResult GetStatus()
    {
        _logger.CountRequest();
        return Ok(ReadStatus());
    }

    [HttpPost("enable")]
    public IActionResult Enable()
    {
        _logger.CountRequest();

        if (!OperatingSystem.IsWindows())
            return Ok(new EnableResult(false, "unsupported", "unsupported", "not a Windows host", null, null, null));

        // Write the generated scripts (watchdog loop + installer + elevate-me .cmd) with the
        // concrete exe + port baked in. Do this first so the exact elevated command we may hand
        // back actually points at a file on disk.
        string installPs1, cmdPath;
        try
        {
            (installPs1, cmdPath) = WriteScripts();
        }
        catch (Exception ex)
        {
            return Ok(new EnableResult(false, "error", ReadStatus().State, "could not write scripts: " + ex.Message, null, null, null));
        }

        var elevatedCommand = WatchdogPlan.ElevatedCommand(installPs1);

        // 1) Direct register — succeeds silently only if the harness is already elevated.
        try
        {
            RunInstaller(installPs1, elevated: false);
        }
        catch { /* fall through — a re-probe below is the source of truth, not this exit code */ }

        if (ReadStatus() is { Exists: true, Enabled: true })
            return Ok(new EnableResult(true, "created", "healthy", null, elevatedCommand, cmdPath, installPs1));

        // 2) Elevate once: a single UAC consent on the host desktop registers the boot-trigger
        //    task. The Operator answers it; the phone End User cannot.
        try
        {
            RunInstaller(installPs1, elevated: true);
            if (ReadStatus() is { Exists: true, Enabled: true })
                return Ok(new EnableResult(true, "created", "healthy", null, elevatedCommand, cmdPath, installPs1));
        }
        catch (Win32Exception w32) when (w32.NativeErrorCode == ErrorCancelled)
        {
            return Ok(new EnableResult(false, "needs-elevation", "error", "consent declined", elevatedCommand, cmdPath, installPs1));
        }
        catch { /* denied / no consent path — surface the honest needs-elevation below */ }

        // 3) Could not create it ourselves. Be honest: tell the Operator exactly what to run.
        return Ok(new EnableResult(false, "needs-elevation", ReadStatus().State,
            "the harness could not create the scheduled task (Access is denied). Run the command below in an ELEVATED terminal, or right-click install-watchdog.cmd → Run as administrator.",
            elevatedCommand, cmdPath, installPs1));
    }

    // --- probe ---------------------------------------------------------------

    // The strip's status, from the shared probe (WatchdogProbe) so the tile and the fleet feed
    // never drift. Off Windows / on a probe failure it degrades to a typed record, never a 500.
    private WatchdogStatus ReadStatus()
    {
        if (!OperatingSystem.IsWindows())
            return new WatchdogStatus(false, false, false, WatchdogPlan.TaskName, "unsupported");

        try
        {
            var (exists, enabled) = WatchdogProbe.Probe();
            return new WatchdogStatus(true, exists, enabled, WatchdogPlan.TaskName,
                WatchdogPlan.StateOf(true, exists, enabled));
        }
        catch
        {
            return new WatchdogStatus(true, false, false, WatchdogPlan.TaskName, "error");
        }
    }

    // --- writes --------------------------------------------------------------

    private (string installPs1, string cmdPath) WriteScripts()
    {
        Directory.CreateDirectory(AppPaths.DataDir);
        var exe = HarnessExePath();
        var watchdogPs1 = Path.Combine(AppPaths.DataDir, "watchdog.ps1");
        var installPs1 = Path.Combine(AppPaths.DataDir, "install-watchdog.ps1");
        var cmdPath = Path.Combine(AppPaths.DataDir, "install-watchdog.cmd");

        System.IO.File.WriteAllText(watchdogPs1, WatchdogPlan.WatchdogScript(exe, _config.Port));
        System.IO.File.WriteAllText(installPs1, WatchdogPlan.InstallScript(watchdogPs1));
        System.IO.File.WriteAllText(cmdPath, WatchdogPlan.CmdWrapper(installPs1));
        return (installPs1, cmdPath);
    }

    // The real deployed harness exe (run-bin\ClaudeWeb.exe), so the generated watchdog relaunches
    // the harness and never depends on the repo/dotnet being present. Under `dotnet run` MainModule
    // is dotnet.exe, so prefer a ClaudeWeb.exe next to our assemblies when one exists.
    private static string HarnessExePath()
    {
        var beside = Path.Combine(AppContext.BaseDirectory, "ClaudeWeb.exe");
        if (System.IO.File.Exists(beside))
            return beside;
        try
        {
            var main = Process.GetCurrentProcess().MainModule?.FileName;
            if (!string.IsNullOrWhiteSpace(main))
                return main!;
        }
        catch { /* MainModule can be inaccessible; fall through */ }
        return beside;
    }

    [SupportedOSPlatform("windows")]
    private static void RunInstaller(string installPs1, bool elevated)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        psi.ArgumentList.Add("-NoProfile");
        psi.ArgumentList.Add("-ExecutionPolicy");
        psi.ArgumentList.Add("Bypass");
        psi.ArgumentList.Add("-File");
        psi.ArgumentList.Add(installPs1);

        if (elevated)
        {
            psi.UseShellExecute = true; // required for Verb=runas (UAC elevation)
            psi.Verb = "runas";
        }
        else
        {
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
        }

        using var proc = Process.Start(psi)
            ?? throw new InvalidOperationException("failed to start powershell installer");
        if (!proc.WaitForExit(30_000))
        {
            try { proc.Kill(entireProcessTree: true); } catch { /* already gone */ }
            throw new TimeoutException("watchdog installer timed out");
        }
    }
}
