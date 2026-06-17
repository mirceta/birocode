using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// The harness-provided, always-on "Understanding" app (plans/multiple-local-apps.md
/// Slice 2 + plans/understanding-spa.md). It is NOT a separate process: it appears as
/// a synthetic <c>kind:harness</c> local app on every repo, and
/// <see cref="Controllers.LocalProxyController"/> special-cases that kind to serve
/// from here instead of dialing a loopback port.
///
/// It serves an <b>agent-authored single-page app</b> from <c>understanding-app/</c> at
/// the repo root — a build-less folder of static assets (index.html + JS/CSS + vendored
/// libs + data), the stack copied from birokrat-architecture's <c>viz/</c>. This
/// replaces the old single-Mermaid-diagram renderer: a Mermaid diagram isn't expressive
/// enough for many ideas, while an SPA is.
///
/// Deliberately there is <b>no Mermaid fallback</b>: if no SPA is present, or a file is
/// missing, we show an explicit empty/404 state rather than some other content — so a
/// broken/absent SPA can never masquerade as a working one (plans/understanding-spa.md).
///
/// Everything is served no-store (actively-edited tool; never serve stale assets) and
/// under relative URLs, so the SPA resolves under
/// <c>/api/localview/{repoId}/app/understanding/</c>.
/// </summary>
public class UnderstandingApp
{
    /// <summary>The agent-authored SPA folder at the repo root.</summary>
    public const string AppDirName = "understanding-app";

    private readonly Logger _logger;

    public UnderstandingApp(Logger logger) => _logger = logger;

    public Task Serve(HttpContext ctx, RepositoryRegistry.RepositoryInfo repo, string? rest) =>
        HarnessStaticApp.Serve(ctx, Path.Combine(repo.Path, AppDirName), rest, _logger, EmptyStateHtml, "UNDERSTANDING");

    // Shown only when there is no understanding-app/index.html yet. Deliberately
    // unmistakable as "nothing here" — never rendered content that could look like a
    // working app.
    private const string EmptyStateHtml = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Understanding — empty</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0e1116; color: #cdd9e5;
    font: 14px/1.6 system-ui, -apple-system, Segoe UI, sans-serif; }
  .wrap { max-width: 680px; margin: 0 auto; padding: 64px 24px; }
  h1 { font-size: 18px; color: #e6edf3; margin: 0 0 12px; }
  code { background: #1b212b; padding: 2px 6px; border-radius: 4px; }
  .muted { color: #8b949e; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>No Understanding app here yet</h1>
    <p class="muted">This surface serves a single-page app the agent authors as a folder
      of static files at the repo root:</p>
    <p><code>understanding-app/index.html</code> <span class="muted">(plus its JS/CSS,
      vendored libs, and data — relative URLs only)</span></p>
    <p class="muted">When an agent builds one to explain something here, it appears live.
      There is intentionally no diagram fallback — empty means empty.</p>
  </div>
</body>
</html>
""";
}
