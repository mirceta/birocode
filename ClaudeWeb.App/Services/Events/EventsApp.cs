using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Understanding;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Events;

/// <summary>
/// The harness-provided pilot consumer app for the harness event feed (openspec
/// change add-harness-event-feed). Like the <see cref="UnderstandingApp"/> and
/// <see cref="LabApp"/> it is NOT a separate process: it appears as a synthetic
/// <c>kind:harness</c> local app and <see cref="Controllers.LocalProxyController"/>
/// special-cases that kind to serve it from here instead of dialing a loopback
/// port.
///
/// Like the Lab it is attached to the <b>self repo only</b> — it is a harness dev
/// tool that reads the harness-wide feed (<c>GET /api/events</c>), not a per-repo
/// product. It serves a build-less SPA from <c>events-app/</c> at that repo root
/// (index.html + JS/CSS, relative URLs only), no-store, under
/// <c>/api/localview/{repoId}/app/events-feed/</c>. As with the sibling apps there
/// is <b>no fallback</b>: a missing index.html shows an explicit empty state.
/// </summary>
public class EventsApp
{
    /// <summary>The pilot consumer SPA folder at the repo root.</summary>
    public const string AppDirName = "events-app";

    private readonly Logger _logger;

    public EventsApp(Logger logger) => _logger = logger;

    public Task Serve(HttpContext ctx, RepositoryRegistry.RepositoryInfo repo, string? rest) =>
        HarnessStaticApp.Serve(ctx, Path.Combine(repo.Path, AppDirName), rest, _logger, EmptyStateHtml, "EVENTS-APP");

    // Shown only when there is no events-app/index.html yet. Deliberately
    // unmistakable as "nothing here" — never rendered content that could look like
    // a working app.
    private const string EmptyStateHtml = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Harness Event Feed — empty</title>
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
    <h1>No Harness Event Feed app here yet</h1>
    <p class="muted">This surface serves a single-page app authored as a folder of static
      files at the repo root:</p>
    <p><code>events-app/index.html</code> <span class="muted">(plus its JS/CSS — relative
      URLs only)</span></p>
    <p class="muted">It is the pilot consumer of <code>GET /api/events</code>. There is
      intentionally no fallback — empty means empty.</p>
  </div>
</body>
</html>
""";
}
