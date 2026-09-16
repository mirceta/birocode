using ClaudeWeb.Services.Arch;
using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// The policeman module (openspec kanban-policeman-conversation and its follow-ups). Three parts,
/// one per concern, each readable on its own:
///   • <see cref="PolicemanLifecycle"/> — deterministic: the conversation's states and what moves
///     them (hooked into the arch's turn lifecycle as an <see cref="IArchConversationHook"/>);
///   • <see cref="PolicemanTools"/> — deterministic: what each tool does when the model calls it;
///   • <see cref="PolicemanPrompt"/> — the prompt-driven half: the steps the model follows.
/// Plus two pure rule sets, <see cref="PolicemanToolPolicy"/> (the fences) and
/// <see cref="PolicemanLifecycleRules"/>, and <see cref="PolicemanIdentity"/> (who it is).
/// </summary>
public static class PolicemanModuleExtensions
{
    public static IServiceCollection AddPolicemanModule(this IServiceCollection services)
    {
        services.AddSingleton<PolicemanLifecycle>();
        services.AddSingleton<IArchConversationHook>(sp => sp.GetRequiredService<PolicemanLifecycle>());
        services.AddSingleton<PolicemanTools>();
        return services;
    }
}
