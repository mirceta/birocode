using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Notes;

/// <summary>DI wiring for the Ideas tab (plans/ideas-tab.md).</summary>
public static class NotesModuleExtensions
{
    public static IServiceCollection AddNotesModule(this IServiceCollection services)
    {
        services.AddSingleton<NotesService>();
        return services;
    }
}
