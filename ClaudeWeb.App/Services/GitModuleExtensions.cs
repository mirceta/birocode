using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services;

/// <summary>
/// DI registration for the M3 Git API module. The orchestrator un-comments
/// <c>builder.Services.AddGitModule();</c> in EmbeddedApi.cs between phases.
/// See claude-web/plans/INTEGRATION.md.
/// </summary>
public static class GitModuleExtensions
{
    public static IServiceCollection AddGitModule(this IServiceCollection services)
    {
        services.AddSingleton<GitService>();
        return services;
    }
}
