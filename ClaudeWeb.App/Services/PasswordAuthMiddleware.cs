using ClaudeWeb.Models;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services;

/// <summary>
/// Lightweight shared-password gate for /api/* routes. The password is
/// supplied either via the "X-Auth-Password" header or the "?pw=" query
/// parameter and compared against <see cref="AppConfig.AuthPassword"/>.
///
/// Exemptions (no password required):
///   - GET /api/health      (so health checks and probes work)
///   - any non-/api/* route (the React app shell + static assets)
///
/// A missing/wrong password on a protected /api/* route returns 401.
/// This is intentionally a single shared password, not a user system.
/// </summary>
public class PasswordAuthMiddleware
{
    private const string HeaderName = "X-Auth-Password";
    private const string QueryName = "pw";

    private readonly RequestDelegate _next;
    private readonly AppConfig _config;
    private readonly Logger _logger;

    public PasswordAuthMiddleware(RequestDelegate next, AppConfig config, Logger logger)
    {
        _next = next;
        _config = config;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!RequiresAuth(context))
        {
            await _next(context);
            return;
        }

        if (IsAuthorized(context))
        {
            await _next(context);
            return;
        }

        _logger.Error($"[AUTH] 401 rejected {context.Request.Method} {context.Request.Path}");
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Unauthorized: missing or invalid password" });
    }

    private static bool RequiresAuth(HttpContext context)
    {
        var path = context.Request.Path;

        // Only /api/* is protected; everything else is the app shell / static files.
        if (!path.StartsWithSegments("/api"))
            return false;

        // Health check is always open.
        if (HttpMethods.IsGet(context.Request.Method) &&
            path.Equals("/api/health", StringComparison.OrdinalIgnoreCase))
            return false;

        return true;
    }

    private bool IsAuthorized(HttpContext context)
    {
        var supplied = context.Request.Headers[HeaderName].FirstOrDefault()
                       ?? context.Request.Query[QueryName].FirstOrDefault();

        return !string.IsNullOrEmpty(supplied) &&
               string.Equals(supplied, _config.AuthPassword, StringComparison.Ordinal);
    }
}
