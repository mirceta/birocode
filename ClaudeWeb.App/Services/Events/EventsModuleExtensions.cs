using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Events;

/// <summary>
/// DI registration for the event modules. Covers both the per-repo event-log
/// (openspec change agent-dock-event-console) and the harness-wide event feed
/// (openspec change add-harness-event-feed). The orchestrator wires the matching
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
        // Singleton: one in-memory harness-wide feed shared across all requests
        // and the chat runner that publishes turn.ended into it.
        services.AddSingleton<HarnessEventFeed>();
        // Harness-provided pilot consumer app (synthetic kind:harness local app),
        // served internally like the Understanding/Lab apps.
        services.AddSingleton<EventsApp>();
        return services;
    }
}
