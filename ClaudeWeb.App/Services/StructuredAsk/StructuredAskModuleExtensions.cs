using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// DI registration for the structured-ask module (openspec change
/// discover-local-apps). The orchestrator un-comments the matching
/// <c>builder.Services.AddStructuredAskModule()</c> line in EmbeddedApi.cs --
/// this module never edits that shared file. See plans/INTEGRATION.md.
/// </summary>
public static class StructuredAskModuleExtensions
{
    public static IServiceCollection AddStructuredAskModule(this IServiceCollection services)
    {
        // Stateless; safe as singletons. The runner talks to the reused
        // ClaudeMonitor gateway; the ask owns the discovery prompt.
        services.AddSingleton<StructuredAskRunner>();
        services.AddSingleton<LocalAppDiscoveryAsk>();
        // Backend-owned per-repo discovery job registry (openspec change
        // discover-local-apps-resilient): singleton so one scan survives client
        // disconnects and the dock can reattach to it on load.
        services.AddSingleton<LocalAppDiscoveryJobs>();
        return services;
    }
}
