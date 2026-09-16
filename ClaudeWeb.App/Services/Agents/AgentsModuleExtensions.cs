using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Agents;

/// <summary>
/// Registers the repo-agent tool server (openspec cross-repo-effort-legs): the toolbox, the
/// MCP server and the hosted service that hands every repo agent's turn the
/// <c>claude-web</c> MCP entry. See plans/INTEGRATION.md.
/// </summary>
public static class AgentsModuleExtensions
{
    public static IServiceCollection AddAgentsModule(this IServiceCollection services)
    {
        services.AddSingleton<RepoAgentToolsService>();
        services.AddHostedService(sp => sp.GetRequiredService<RepoAgentToolsService>());
        services.AddSingleton(sp => sp.GetRequiredService<RepoAgentToolsService>().Toolbox);
        services.AddSingleton<RepoAgentMcpServer>();
        return services;
    }
}
