using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Settings;

public static class SettingsModuleExtensions
{
    public static IServiceCollection AddSettingsModule(this IServiceCollection services)
    {
        services.AddSingleton<UiSettingsService>();
        return services;
    }
}
