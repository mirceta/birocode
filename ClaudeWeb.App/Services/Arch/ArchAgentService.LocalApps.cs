namespace ClaudeWeb.Services.Arch;

/// <summary>The arch's read of local-app autostart + sentry (fleet task f88f97fe, openspec
/// local-apps-autostart-sentry): <c>local_apps_status</c> reports; it never starts, stops or flags anything.</summary>
public partial class ArchAgentService
{
    private LocalApps.LocalAppsFleet? _localApps;

    public ToolOutcome ToolLocalAppsStatus(string? machine)
    {
        if (_localApps is null) return new ToolOutcome(false, "unavailable", "local-app autostart is not wired on this harness");
        try { return _localApps.Status(string.IsNullOrWhiteSpace(machine) ? null : machine.Trim()); }
        catch (Exception ex) { return new ToolOutcome(false, "error", ex.Message); }
    }
}
