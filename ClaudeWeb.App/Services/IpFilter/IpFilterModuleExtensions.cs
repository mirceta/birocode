using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.IpFilter;

/// <summary>Registers the IP allowlist module (plans/auth-ip-filter.md).
/// The IpAllowlistService itself is pre-built in Program.cs (shared with the
/// WinForms GUI) and registered as an existing instance in EmbeddedApi.</summary>
public static class IpFilterModuleExtensions
{
    public static IServiceCollection AddIpFilterModule(this IServiceCollection services)
    {
        services.AddSingleton<IpConnectionRegistry>();
        services.AddSingleton<IpInfoService>(); // IP enrichment (plans/ip-intel.md)
        return services;
    }
}
