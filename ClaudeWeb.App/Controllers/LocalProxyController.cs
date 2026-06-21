using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Authenticated reverse proxy for the Local tab (plans/local-app-proxy.md).
/// Forwards <c>/api/localview/{repoId}/{**rest}</c> to
/// <c>http://127.0.0.1:{repo.LocalPort}/{rest}</c> so a project's local app is
/// reachable over the internet through the harness's own (already-public)
/// origin — WITHOUT an off-box IIS rule, and behind the session+IP gate (it
/// lives under /api/, which PasswordAuthMiddleware protects). Same-origin, so
/// the iframe's session cookie rides along automatically and there is no
/// mixed-content/IPv6 issue (the connect to 127.0.0.1 is server-side).
///
/// SSRF-bounded: the path carries a repoId, resolved to that project's
/// configured LocalPort. The proxy only ever dials 127.0.0.1 on a port the
/// operator explicitly set — never an arbitrary host/port from the URL.
/// </summary>
[ApiController]
[Route("api/localview")]
public class LocalProxyController : ControllerBase
{
    // Connection-scoped headers must not be forwarded (RFC 7230 §6.1) + Host.
    private static readonly HashSet<string> HopByHop = new(StringComparer.OrdinalIgnoreCase)
    {
        "Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization",
        "TE", "Trailer", "Transfer-Encoding", "Upgrade", "Host",
    };

    private readonly IHttpClientFactory _http;
    private readonly RepositoryRegistry _registry;
    private readonly Logger _logger;
    private readonly Services.Understanding.UnderstandingApp _understanding;
    private readonly Services.Understanding.LabApp _lab;

    public LocalProxyController(IHttpClientFactory http, RepositoryRegistry registry, Logger logger,
        Services.Understanding.UnderstandingApp understanding, Services.Understanding.LabApp lab)
    {
        _http = http;
        _registry = registry;
        _logger = logger;
        _understanding = understanding;
        _lab = lab;
    }

    // Named app: /api/localview/{repoId}/app/{appId}/... — the multi-app form
    // (plans/multiple-local-apps.md). The literal "app" segment outranks the bare
    // catch-all below, so this wins when present.
    [AcceptVerbs("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")]
    [Route("{repoId}/app/{appId}/{**rest}")]
    public async Task ProxyApp(string repoId, string appId, string? rest)
    {
        _logger.CountRequest();
        var repo = _registry.GetAll().FirstOrDefault(r => r.Id == repoId);
        var app = repo?.LocalApps.FirstOrDefault(a => a.Id == appId);
        if (app is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { error = "No such local app for this project." });
            return;
        }
        // Harness-provided apps are served internally with repo context, not dialed
        // on a loopback port (plans/multiple-local-apps.md). Dispatch by appId.
        if (string.Equals(app.Kind, "harness", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(appId, RepositoryRegistry.LabAppId, StringComparison.OrdinalIgnoreCase))
                await _lab.Serve(HttpContext, repo!, rest);
            else
                await _understanding.Serve(HttpContext, repo!, rest);
            return;
        }
        await ProxyTo(repo!.Name, app.Port, rest);
    }

    // Bare/default app: /api/localview/{repoId}/... — back-compat (the dock,
    // Exposure check, and old links) and the repo's first/default app.
    [AcceptVerbs("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")]
    [Route("{repoId}/{**rest}")]
    public async Task Proxy(string repoId, string? rest)
    {
        _logger.CountRequest();
        var repo = _registry.GetAll().FirstOrDefault(r => r.Id == repoId);
        // The bare route is the default app: the first REAL (kind:repo) app, never
        // the synthetic harness app (which is only reachable at /app/understanding/).
        var app = repo?.LocalApps.FirstOrDefault(a =>
            string.Equals(a.Kind, "repo", StringComparison.OrdinalIgnoreCase));
        if (app is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { error = "No local app is configured for this project." });
            return;
        }
        await ProxyTo(repo!.Name, app.Port, rest);
    }

    // Forwards the current request to http://127.0.0.1:{port}/{rest}, streaming
    // the response back. Shared by both routes above.
    private async Task ProxyTo(string repoName, int port, string? rest)
    {
        var target = $"http://127.0.0.1:{port}/{rest ?? string.Empty}{Request.QueryString}";

        using var msg = new HttpRequestMessage(new HttpMethod(Request.Method), target);

        // Body (and its Content-* headers) for methods that carry one.
        if (Request.ContentLength is > 0 || Request.Headers.ContainsKey("Transfer-Encoding"))
        {
            msg.Content = new StreamContent(Request.Body);
            foreach (var h in Request.Headers)
                if (h.Key.StartsWith("Content-", StringComparison.OrdinalIgnoreCase))
                    msg.Content.Headers.TryAddWithoutValidation(h.Key, h.Value.ToArray());
        }

        // Remaining request headers, minus hop-by-hop and Content-* (handled above).
        foreach (var h in Request.Headers)
        {
            if (HopByHop.Contains(h.Key) || h.Key.StartsWith("Content-", StringComparison.OrdinalIgnoreCase))
                continue;
            msg.Headers.TryAddWithoutValidation(h.Key, h.Value.ToArray());
        }

        HttpResponseMessage upstream;
        try
        {
            var client = _http.CreateClient("localview");
            upstream = await client.SendAsync(msg, HttpCompletionOption.ResponseHeadersRead, HttpContext.RequestAborted);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.Error($"[LOCALVIEW] {repoName} :{port} unreachable: {ex.Message}");
            Response.StatusCode = StatusCodes.Status502BadGateway;
            await Response.WriteAsJsonAsync(new { error = "The local app is not responding." });
            return;
        }

        using (upstream)
        {
            Response.StatusCode = (int)upstream.StatusCode;
            foreach (var h in upstream.Headers)
                if (!HopByHop.Contains(h.Key)) Response.Headers[h.Key] = h.Value.ToArray();
            foreach (var h in upstream.Content.Headers)
                if (!HopByHop.Contains(h.Key)) Response.Headers[h.Key] = h.Value.ToArray();
            // Kestrel sets the framing itself; a copied length/encoding can clash.
            Response.Headers.Remove("transfer-encoding");

            // Stale-embed prevention (plans/expose-freshness.md): keep the proxied
            // HTML document out of the browser cache so a rebuilt/fixed product is
            // never shadowed by a cached pre-fix index.html. Hashed JS/CSS keep
            // their normal caching, so this costs nothing on the asset path.
            if (string.Equals(upstream.Content.Headers.ContentType?.MediaType, "text/html",
                    StringComparison.OrdinalIgnoreCase))
                Response.Headers["Cache-Control"] = "no-store";

            await upstream.Content.CopyToAsync(Response.Body, HttpContext.RequestAborted);
        }
    }
}
