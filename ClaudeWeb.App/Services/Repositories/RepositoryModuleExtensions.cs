using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Repositories;

/// <summary>
/// DI registration for the repository module (follows the M1/M2/M3 convention:
/// each module ships its own AddXModule extension, wired from EmbeddedApi).
/// Registers the operator-managed registry (singleton, shared with the WinForms
/// UI), the per-request resolver, and the HttpContext accessor it needs.
/// </summary>
public static class RepositoryModuleExtensions
{
    public static IServiceCollection AddRepositoryModule(this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
        services.AddScoped<RepositoryResolver>();
        // RepositoryRegistry is registered as a pre-built singleton in EmbeddedApi
        // so the WinForms MainForm shares the same instance.
        return services;
    }
}
