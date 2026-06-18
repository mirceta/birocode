using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.TaskGraph;

/// <summary>DI wiring for the task dependency graph (plans/task-dependency-graph.md).</summary>
public static class TaskGraphModuleExtensions
{
    public static IServiceCollection AddTaskGraphModule(this IServiceCollection services)
    {
        services.AddSingleton<TaskGraphService>();
        return services;
    }
}
