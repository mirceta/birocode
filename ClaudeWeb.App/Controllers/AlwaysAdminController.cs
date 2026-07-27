using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.Versioning;
using System.Security.Principal;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Win32;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Always-admin status + enabler for the header STATUS strip
/// (openspec add-always-admin-status). On Windows, UAC hands even an admin
/// account a filtered token, so every process the harness spawns starts
/// non-elevated. The durable machine-wide cure is to disable UAC at the master
/// switch — EnableLUA=0 (with ConsentPromptBehaviorAdmin=0 and
/// PromptOnSecureDesktop=0) under
/// HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System — which takes
/// effect after a reboot.
///
/// GET /status is a pure, non-privileged read (the trio of DWORDs + this
/// process's token elevation) and always returns 200. POST /enable writes the
/// trio, elevating once if needed so at most ONE UAC consent is raised on the
/// HOST desktop (the Operator answers it; the phone End User cannot). Neither
/// action reboots. Same probe idiom as HostTimeController: typed fields,
/// _logger.CountRequest(), degrade rather than throw.
/// </summary>
[ApiController]
[Route("api/always-admin")]
public class AlwaysAdminController : ControllerBase
{
    private const string PolicyKeyPath =
        @"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System";

    // ERROR_CANCELLED — Process.Start throws this Win32 code when the Operator
    // dismisses the UAC consent dialog for a runas launch.
    private const int ErrorCancelled = 1223;

    private readonly Logger _logger;

    public AlwaysAdminController(Logger logger)
    {
        _logger = logger;
    }

    public record AdminStatus(
        bool Supported,
        int? EnableLua,
        int? ConsentPromptBehaviorAdmin,
        int? PromptOnSecureDesktop,
        bool RegistrySet,
        bool TokenElevated,
        string State);

    public record EnableResult(bool Ok, string Method, string State, string? Error);

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
        {
            return Ok(new EnableResult(false, "unsupported", "disabled", "not a Windows host"));
        }

        // 1) Direct write — succeeds silently when the harness is already elevated.
        try
        {
            WriteTrioDirect();
            return Ok(new EnableResult(true, "direct", ReadStatus().State, null));
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException)
        {
            // Not elevated enough — fall through to a single elevated write.
        }
        catch (Exception ex)
        {
            return Ok(new EnableResult(false, "direct", ReadStatus().State, ex.Message));
        }

        // 2) Elevate once: import a .reg with all three values in a single
        //    consent. runas surfaces the UAC prompt on the host desktop.
        try
        {
            ElevatedWriteTrio();
            return Ok(new EnableResult(true, "elevated", ReadStatus().State, null));
        }
        catch (Win32Exception w32) when (w32.NativeErrorCode == ErrorCancelled)
        {
            return Ok(new EnableResult(false, "elevated", ReadStatus().State, "consent declined"));
        }
        catch (Exception ex)
        {
            return Ok(new EnableResult(false, "elevated", ReadStatus().State, ex.Message));
        }
    }

    // --- reads ---------------------------------------------------------------

    private AdminStatus ReadStatus()
    {
        if (!OperatingSystem.IsWindows())
        {
            return new AdminStatus(false, null, null, null, false, false, "disabled");
        }

        try
        {
            var (lua, consent, secure) = ReadTrio();
            var tokenElevated = IsProcessElevated();
            var registrySet = lua == 0 && consent == 0 && secure == 0;
            // State: registry not set => disabled (token elevation alone never
            // fabricates Active). Set + elevated => active; set + filtered =>
            // reboot still pending.
            var state = !registrySet
                ? "disabled"
                : tokenElevated ? "active" : "reboot_pending";
            return new AdminStatus(true, lua, consent, secure, registrySet, tokenElevated, state);
        }
        catch
        {
            // A read failure (locked-down key, unexpected value kind) degrades to
            // an inert unsupported chip rather than a 500.
            return new AdminStatus(false, null, null, null, false, false, "disabled");
        }
    }

    [SupportedOSPlatform("windows")]
    private static (int? lua, int? consent, int? secure) ReadTrio()
    {
        using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
        using var key = baseKey.OpenSubKey(PolicyKeyPath, writable: false);
        if (key is null) return (null, null, null);
        return (
            AsInt(key.GetValue("EnableLUA")),
            AsInt(key.GetValue("ConsentPromptBehaviorAdmin")),
            AsInt(key.GetValue("PromptOnSecureDesktop")));
    }

    private static int? AsInt(object? value) => value is int i ? i : null;

    [SupportedOSPlatform("windows")]
    private static bool IsProcessElevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    // --- writes --------------------------------------------------------------

    [SupportedOSPlatform("windows")]
    private static void WriteTrioDirect()
    {
        using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
        using var key = baseKey.OpenSubKey(PolicyKeyPath, writable: true)
            ?? throw new UnauthorizedAccessException("Policies\\System key is not writable");
        key.SetValue("EnableLUA", 0, RegistryValueKind.DWord);
        key.SetValue("ConsentPromptBehaviorAdmin", 0, RegistryValueKind.DWord);
        key.SetValue("PromptOnSecureDesktop", 0, RegistryValueKind.DWord);
    }

    // Writes the trio in ONE elevated action (single UAC consent) by importing a
    // temp .reg via an elevated reg.exe. Throws Win32Exception(1223) when the
    // Operator cancels the consent; the caller maps that to a typed failure.
    [SupportedOSPlatform("windows")]
    private static void ElevatedWriteTrio()
    {
        var regFile = Path.Combine(Path.GetTempPath(), $"claudeweb-always-admin-{Guid.NewGuid():N}.reg");
        System.IO.File.WriteAllText(regFile,
            "Windows Registry Editor Version 5.00\r\n\r\n" +
            "[HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System]\r\n" +
            "\"EnableLUA\"=dword:00000000\r\n" +
            "\"ConsentPromptBehaviorAdmin\"=dword:00000000\r\n" +
            "\"PromptOnSecureDesktop\"=dword:00000000\r\n");

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "reg.exe",
                UseShellExecute = true, // required for Verb=runas (UAC elevation)
                Verb = "runas",
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            psi.ArgumentList.Add("import");
            psi.ArgumentList.Add(regFile);

            using var proc = Process.Start(psi)
                ?? throw new InvalidOperationException("failed to start elevated reg.exe");
            if (!proc.WaitForExit(30_000))
            {
                try { proc.Kill(entireProcessTree: true); } catch { /* already gone */ }
                throw new TimeoutException("elevated reg import timed out");
            }
            if (proc.ExitCode != 0)
            {
                throw new InvalidOperationException($"reg import exited {proc.ExitCode}");
            }
        }
        finally
        {
            try { System.IO.File.Delete(regFile); } catch { /* best-effort cleanup */ }
        }
    }
}
