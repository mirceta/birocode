using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Notes;

/// <summary>DI wiring for the Ideas tab (plans/ideas-tab.md).</summary>
public static class NotesModuleExtensions
{
    public static IServiceCollection AddNotesModule(this IServiceCollection services)
    {
        services.AddSingleton<NotesService>();
        // Shared-board sync (openspec ideas-drive-sync): inert until the user
        // pastes a sync URL and enables it in the Ideas panel.
        services.AddSingleton<IdeasSyncConfigStore>();
        services.AddSingleton<IdeasSyncClient>();
        services.AddSingleton<IdeasSyncService>();
        services.AddHostedService(sp => sp.GetRequiredService<IdeasSyncService>());
        return services;
    }
}
