using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.LoopEvals;

/// <summary>
/// Loop-evals curation module: read-only queries over stored conversations and a
/// repo copy's history, plus the golden-example bundle exporter. Backend for the
/// Operator-facing curation UI (loop-evals OpenSpec change, tasks §4).
/// </summary>
public static class LoopEvalsModuleExtensions
{
    public static IServiceCollection AddLoopEvalsModule(this IServiceCollection services)
    {
        services.AddSingleton<CurationService>();
        services.AddSingleton<BundleExporter>();
        return services;
    }
}
