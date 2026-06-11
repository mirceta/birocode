using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Auth;

/// <summary>Registers the session-auth module (plans/auth-login.md).</summary>
public static class AuthModuleExtensions
{
    public static IServiceCollection AddAuthModule(this IServiceCollection services)
    {
        services.AddSingleton<AuthService>();
        return services;
    }
}
