using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// The harness-provided, always-on "Understanding" app (plans/multiple-local-apps.md
/// Slice 2). It is NOT a separate process: it appears as a synthetic
/// <c>kind:harness</c> local app on every repo, and <see cref="Controllers.LocalProxyController"/>
/// special-cases that kind to serve from here instead of dialing a loopback port.
///
/// It renders a single <b>rolling-latest</b> Mermaid diagram the agent writes to
/// <c>understanding-diagram.mmd</c> at the repo root. The page polls and re-renders,
/// so a rewrite shows up live (same freshness ethos as the proxy's no-store).
///
/// Three resources, resolved from the request's trailing path:
///   ""/"index.html" → the renderer page;  "mermaid.min.js" → the bundled lib;
///   "diagram"       → the repo's raw .mmd text (empty if none yet).
/// </summary>
public class UnderstandingApp
{
    /// <summary>The rolling-latest diagram file the agent overwrites, at repo root.</summary>
    public const string DiagramFileName = "understanding-diagram.mmd";

    private readonly Logger _logger;
    private readonly string? _assetDir;

    public UnderstandingApp(Logger logger)
    {
        _logger = logger;
        _assetDir = ResolveAssetDir();
        if (_assetDir is null)
            _logger.Error("[UNDERSTANDING] asset dir not found — mermaid.min.js won't be served");
    }

    public async Task Serve(HttpContext ctx, RepositoryRegistry.RepositoryInfo repo, string? rest)
    {
        var path = (rest ?? string.Empty).Trim('/');

        if (path is "" or "index.html")
        {
            ctx.Response.ContentType = "text/html; charset=utf-8";
            ctx.Response.Headers["Cache-Control"] = "no-store"; // always pick up renderer tweaks
            await ctx.Response.WriteAsync(RendererHtml);
            return;
        }

        if (path == "mermaid.min.js")
        {
            var file = _assetDir is null ? null : Path.Combine(_assetDir, "mermaid.min.js");
            if (file is null || !File.Exists(file))
            {
                ctx.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }
            ctx.Response.ContentType = "text/javascript; charset=utf-8";
            ctx.Response.Headers["Cache-Control"] = "public, max-age=86400"; // hashed-lib stable
            await ctx.Response.SendFileAsync(file);
            return;
        }

        if (path == "diagram")
        {
            ctx.Response.ContentType = "text/plain; charset=utf-8";
            ctx.Response.Headers["Cache-Control"] = "no-store";
            var diagramPath = Path.Combine(repo.Path, DiagramFileName);
            string text = "";
            try { if (File.Exists(diagramPath)) text = await File.ReadAllTextAsync(diagramPath); }
            catch (Exception ex) { _logger.Error($"[UNDERSTANDING] read {diagramPath} failed: {ex.Message}"); }
            await ctx.Response.WriteAsync(text);
            return;
        }

        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
    }

    // Mirrors EmbeddedApi.ResolveDistPath: works from bin/ or `dotnet run`.
    private static string? ResolveAssetDir()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Understanding"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "Understanding")),
        };
        return candidates.FirstOrDefault(Directory.Exists);
    }

    // Self-contained renderer. Relative URLs (./mermaid.min.js, ./diagram) resolve
    // under /api/localview/{repoId}/app/understanding/ — the load-bearing slash.
    private const string RendererHtml = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Understanding</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0e1116; color: #cdd9e5;
    font: 14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
  #bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px;
    border-bottom: 1px solid #222a35; font-size: 13px; }
  #bar b { color: #e6edf3; }
  #dot { width: 8px; height: 8px; border-radius: 50%; background: #3fb950; }
  #dot.stale { background: #6e7681; }
  #wrap { padding: 18px; }
  #diagram svg { max-width: 100%; height: auto; }
  #empty, #err { padding: 40px 18px; color: #8b949e; max-width: 640px; }
  #err { color: #f0883e; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 12px; }
  code { background: #1b212b; padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>
  <div id="bar"><span id="dot"></span><b>Understanding</b>
    <span id="status">waiting for a diagram…</span></div>
  <div id="wrap">
    <div id="empty">No diagram yet. When an agent explains something here, it writes
      <code>understanding-diagram.mmd</code> at the repo root and it appears live.</div>
    <div id="err" hidden></div>
    <div id="diagram"></div>
  </div>
  <script src="./mermaid.min.js"></script>
  <script>
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
    const $ = (id) => document.getElementById(id);
    let last = null, n = 0;
    async function tick() {
      let text;
      try {
        const res = await fetch('./diagram?_=' + Date.now(), { cache: 'no-store' });
        text = (await res.text()).trim();
        $('dot').classList.remove('stale');
      } catch { $('dot').classList.add('stale'); return; }
      if (text === last) return;            // unchanged — skip re-render
      last = text;
      if (!text) { $('empty').hidden = false; $('diagram').innerHTML = ''; $('err').hidden = true;
        $('status').textContent = 'waiting for a diagram…'; return; }
      $('empty').hidden = true;
      try {
        const { svg } = await mermaid.render('m' + (++n), text);
        $('diagram').innerHTML = svg; $('err').hidden = true;
        $('status').textContent = 'updated';
      } catch (e) {
        $('err').hidden = false; $('err').textContent = 'Diagram error:\n' + (e?.message || e);
        $('status').textContent = 'diagram has an error';
      }
    }
    tick();
    setInterval(tick, 2500);
  </script>
</body>
</html>
""";
}
