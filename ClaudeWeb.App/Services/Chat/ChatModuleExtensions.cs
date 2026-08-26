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
        services.AddSingleton<CliRunnerService>();
        services.AddSingleton<RunSessionService>();
        services.AddSingleton<SessionService>();
        // Claude-in-Chrome: global browser single-holder gate + host readiness
        // checks (openspec claude-in-chrome). Singleton because the gate IS the
        // cross-repo serialization.
        services.AddSingleton<ChromeGateService>();
        return services;
    }
}
