using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// DI registration for the M1 chat module. The orchestrator un-comments the
/// matching <c>builder.Services.AddChatModule()</c> line in EmbeddedApi.cs --
/// this module never edits that shared file. See plans/INTEGRATION.md.
/// </summary>
public static class ChatModuleExtensions
{
    public static IServiceCollection AddChatModule(this IServiceCollection services)
    {
        // Singletons: RunSessionService owns detached runs and the per-repo
        // single-flight gate, so it must be shared across all requests.
        // Provider adapters (openspec provider-agnostic-runner): claude is the
        // default; the registry resolves per-turn.
        services.AddSingleton<IAgentCliAdapter, ClaudeCliAdapter>();
        services.AddSingleton<IAgentCliAdapter, CodexCliAdapter>();
        services.AddSingleton<AgentProviderRegistry>();
        services.AddSingleton<CliRunnerService>();
        services.AddSingleton<RunSessionService>();
        services.AddSingleton<SessionService>();
        // Each repo agent's MAIN conversation, explicit (openspec repo-agent-subagents), and the tracker
        // that keeps it on the main thread's forks.
        services.AddSingleton<MainConversationStore>(sp => new MainConversationStore(sp.GetRequiredService<ClaudeWeb.Services.Logging.Logger>()));
        services.AddSingleton<MainConversationTracker>();
        services.AddHostedService(sp => sp.GetRequiredService<MainConversationTracker>());
        services.AddSingleton<AgentHelperRunner>();
        // Claude-in-Chrome: global browser single-holder gate + host readiness
        // checks (openspec claude-in-chrome). Singleton because the gate IS the
        // cross-repo serialization.
        services.AddSingleton<ChromeGateService>();
        services.AddSingleton<ChromePreflightService>(); // "is this machine ready for Claude for Chrome" (openspec chrome-readiness-preflight)
        return services;
    }
}
