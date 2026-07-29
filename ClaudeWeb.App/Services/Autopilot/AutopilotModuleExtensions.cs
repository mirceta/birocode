using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>DI wiring for loop-autopilot (plans/loop-autopilot.md). Slice 1 = the
/// read-only discovery service; Slice 2 adds the config store, the stub brain, and
/// the polling engine (registered both as a singleton — so the controller can read
/// its live state — and as the hosted background service that runs the loop).
/// Revision 2 (openspec: unify-loop-types): each loop KIND is an <see cref="ILoop"/>
/// implementation registered here; the engine dispatches to them by kind. There is
/// no arming coordinator — the one-slot-per-agent <see cref="LoopConfigStore"/> IS
/// the exclusive-arming invariant.</summary>
public static class AutopilotModuleExtensions
{
    public static IServiceCollection AddAutopilotModule(this IServiceCollection services)
    {
        services.AddSingleton<AutopilotDiscoveryService>();
        services.AddSingleton<AutopilotConfigStore>();
        services.AddSingleton<LoopConfigStore>();
        services.AddSingleton<LoopRecipeStore>();
        services.AddSingleton<AutopilotAuditLog>();
        services.AddSingleton<PromptClassifier>();
        services.AddSingleton<CliPromptClassifier>();
        services.AddSingleton<ILoop, SuggestionLoop>();
        services.AddSingleton<ILoop, RecipeLoop>();
        services.AddSingleton<ILoop, GoalLoop>();
        services.AddSingleton<SystemTestsService>();
        services.AddSingleton<AutopilotService>();
        services.AddHostedService(sp => sp.GetRequiredService<AutopilotService>());
        return services;
    }
}
