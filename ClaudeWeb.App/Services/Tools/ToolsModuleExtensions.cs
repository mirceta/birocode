using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Tools;

/// <summary>
/// Registers the per-repo MCP tool registry (openspec add-dock-tools-lane).
/// See plans/INTEGRATION.md.
/// </summary>
public static class ToolsModuleExtensions
{
    public static IServiceCollection AddToolsModule(this IServiceCollection services)
    {
        services.AddSingleton<ToolsConfigStore>();
        return services;
    }
}
