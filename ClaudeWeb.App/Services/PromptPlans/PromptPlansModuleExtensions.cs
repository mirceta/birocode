using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.PromptPlans;

/// <summary>DI wiring for user-defined prompt plans (plans/prompt-plans.md).</summary>
public static class PromptPlansModuleExtensions
{
    public static IServiceCollection AddPromptPlansModule(this IServiceCollection services)
    {
        services.AddSingleton<PromptPlansService>();
        return services;
    }
}
