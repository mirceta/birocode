using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Session login endpoints (plans/auth-login.md):
///
///   POST /api/auth/login    -- { password } -> session cookie       (exempt)
///   GET  /api/auth/check    -- { authenticated }                    (exempt)
///   POST /api/auth/logout   -- revokes the cookie session           (authed)
///   POST /api/auth/password -- { current, next } rotates password   (authed)
///
/// The session token travels in an HttpOnly SameSite=Strict cookie; JS never
/// sees it. `Secure` is set when the original request came over HTTPS
/// (directly or via the reverse proxy's X-Forwarded-Proto).
/// </summary>
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    public const string CookieName = "claudeweb_session";

    private readonly AuthService _auth;
    private readonly Logger _logger;

    public AuthController(AuthService auth, Logger logger)
    {
        _auth = auth;
        _logger = logger;
    }

    public record LoginRequest(string? Password);

    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        _logger.CountRequest();
        var client = ClientKey(HttpContext);

        if (_auth.BlockedFor(client) is { } wait)
            return StatusCode(429, new { error = "Too many attempts", retryAfterSeconds = (int)Math.Ceiling(wait.TotalSeconds) });

        if (!_auth.VerifyPassword(request?.Password))
        {
            _auth.RecordFailure(client);
            _logger.Error($"[AUTH] Failed login from {client}");
            return Unauthorized(new { error = "Wrong password" });
        }

        _auth.RecordSuccess(client);
        var token = _auth.CreateSession();
        Response.Cookies.Append(CookieName, token, CookieOptions(HttpContext));
        _logger.Info($"[AUTH] Login from {client}");
        return Ok(new { ok = true });
    }

    [HttpGet("check")]
    public IActionResult Check()
    {
        var authenticated = _auth.ValidateSession(Request.Cookies[CookieName]);
        return Ok(new { authenticated });
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        _logger.CountRequest();
        _auth.RevokeSession(Request.Cookies[CookieName]);
        Response.Cookies.Delete(CookieName, CookieOptions(HttpContext));
        return Ok(new { ok = true });
    }

    public record ChangePasswordRequest(string? Current, string? Next);

    [HttpPost("password")]
    public IActionResult ChangePassword([FromBody] ChangePasswordRequest request)
    {
        _logger.CountRequest();
        var error = _auth.ChangePassword(request?.Current, request?.Next, Request.Cookies[CookieName]);
        if (error != null) return BadRequest(new { error });
        return Ok(new { ok = true });
    }

    /// <summary>Client identity for throttling: first X-Forwarded-For hop, else the socket address.</summary>
    public static string ClientKey(HttpContext context)
    {
        var fwd = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(fwd))
            return fwd.Split(',')[0].Trim();
        return context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    private static CookieOptions CookieOptions(HttpContext context) => new()
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Strict,
        Secure = IsHttps(context),
        Path = "/",
        MaxAge = AuthService.SessionLifetime,
    };

    private static bool IsHttps(HttpContext context) =>
        context.Request.IsHttps ||
        string.Equals(context.Request.Headers["X-Forwarded-Proto"].FirstOrDefault(), "https", StringComparison.OrdinalIgnoreCase);
}
