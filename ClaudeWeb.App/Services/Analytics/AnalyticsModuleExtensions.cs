using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Analytics;

/// <summary>DI wiring for the Scoreboard (plans/scoreboard-analytics.md): the
/// append-only activity ledger + the metric aggregator.</summary>
public static class AnalyticsModuleExtensions
{
    public static IServiceCollection AddAnalyticsModule(this IServiceCollection services)
    {
        services.AddSingleton<ActivityLog>();
        services.AddSingleton<AnalyticsService>();
        return services;
    }
}
