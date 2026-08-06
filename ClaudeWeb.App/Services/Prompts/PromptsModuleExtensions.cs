using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Prompts;

/// <summary>DI wiring for user-defined composer prompts (plans/custom-prompts.md).</summary>
public static class PromptsModuleExtensions
{
    public static IServiceCollection AddPromptsModule(this IServiceCollection services)
    {
        services.AddSingleton<PromptsService>();
        services.AddSingleton<FooterClausesService>(); // openspec prompt-footer-clauses
        return services;
    }
}
