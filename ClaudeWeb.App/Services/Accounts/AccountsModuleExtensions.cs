using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Accounts;

/// <summary>DI wiring for the dashboard account-status chips
/// (openspec add-account-status): two read-only identity probes — the global
/// GitHub account (<c>gh</c>) and the Claude subscription login. Registered via
/// <c>builder.Services.AddAccountsModule();</c> in EmbeddedApi.cs.</summary>
public static class AccountsModuleExtensions
{
    public static IServiceCollection AddAccountsModule(this IServiceCollection services)
    {
        services.AddSingleton<GitHubAccountService>();
        services.AddSingleton<ClaudeAccountService>();
        return services;
    }
}
