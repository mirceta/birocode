using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Expose;

/// <summary>DI wiring for the Exposure check (plans/product-onboarding.md).</summary>
public static class ExposeModuleExtensions
{
    public static IServiceCollection AddExposeModule(this IServiceCollection services)
    {
        services.AddSingleton<ExposeService>();
        return services;
    }
}
