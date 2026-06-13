using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Deploy;

/// <summary>DI wiring for the Deployments tab (plans/deployments-tab.md).</summary>
public static class DeployModuleExtensions
{
    public static IServiceCollection AddDeployModule(this IServiceCollection services)
    {
        services.AddSingleton<DeployService>();
        return services;
    }
}
