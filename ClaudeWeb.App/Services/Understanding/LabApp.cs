using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// The harness-provided "Agentic Engineering Lab" app (plans/agentic-lab.md). Like the
/// <see cref="UnderstandingApp"/> it is NOT a separate process: it appears as a synthetic
/// <c>kind:harness</c> local app, and <see cref="Controllers.LocalProxyController"/>
/// special-cases that kind to serve it from here instead of dialing a loopback port.
///
/// Unlike the Understanding app (which is offered on every repo, reading each repo's own
/// <c>understanding-app/</c>), the Lab is the operator's <b>single personal hub</b> and is
/// only attached to the <b>self repo</b> (the Harness's own checkout), serving a build-less
/// SPA from <c>lab/</c> at that repo root — a folder of static assets (index.html + JS/CSS +
/// vendored libs + JSON/Markdown data), the same contract as <c>homepage/</c> and the
/// Understanding app.
///
/// Everything is served no-store (actively-curated content; never serve stale assets) under
/// relative URLs, so the SPA resolves under <c>/api/localview/{repoId}/app/lab/</c>. As with
/// the Understanding app there is <b>no fallback</b>: a missing index.html shows an explicit
/// empty state and any other missing asset is a plain 404, so a broken/absent app is visibly
/// broken rather than masked.
/// </summary>
public class LabApp
{
    /// <summary>The agent-curated SPA folder at the repo root.</summary>
    public const string AppDirName = "lab";

    private readonly Logger _logger;

    public LabApp(Logger logger) => _logger = logger;

    public Task Serve(HttpContext ctx, RepositoryRegistry.RepositoryInfo repo, string? rest) =>
        HarnessStaticApp.Serve(ctx, Path.Combine(repo.Path, AppDirName), rest, _logger, EmptyStateHtml, "LAB");

    // Shown only when there is no lab/index.html yet. Deliberately unmistakable as
    // "nothing here" — never rendered content that could look like a working app.
    private const string EmptyStateHtml = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agentic Engineering Lab — empty</title>
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
    <h1>No Agentic Engineering Lab here yet</h1>
    <p class="muted">This surface serves a single-page app authored as a folder of static
      files at the repo root:</p>
    <p><code>lab/index.html</code> <span class="muted">(plus its JS/CSS, vendored libs, and
      JSON/Markdown data — relative URLs only)</span></p>
    <p class="muted">When the Lab is built it appears live. There is intentionally no
      fallback — empty means empty.</p>
  </div>
</body>
</html>
""";
}
