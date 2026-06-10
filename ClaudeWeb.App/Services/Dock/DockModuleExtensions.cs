using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Dock;

public static class DockModuleExtensions
{
    public static IServiceCollection AddDockModule(this IServiceCollection services)
    {
        services.AddSingleton<DockRegistry>();
        return services;
    }
}
