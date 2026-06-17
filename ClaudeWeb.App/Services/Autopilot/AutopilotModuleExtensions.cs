using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>DI wiring for loop-autopilot (plans/loop-autopilot.md). Slice 1 = the
/// read-only discovery service; Slice 2 adds the config store, the stub brain, and
/// the polling engine (registered both as a singleton — so the controller can read
/// its live state — and as the hosted background service that runs the loop).</summary>
public static class AutopilotModuleExtensions
{
    public static IServiceCollection AddAutopilotModule(this IServiceCollection services)
    {
        services.AddSingleton<AutopilotDiscoveryService>();
        services.AddSingleton<AutopilotConfigStore>();
        services.AddSingleton<AutopilotAuditLog>();
        services.AddSingleton<PromptClassifier>();
        services.AddSingleton<AutopilotService>();
        services.AddHostedService(sp => sp.GetRequiredService<AutopilotService>());
        return services;
    }
}
