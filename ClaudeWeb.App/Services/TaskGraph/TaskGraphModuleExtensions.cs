using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.TaskGraph;

/// <summary>DI wiring for the task dependency graph (plans/task-dependency-graph.md)
/// and its lifecycle verifier (openspec kanban-lifecycle-columns).</summary>
public static class TaskGraphModuleExtensions
{
    public static IServiceCollection AddTaskGraphModule(this IServiceCollection services)
    {
        services.AddSingleton(sp =>
        {
            // notes: consume-on-promote / restore-on-delete (openspec ideas-consume-on-promotion).
            var graph = new TaskGraphService(sp.GetRequiredService<Logging.Logger>(), null, sp.GetRequiredService<Notes.NotesService>());
            var hours = sp.GetService<IConfiguration>()?.GetValue<int?>("TaskBoard:StaleHours") ?? TaskGraphService.DefaultStaleHours;
            if (hours > 0) graph.StaleAfterMs = hours * 3600_000L;
            return graph;
        });
        services.AddSingleton<ITaskFactsProbe, GitTaskFactsProbe>();
        services.AddHostedService<TaskVerificationPoller>();
        return services;
    }
}
