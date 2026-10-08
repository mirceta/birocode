using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Remote;

/// <summary>
/// DI registration for sofa mode (openspec sofa-mode): the remote command channel the phone
/// posts to and the big screen reads, the screens' heartbeats, and the pairing PIN. The
/// orchestrator wires <c>builder.Services.AddRemoteModule()</c> in EmbeddedApi.cs — this module
/// never edits that shared file (plans/INTEGRATION.md).
/// </summary>
public static class RemoteModuleExtensions
{
    public static IServiceCollection AddRemoteModule(this IServiceCollection services)
    {
        // Singletons: one in-memory ring + screen table per harness; one outstanding PIN.
        services.AddSingleton<RemoteCommandStore>();
        services.AddSingleton<RemotePairing>();
        return services;
    }
}
