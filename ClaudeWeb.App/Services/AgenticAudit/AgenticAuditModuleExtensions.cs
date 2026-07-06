using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.AgenticAudit;

/// <summary>DI wiring for the agentic-call audit trail (openspec change
/// add-agent-audit-trail). One singleton store; the job registries append to it
/// and the read-only controller lists from it.</summary>
public static class AgenticAuditModuleExtensions
{
    public static IServiceCollection AddAgenticAuditModule(this IServiceCollection services)
    {
        services.AddSingleton<AgenticAuditLog>();
        return services;
    }
}
