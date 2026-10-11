using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;

namespace ClaudeWeb.Services.FleetProxy;

/// <summary>
/// The proxy computer's door (openspec fleet-proxy), on the harness's own port. Runs OUTERMOST
/// (before the IP gate and the password gate — it has its own, stricter checks):
/// <list type="bullet">
/// <item><c>GET /proxy.pac</c> — the setup script, for either role (nothing secret in it).</item>
/// <item>A proxy request (absolute-form <c>GET http://192.168.0.42:5099/…</c>, what a browser sends to
/// a proxy) — forwarded ONLY when this harness is a proxy computer, the request arrived on its
/// home-side address, the caller is an allowed client (the TCP peer, never X-Forwarded-For), and
/// the target is an IPv4 literal in the business range. Everything else: 403, recorded.</item>
/// </list>
/// The answer streams through unbuffered, so the harness's live chat updates keep flowing.
/// </summary>
public sealed class FleetProxyMiddleware
{
    private static readonly HashSet<string> HopByHop = new(StringComparer.OrdinalIgnoreCase)
    {
        "Connection", "Keep-Alive", "Proxy-Connection", "Proxy-Authorization", "Proxy-Authenticate",
        "TE", "Trailer", "Transfer-Encoding", "Upgrade", "Host",
    };

    private readonly RequestDelegate _next;
    private readonly FleetProxyService _svc;
    private readonly HttpClient _http;

    public FleetProxyMiddleware(RequestDelegate next, FleetProxyService svc, IHttpClientFactory factory)
    {
        _next = next;
        _svc = svc;
        _http = factory.CreateClient(FleetProxyModuleExtensions.HttpClientName);
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        var raw = ctx.Features.Get<IHttpRequestFeature>()?.RawTarget ?? "";
        var isProxyRequest = raw.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || raw.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                             || HttpMethods.IsConnect(ctx.Request.Method);
        if (!isProxyRequest)
        {
            if (HttpMethods.IsGet(ctx.Request.Method) && ctx.Request.Path.Equals("/proxy.pac", StringComparison.OrdinalIgnoreCase))
            {
                var pac = _svc.Pac(ctx.Connection.LocalIpAddress);
                ctx.Response.Headers.CacheControl = "no-store";
                if (pac is null) { ctx.Response.StatusCode = 404; await ctx.Response.WriteAsync("this harness is not part of a proxy setup\n"); return; }
                ctx.Response.ContentType = "application/x-ns-proxy-autoconfig";
                await ctx.Response.WriteAsync(pac);
                return;
            }
            await _next(ctx);
            return;
        }

        var s = _svc.Settings;
        var client = ctx.Connection.RemoteIpAddress?.MapToIPv4();
        var local = ctx.Connection.LocalIpAddress?.MapToIPv4();
        string? refuse = null;
        if (s.Role != FleetProxySettings.RoleProxy) refuse = "this harness is not a proxy computer";
        else if (local is null || !Cidr.TryParse(s.HomeSubnet, out var home) || !home.Contains(local)) refuse = $"a proxy computer answers only on its home side ({s.HomeSubnet})";
        else if (client is null || !s.AllowClients.Contains(client.ToString())) refuse = $"{client} may not use this proxy computer";
        else if (HttpMethods.IsConnect(ctx.Request.Method)) refuse = "tunnels (CONNECT) are not offered: open http:// addresses";
        Uri? target = null;
        if (refuse is null && (!Uri.TryCreate(raw, UriKind.Absolute, out target) || target.Scheme != Uri.UriSchemeHttp)) refuse = "only http:// addresses";
        if (refuse is null && !s.IsTarget(target!.Host)) refuse = $"{target.Host} is not on the business side ({string.Join(", ", s.Targets)})";
        if (refuse is not null)
        {
            _svc.Record($"REFUSED {client} {ctx.Request.Method} {Trim(raw)} — {refuse}");
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            ctx.Response.ContentType = "text/plain; charset=utf-8";
            await ctx.Response.WriteAsync($"Claude Web proxy: {refuse}\n");
            return;
        }

        using var req = new HttpRequestMessage(new HttpMethod(ctx.Request.Method), target);
        if (ctx.Request.ContentLength > 0 || ctx.Request.Headers.ContainsKey("Transfer-Encoding"))
            req.Content = new StreamContent(ctx.Request.Body);
        foreach (var h in ctx.Request.Headers)
        {
            if (HopByHop.Contains(h.Key)) continue;
            if (!req.Headers.TryAddWithoutValidation(h.Key, h.Value.ToArray()))
                req.Content?.Headers.TryAddWithoutValidation(h.Key, h.Value.ToArray());
        }

        HttpResponseMessage resp;
        try { resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ctx.RequestAborted); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException)
        {
            _svc.Record($"FAILED {client} {ctx.Request.Method} {Trim(raw)} — {ex.GetBaseException().Message}");
            if (ctx.RequestAborted.IsCancellationRequested) return;
            ctx.Response.StatusCode = StatusCodes.Status502BadGateway;
            await ctx.Response.WriteAsync($"Claude Web proxy: {target!.Authority} does not answer\n");
            return;
        }
        using (resp)
        {
            ctx.Response.StatusCode = (int)resp.StatusCode;
            foreach (var h in resp.Headers) if (!HopByHop.Contains(h.Key)) ctx.Response.Headers[h.Key] = h.Value.ToArray();
            foreach (var h in resp.Content.Headers) if (!HopByHop.Contains(h.Key)) ctx.Response.Headers[h.Key] = h.Value.ToArray();
            ctx.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
            long total = 0;
            try
            {
                await using var body = await resp.Content.ReadAsStreamAsync(ctx.RequestAborted);
                var buf = new byte[16 * 1024];
                int n;
                while ((n = await body.ReadAsync(buf, ctx.RequestAborted)) > 0)
                {
                    await ctx.Response.Body.WriteAsync(buf.AsMemory(0, n), ctx.RequestAborted);
                    await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
                    total += n;
                }
            }
            catch (Exception ex) when (ex is IOException or OperationCanceledException or HttpRequestException) { /* the browser left or the far side closed */ }
            _svc.Record($"{client} {ctx.Request.Method} {Trim(raw)} {(int)resp.StatusCode} {total} B");
        }
    }

    private static string Trim(string s) => s.Length > 90 ? s[..90] + "…" : s;
}
