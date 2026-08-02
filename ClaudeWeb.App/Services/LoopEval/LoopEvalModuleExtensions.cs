using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.LoopEval;

/// <summary>
/// DI wiring for the loop-eval UI runner (openspec: add-loop-eval-ui-runner),
/// per the plans/INTEGRATION.md module convention. Singleton: it owns the
/// at-most-one active run and its process handle, and its construction runs the
/// stale-session sweep exactly once per boot.
/// </summary>
public static class LoopEvalModuleExtensions
{
    public static IServiceCollection AddLoopEvalModule(this IServiceCollection services)
    {
        services.AddSingleton<LoopEvalRunnerService>();
        return services;
    }
}
