using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.ArchPlan;

/// <summary>DI wiring for the architectural-plan document (plans/ideas-arch-plan.md).</summary>
public static class ArchPlanModuleExtensions
{
    public static IServiceCollection AddArchPlanModule(this IServiceCollection services)
    {
        services.AddSingleton<ArchPlanService>();
        return services;
    }
}
