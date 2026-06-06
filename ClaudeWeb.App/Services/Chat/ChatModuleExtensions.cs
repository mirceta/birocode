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
        // Singletons: CliRunnerService enforces a single in-flight CLI process,
        // so its busy-gate must be shared across all requests.
        services.AddSingleton<CliRunnerService>();
        services.AddSingleton<SessionService>();
        return services;
    }
}
