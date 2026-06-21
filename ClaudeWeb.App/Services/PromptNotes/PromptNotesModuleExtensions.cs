using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.PromptNotes;

/// <summary>DI wiring for user-defined prompt notes (the ⚙ pop-up's Notes tab).</summary>
public static class PromptNotesModuleExtensions
{
    public static IServiceCollection AddPromptNotesModule(this IServiceCollection services)
    {
        services.AddSingleton<PromptNotesService>();
        return services;
    }
}
