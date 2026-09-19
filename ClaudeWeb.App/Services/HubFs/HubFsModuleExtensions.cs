using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.HubFs;

/// <summary>DI wiring for the hub file system (openspec hub-file-system): one sandboxed
/// store per harness under its data dir. The repo-agent tool server, the arch agent, the
/// peer API and the Operator's File System tab all read and write this one instance.
/// See plans/INTEGRATION.md for the module convention.</summary>
public static class HubFsModuleExtensions
{
    public static IServiceCollection AddHubFsModule(this IServiceCollection services)
    {
        services.AddSingleton<HubFileStore>();
        return services;
    }
}
