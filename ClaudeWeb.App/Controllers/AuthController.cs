using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.IpFilter;
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
    private readonly DeviceTokenService _devices;
    private readonly IpAllowlistService _ipAllowlist;
    private readonly Logger _logger;

    public AuthController(AuthService auth, DeviceTokenService devices, IpAllowlistService ipAllowlist, Logger logger)
    {
        _auth = auth;
        _devices = devices;
        _ipAllowlist = ipAllowlist;
        _logger = logger;
    }

    public record LoginRequest(string? Password);

    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        _logger.CountRequest();
        var client = ClientIp.Get(HttpContext);

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
        Response.Cookies.Append(CookieName, token, CookieOptions(HttpContext, AuthService.SessionLifetime));

        // Mint a trusted-device cookie on first approved entry (openspec add-resilient-auth).
        // Guard (task 2.2): only when this request is on an approved IP — never for a request
        // the IP gate admitted purely via an existing cookie or rejected — and only once per
        // device. Tag it with the approved-IP guest's name so the Operator can identify it.
        if (_ipAllowlist.IsApproved(client) &&
            !_devices.IsValid(Request.Cookies[DeviceTokenService.CookieName]))
        {
            var name = _ipAllowlist.GuestName(client) ?? client;
            var deviceToken = _devices.Issue(name);
            Response.Cookies.Append(DeviceTokenService.CookieName, deviceToken, CookieOptions(HttpContext, _devices.Lifetime));
        }

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
        Response.Cookies.Delete(CookieName, CookieOptions(HttpContext, AuthService.SessionLifetime));
        // Logout ends the session only; the trusted-device cookie (IP-gate bypass) is
        // deliberately left in place — revoke it from the desktop "Trusted devices" list.
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

    private static CookieOptions CookieOptions(HttpContext context, TimeSpan maxAge) => new()
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Strict,
        Secure = IsHttps(context),
        Path = "/",
        MaxAge = maxAge,
    };

    private static bool IsHttps(HttpContext context) =>
        context.Request.IsHttps ||
        string.Equals(context.Request.Headers["X-Forwarded-Proto"].FirstOrDefault(), "https", StringComparison.OrdinalIgnoreCase);
}
