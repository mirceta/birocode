using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// DI registration for the "Ask for understanding" module (openspec change
/// add-ask-for-understanding). The orchestrator wires the matching
/// <c>builder.Services.AddUnderstandingModule()</c> line in EmbeddedApi.cs,
/// alongside the StructuredAsk module — this module never edits that shared file.
/// See plans/INTEGRATION.md.
/// </summary>
public static class UnderstandingModuleExtensions
{
    public static IServiceCollection AddUnderstandingModule(this IServiceCollection services)
    {
        // Stateless ask owns the fork prompt + snapshot-resume call; safe as a singleton.
        services.AddSingleton<UnderstandingAsk>();
        // Backend-owned per-repo job registry: singleton so one run survives client
        // disconnects and the dock can reattach to it on load (latest-only per repo).
        services.AddSingleton<UnderstandingJobs>();
        // Auto-trigger at turn end (openspec auto-understanding-after-turn):
        // subscribes to RunSessionService.RunCompleted at startup, so the
        // dependency direction stays understanding -> chat.
        services.AddHostedService<AutoUnderstandingTrigger>();
        return services;
    }
}
