using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// DI registration for the "Ask for understanding" module (openspec change
/// add-ask-for-understanding) and its twin, the Goal app (openspec goal-app). The
/// orchestrator wires the matching <c>builder.Services.AddUnderstandingModule()</c>
/// line in EmbeddedApi.cs, alongside the StructuredAsk module — this module never
/// edits that shared file. See plans/INTEGRATION.md.
/// </summary>
public static class UnderstandingModuleExtensions
{
    public static IServiceCollection AddUnderstandingModule(this IServiceCollection services)
    {
        // Stateless asks own their prompt + the shared run; safe as singletons. Both
        // are also exposed as IConversationAppBuilder so the jobs registry maps them
        // by kind (AppBuildKind) instead of being copied per feature.
        services.AddSingleton<UnderstandingAsk>();
        services.AddSingleton<GoalAsk>();
        services.AddSingleton<IConversationAppBuilder>(sp => sp.GetRequiredService<UnderstandingAsk>());
        services.AddSingleton<IConversationAppBuilder>(sp => sp.GetRequiredService<GoalAsk>());
        // Backend-owned per-(kind, repo) job registry: singleton so one run survives
        // client disconnects and the dock can reattach to it on load (latest-only).
        services.AddSingleton<UnderstandingJobs>();
        // Auto-trigger at turn end (openspec auto-understanding-after-turn), one
        // subscription for both flags: subscribes to RunSessionService.RunCompleted
        // at startup, so the dependency direction stays understanding -> chat.
        services.AddHostedService<AutoUnderstandingTrigger>();
        return services;
    }
}
