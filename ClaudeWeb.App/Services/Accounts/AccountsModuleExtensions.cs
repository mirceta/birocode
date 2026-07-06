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
        // Plan-usage probe (openspec add-claude-usage): 5-hour window + weekly quota
        // via Anthropic's OAuth usage endpoint, cached for minutes.
        services.AddSingleton<ClaudeUsageService>();
        // Write-only credential control (openspec add-git-identity-surface): reuses
        // the GitHub probe to re-derive the account after establishing a token.
        services.AddSingleton<GitHubCredentialsService>();
        return services;
    }
}
