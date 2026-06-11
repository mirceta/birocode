using ClaudeWeb.Controllers;
using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Hosting;

/// <summary>
/// Auth gate for /api/* routes (plans/auth-login.md). A request is authorized
/// when it carries either:
///   - a valid session cookie ("claudeweb_session", issued by /api/auth/login), or
///   - the password in the "X-Auth-Password" header (kept for curl/Playwright
///     tooling; verified against the PBKDF2 hash, with the last good value
///     cached so tools don't pay the KDF cost per request).
///
/// The old "?pw=" query parameter is intentionally NOT accepted any more —
/// query strings leak into proxy logs.
///
/// Exemptions (no auth required):
///   - GET  /api/health      (health checks and probes)
///   - POST /api/auth/login  (you must be able to log in)
///   - GET  /api/auth/check  (drives the client's login gate)
///   - any non-/api/* route  (the React app shell + static assets)
///
/// Failed header auth counts toward the same per-IP brute-force throttle as
/// failed logins. Still a single shared password, not a user system.
/// </summary>
public class PasswordAuthMiddleware
{
    private const string HeaderName = "X-Auth-Password";

    private readonly RequestDelegate _next;
    private readonly AuthService _auth;
    private readonly Logger _logger;

    // Last password that verified successfully via the header path, tagged
    // with the password version it verified against. Lets tooling make many
    // calls without a 210k-iteration PBKDF2 per request, while a password
    // change invalidates the cache immediately.
    private volatile VerifiedHeader? _verifiedHeader;

    private sealed record VerifiedHeader(string Password, int Version);

    public PasswordAuthMiddleware(RequestDelegate next, AuthService auth, Logger logger)
    {
        _next = next;
        _auth = auth;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!RequiresAuth(context) || IsAuthorized(context))
        {
            await _next(context);
            return;
        }

        if (_auth.BlockedFor(AuthController.ClientKey(context)) is { } wait)
        {
            context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            await context.Response.WriteAsJsonAsync(new { error = "Too many attempts", retryAfterSeconds = (int)Math.Ceiling(wait.TotalSeconds) });
            return;
        }

        _logger.Error($"[AUTH] 401 rejected {context.Request.Method} {context.Request.Path}");
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Unauthorized: log in or supply a valid X-Auth-Password header" });
    }

    private static bool RequiresAuth(HttpContext context)
    {
        var path = context.Request.Path;

        // Only /api/* is protected; everything else is the app shell / static files.
        if (!path.StartsWithSegments("/api"))
            return false;

        var isGet = HttpMethods.IsGet(context.Request.Method);
        if (isGet && path.Equals("/api/health", StringComparison.OrdinalIgnoreCase))
            return false;
        if (isGet && path.Equals("/api/auth/check", StringComparison.OrdinalIgnoreCase))
            return false;
        if (HttpMethods.IsPost(context.Request.Method) &&
            path.Equals("/api/auth/login", StringComparison.OrdinalIgnoreCase))
            return false;

        return true;
    }

    private bool IsAuthorized(HttpContext context)
    {
        // 1. Session cookie (the browser path).
        if (_auth.ValidateSession(context.Request.Cookies[AuthController.CookieName]))
            return true;

        // 2. X-Auth-Password header (the tooling path).
        var supplied = context.Request.Headers[HeaderName].FirstOrDefault();
        if (string.IsNullOrEmpty(supplied))
            return false;

        var version = _auth.PasswordVersion;
        var cached = _verifiedHeader;
        if (cached != null && cached.Version == version && FixedTimeEquals(supplied, cached.Password))
            return true;

        var client = AuthController.ClientKey(context);
        if (_auth.BlockedFor(client) is not null)
            return false; // locked out — don't even run the KDF

        if (_auth.VerifyPassword(supplied))
        {
            _verifiedHeader = new VerifiedHeader(supplied, version);
            _auth.RecordSuccess(client);
            return true;
        }

        _auth.RecordFailure(client);
        return false;
    }

    private static bool FixedTimeEquals(string a, string b)
    {
        var ba = System.Text.Encoding.UTF8.GetBytes(a);
        var bb = System.Text.Encoding.UTF8.GetBytes(b);
        return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(ba, bb);
    }
}
