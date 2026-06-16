using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>DI wiring for loop-autopilot (plans/loop-autopilot.md). Slice 1 is
/// just the read-only discovery service; the watcher engine + brain come later.</summary>
public static class AutopilotModuleExtensions
{
    public static IServiceCollection AddAutopilotModule(this IServiceCollection services)
    {
        services.AddSingleton<AutopilotDiscoveryService>();
        return services;
    }
}
