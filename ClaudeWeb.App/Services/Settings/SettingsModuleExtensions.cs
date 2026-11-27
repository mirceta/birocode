using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Settings;

public static class SettingsModuleExtensions
{
    public static IServiceCollection AddSettingsModule(this IServiceCollection services)
    {
        services.AddSingleton<UiSettingsService>();
        // The Management dashboard's layout presets, hub copy (fleet task d6e499cd).
        services.AddSingleton(sp => new ViewPresetsService(sp.GetRequiredService<Logging.Logger>()));
        // The Status tab's pinned agents, hub copy (fleet task 61a0d521).
        services.AddSingleton(sp => new StatusPinsService(sp.GetRequiredService<Logging.Logger>()));
        return services;
    }
}
