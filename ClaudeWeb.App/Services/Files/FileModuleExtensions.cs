using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Files;

/// <summary>
/// DI registration for the M2 File API module. The orchestrator un-comments
/// <c>builder.Services.AddFileModule();</c> in EmbeddedApi.cs between phases.
/// See claude-web/plans/INTEGRATION.md.
/// </summary>
public static class FileModuleExtensions
{
    public static IServiceCollection AddFileModule(this IServiceCollection services)
    {
        services.AddSingleton<FileService>();
        return services;
    }
}
