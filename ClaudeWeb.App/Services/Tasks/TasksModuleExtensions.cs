using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Tasks;

/// <summary>DI wiring for the Tasks agent (openspec: tasks-agent): the state store,
/// the tool layer, the agent (home + send + token) and the MCP face.</summary>
public static class TasksModuleExtensions
{
    public static IServiceCollection AddTasksModule(this IServiceCollection services)
    {
        services.AddSingleton<TasksStateStore>();
        services.AddSingleton<TasksToolbox>();
        services.AddSingleton<TasksAgentService>();
        services.AddSingleton<TasksMcpServer>();
        return services;
    }
}
