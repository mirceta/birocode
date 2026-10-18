using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Settings;

public static class SettingsModuleExtensions
{
    public static IServiceCollection AddSettingsModule(this IServiceCollection services)
    {
        services.AddSingleton<UiSettingsService>();
        // The Management dashboard's layout presets, hub copy (fleet task d6e499cd).
        services.AddSingleton(sp => new ViewPresetsService(sp.GetRequiredService<Logging.Logger>()));
        return services;
    }
}
