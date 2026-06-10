using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Screen;

/// <summary>
/// DI registration for the Screen tab module (plans/screen-tab.md).
/// Wired in EmbeddedApi.cs like the other modules; see plans/INTEGRATION.md.
/// </summary>
public static class ScreenModuleExtensions
{
    public static IServiceCollection AddScreenModule(this IServiceCollection services)
    {
        services.AddSingleton<ScreenService>();
        return services;
    }
}
