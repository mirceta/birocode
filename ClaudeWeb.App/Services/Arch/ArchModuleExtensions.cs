using ClaudeWeb.Services.Autopilot;
using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Arch;

/// <summary>DI wiring for the arch agent (openspec: add-arch-agent). The loop
/// kind registers as one more <see cref="ILoop"/>, so the autopilot engine
/// dispatches to it by kind exactly like the repo-bound kinds; the service is
/// the tools' implementation and the availability rule; the MCP server is the
/// JSON-RPC face the arch session talks to.</summary>
public static class ArchModuleExtensions
{
    public static IServiceCollection AddArchModule(this IServiceCollection services)
    {
        services.AddSingleton<ArchStateStore>();
        services.AddSingleton<FleetClient>();
        services.AddSingleton<ArchAgentService>();
        services.AddSingleton<IArchWakeSource>(sp => sp.GetRequiredService<ArchAgentService>());
        services.AddSingleton<ILoop, ArchLoop>();
        services.AddSingleton<ArchMcpServer>();
        return services;
    }
}
