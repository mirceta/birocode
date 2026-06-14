using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Pins;

/// <summary>DI wiring for Files-tab pins (plans/plan-files-merge.md).</summary>
public static class PinsModuleExtensions
{
    public static IServiceCollection AddPinsModule(this IServiceCollection services)
    {
        services.AddSingleton<PinsService>();
        return services;
    }
}
