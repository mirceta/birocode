using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.IpFilter;

/// <summary>
/// The IP allowlist gate (plans/auth-ip-filter.md). FIRST middleware in the
/// pipeline — before static files, routing, and password auth — so an
/// unapproved IP never receives the SPA shell or the login screen, only a
/// minimal standalone rejection page with its own IP. One flow for everybody,
/// localhost included (127.0.0.1 is a seeded, removable guest, not a code
/// branch). A request is admitted by exactly one of three credentials, in
/// this order: an allowlist entry, a configured LAN range (openspec
/// lan-bypass-ip-gate — resolved IP only, fails closed behind a proxy that
/// forgot to forward), or a trusted-device cookie. The single path-based
/// exception is the shared-ideas hub contract path (openspec
/// ideas-harness-hub), whose embedded 256-bit token is the credential and
/// whose callers are remote harnesses at IPs the Operator never sees.
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
    private readonly DeviceTokenService _devices;
    private readonly Logger _logger;

    public IpFilterMiddleware(RequestDelegate next, IpAllowlistService allowlist,
        IpConnectionRegistry connections, DeviceTokenService devices, Logger logger)
    {
        _next = next;
        _allowlist = allowlist;
        _connections = connections;
        _devices = devices;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var origin = ClientIp.GetOrigin(context);
        var ip = origin.Ip;

        if (_allowlist.IsApproved(ip))
        {
            _allowlist.RecordAccess(ip);
            await PassAsync(context, ip);
            return;
        }

        // Not a guest — admit anyway when the RESOLVED IP sits in a configured
        // LAN range (openspec lan-bypass-ip-gate). Checked before the device
        // cookie so a LAN request never slides a token it does not need; never
        // touches the allowlist (no access record, no attempt). LanBypass.Match
        // refuses a trusted-proxy peer that sent no X-Forwarded-For, so a proxy
        // that stops forwarding cannot turn the whole internet into "LAN".
        var lan = LanBypass.Match(origin);
        if (lan != null)
        {
            _logger.Info($"[IPFILTER] Admitted {ip} via LAN bypass {lan}");
            await PassAsync(context, ip);
            return;
        }

        // Not on the allowlist — admit anyway if the request carries a valid
        // trusted-device cookie (openspec add-resilient-auth). This is the
        // 4G-rescue case: an already-approved device whose IP rotated. Sliding
        // the token also records the new source IP on the device, so the
        // Operator can see a friend's addresses in the "Trusted devices" list.
        var deviceName = _devices.ValidateAndSlide(context.Request.Cookies[DeviceTokenService.CookieName], ip);
        if (deviceName != null)
        {
            _logger.Info($"[IPFILTER] Admitted {ip} via trusted-device cookie (\"{deviceName}\")");
            await PassAsync(context, ip);
            return;
        }

        // Shared ideas hub (openspec ideas-harness-hub): served to ANY IP — the
        // 256-bit token in the path is the credential (checked constant-time in
        // NotesController; wrong token gets only an error envelope), and remote
        // harnesses sync from addresses the Operator never sees. The single
        // path-based exception. Segment matching keeps /api/notes/hub-info
        // gated. No connection tracking: registry aborts are keyed to allowlist
        // removal, which cannot apply here.
        if ((HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsPost(context.Request.Method)) &&
            context.Request.Path.StartsWithSegments("/api/notes/hub", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        // Otherwise: the same hard 403 + standalone rejection page as before.
        _allowlist.RecordAttempt(ip);
        _logger.Error($"[IPFILTER] Rejected {ip} — not on the allowlist, not in a LAN range, no device cookie ({context.Request.Method} {context.Request.Path})");
        await RejectAsync(context, ip);
    }

    private async Task PassAsync(HttpContext context, string ip)
    {
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
