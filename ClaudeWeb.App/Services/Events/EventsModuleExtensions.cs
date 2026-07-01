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

        // The event-feed COLLECTOR (openspec change add-event-feed-collector): a
        // backend-owned aggregator over many harness sources. Data Protection encrypts
        // each remote source's credential at rest; the hosted poller pulls active
        // sources on a background loop so listening survives a frontend reload/restart.
        services.AddDataProtection();
        services.AddSingleton<HostEventSound>();
        services.AddSingleton<CollectorService>();
        services.AddHostedService<CollectorPoller>();
        return services;
    }
}
