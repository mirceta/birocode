using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Traffic;

/// <summary>
/// DI registration for the traffic-monitor module (openspec change
/// traffic-monitor). One in-memory TrafficStats shared by the middleware
/// (writer) and TrafficController (reader). The orchestrator wires the
/// matching <c>builder.Services.AddTrafficModule()</c> line in EmbeddedApi.cs —
/// this module never edits that shared file. See plans/INTEGRATION.md.
/// </summary>
public static class TrafficModuleExtensions
{
    public static IServiceCollection AddTrafficModule(this IServiceCollection services)
    {
        services.AddSingleton<TrafficStats>();
        return services;
    }
}
