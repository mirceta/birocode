using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Events;

/// <summary>
/// DI registration for the per-repo event-log module (openspec change
/// agent-dock-event-console). The orchestrator wires the matching
/// <c>builder.Services.AddEventsModule()</c> line in EmbeddedApi.cs — this module
/// never edits that shared file. See plans/INTEGRATION.md.
/// </summary>
public static class EventsModuleExtensions
{
    public static IServiceCollection AddEventsModule(this IServiceCollection services)
    {
        // Singleton: one in-memory per-repo ring shared across all requests and
        // background jobs that emit into it (discovery now, autopilot/loops later).
        services.AddSingleton<RepoEventLog>();
        return services;
    }
}
