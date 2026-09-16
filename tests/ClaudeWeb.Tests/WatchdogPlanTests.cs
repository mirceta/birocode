using ClaudeWeb.Services.Watchdog;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// fleet task c96de7ae — the harness keep-alive watchdog. Pins the pure parts the controller
/// funnels through: the REAL-probe → state mapping (healthy / not_set_up / error / unsupported)
/// and the generated scripts. The scripts are the safety contract, so assert their teeth are
/// present: boot AND logon triggers, restart-on-failure, highest privileges, and a loop that
/// health-checks the harness port and relaunches it detached when it is down.
/// </summary>
public class WatchdogPlanTests
{
    [Theory]
    [InlineData(false, false, false, "unsupported")] // not Windows
    [InlineData(false, true, true, "unsupported")]   // supported wins first
    [InlineData(true, false, false, "not_set_up")]   // no task yet → offer create
    [InlineData(true, true, true, "healthy")]        // task exists and enabled
    [InlineData(true, true, false, "error")]         // task exists but disabled
    public void StateOf_maps_the_probe_to_a_strip_state(bool supported, bool exists, bool enabled, string expected)
        => Assert.Equal(expected, WatchdogPlan.StateOf(supported, exists, enabled));

    [Fact]
    public void Watchdog_script_health_checks_the_given_port_and_relaunches_the_given_exe()
    {
        var s = WatchdogPlan.WatchdogScript(@"C:\run-bin\ClaudeWeb.exe", 5099);
        Assert.Contains("http://localhost:$port/api/health", s);
        Assert.Contains("$port = 5099", s);
        Assert.Contains(@"$exe = 'C:\run-bin\ClaudeWeb.exe'", s);
        Assert.Contains("Start-Process -FilePath $exe", s); // relaunch when down
        Assert.Contains("while ($true)", s);                // loops forever
    }

    [Fact]
    public void Watchdog_script_single_quotes_are_escaped_so_a_quirky_path_stays_a_literal()
    {
        var s = WatchdogPlan.WatchdogScript(@"C:\o'brien\ClaudeWeb.exe", 5200);
        Assert.Contains(@"$exe = 'C:\o''brien\ClaudeWeb.exe'", s); // doubled quote, not a broken string
        Assert.Contains("$port = 5200", s);
    }

    [Fact]
    public void Install_script_registers_a_boot_and_logon_task_that_restarts_on_failure_with_highest_rights()
    {
        var s = WatchdogPlan.InstallScript(@"C:\data\watchdog.ps1");
        Assert.Contains("Register-ScheduledTask", s);
        Assert.Contains(WatchdogPlan.TaskName, s);
        Assert.Contains("New-ScheduledTaskTrigger -AtStartup", s); // survives a reboot
        Assert.Contains("New-ScheduledTaskTrigger -AtLogOn", s);   // and a fresh logon
        Assert.Contains("-RestartCount", s);                        // restart-on-failure
        Assert.Contains("-RunLevel Highest", s);
        Assert.Contains(@"$wd = 'C:\data\watchdog.ps1'", s);        // points at the loop script
    }

    [Fact]
    public void The_elevated_command_and_cmd_wrapper_both_run_the_installer_verbatim()
    {
        var installer = @"C:\data\install-watchdog.ps1";
        var cmd = WatchdogPlan.ElevatedCommand(installer);
        Assert.Equal("powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\\data\\install-watchdog.ps1\"", cmd);

        var wrapper = WatchdogPlan.CmdWrapper(installer);
        Assert.Contains(installer, wrapper);
        Assert.Contains("powershell -NoProfile -ExecutionPolicy Bypass -File", wrapper);
        Assert.Contains("Run as administrator", wrapper); // tells the Operator how to elevate it
    }
}
