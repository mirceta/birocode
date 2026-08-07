using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Dock;

public static class DockModuleExtensions
{
    public static IServiceCollection AddDockModule(this IServiceCollection services)
    {
        services.AddSingleton<DockRegistry>();
        // Unseen-result latch at turn end (openspec dock-busy-indicator,
        // unseen-result amendment): subscribes to RunSessionService.RunCompleted
        // at startup, so the dependency direction stays dock -> chat.
        services.AddHostedService<DockUnseenResultTrigger>();
        return services;
    }
}
