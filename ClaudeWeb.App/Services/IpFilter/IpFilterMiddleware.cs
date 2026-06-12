using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.IpFilter;

/// <summary>
/// The IP allowlist gate (plans/auth-ip-filter.md). FIRST middleware in the
/// pipeline — before static files, routing, and password auth — so an
/// unapproved IP never receives the SPA shell or the login screen, only a
/// minimal standalone rejection page with its own IP. No exemptions, not
/// even /api/health: one flow for everybody, localhost included (127.0.0.1
/// is a seeded, removable guest, not a code branch).
///
/// On the allowed path it records last-access and tracks the in-flight
/// request in the connection registry so allowlist removal aborts it
/// immediately.
/// </summary>
public class IpFilterMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IpAllowlistService _allowlist;
    private readonly IpConnectionRegistry _connections;
    private readonly Logger _logger;

    public IpFilterMiddleware(RequestDelegate next, IpAllowlistService allowlist,
        IpConnectionRegistry connections, Logger logger)
    {
        _next = next;
        _allowlist = allowlist;
        _connections = connections;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var ip = ClientIp.Get(context);

        if (!_allowlist.IsApproved(ip))
        {
            _allowlist.RecordAttempt(ip);
            _logger.Error($"[IPFILTER] Rejected {ip} — not on the allowlist ({context.Request.Method} {context.Request.Path})");
            await RejectAsync(context, ip);
            return;
        }

        _allowlist.RecordAccess(ip);
        using (_connections.Track(ip, context))
        {
            await _next(context);
        }
    }

    private static async Task RejectAsync(HttpContext context, string ip)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;

        // API/tooling callers get JSON; browsers get a tiny standalone page
        // (the SPA is deliberately never served to unapproved IPs).
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            await context.Response.WriteAsJsonAsync(new
            {
                error = $"Your IP ({ip}) is not on the approved list of guests to this site. Ask the administrator to add you.",
                ip,
            });
            return;
        }

        context.Response.ContentType = "text/html; charset=utf-8";
        var safeIp = System.Net.WebUtility.HtmlEncode(ip);
        await context.Response.WriteAsync($@"<!doctype html>
<html lang=""en"">
<head><meta charset=""utf-8""><meta name=""viewport"" content=""width=device-width, initial-scale=1"">
<title>Not on the guest list</title>
<style>
  body {{ font-family: system-ui, sans-serif; background: #1e1e1e; color: #ddd;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }}
  .card {{ max-width: 28rem; text-align: center; }}
  .ip {{ font-family: monospace; color: #e8a33d; }}
</style></head>
<body><div class=""card"">
  <h1>Not on the guest list</h1>
  <p>Your IP (<span class=""ip"">{safeIp}</span>) is not on the approved list of
  guests to this site. Ask the administrator to add you.</p>
</div></body></html>");
    }
}
