using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Terminal;

public static class TerminalModuleExtensions
{
    public static IServiceCollection AddTerminalModule(this IServiceCollection services)
    {
        services.AddSingleton<TerminalSessionService>();
        return services;
    }
}
