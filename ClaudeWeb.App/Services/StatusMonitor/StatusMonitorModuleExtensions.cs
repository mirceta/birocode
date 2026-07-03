using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.StatusMonitor;

/// <summary>
/// DI registration for the status-monitor wallboard module (openspec change
/// status-monitor-dashboard). The orchestrator wires the matching
/// <c>builder.Services.AddStatusMonitorModule()</c> line in EmbeddedApi.cs — this
/// module never edits that shared file beyond it. See plans/INTEGRATION.md.
/// </summary>
public static class StatusMonitorModuleExtensions
{
    public static IServiceCollection AddStatusMonitorModule(this IServiceCollection services)
    {
        // Singletons: the GitHub section cache and the fleet state-transition memory
        // must both survive across requests (a per-request instance would report
        // every source as "duration unknown" forever).
        services.AddSingleton<GitHubStatusService>();
        services.AddSingleton<StatusBoardService>();
        return services;
    }
}
