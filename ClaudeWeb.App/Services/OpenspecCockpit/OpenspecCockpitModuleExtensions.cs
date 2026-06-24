using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.OpenspecCockpit;

/// <summary>
/// DI registration for the harness OpenSpec Cockpit module (openspec change
/// openspec-cockpit-in-harness). The orchestrator un-comments the matching
/// <c>builder.Services.AddOpenspecCockpitModule()</c> line in EmbeddedApi.cs —
/// this module never edits that shared file. See plans/INTEGRATION.md.
/// </summary>
public static class OpenspecCockpitModuleExtensions
{
    public static IServiceCollection AddOpenspecCockpitModule(this IServiceCollection services)
    {
        // Stateless; the working directory is supplied per-call by the controller.
        services.AddSingleton<OpenspecCockpitService>();
        return services;
    }
}
