using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Auth;

/// <summary>Registers the session-auth module (plans/auth-login.md).</summary>
public static class AuthModuleExtensions
{
    public static IServiceCollection AddAuthModule(this IServiceCollection services, AuthService auth)
    {
        // Pre-built in Program.cs so the WinForms desktop (which can SET the access code) and the
        // web API share one instance (openspec add-desktop-access-code).
        services.AddSingleton(auth);
        return services;
    }
}
