using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// The harness-provided, always-on <b>Autopilot</b> dev app (plans/loop-autopilot.md).
/// While the loop-autopilot is still in development we surface it as a build-less
/// local app — a folder of static assets at the repo root (<c>autopilot-app/</c>),
/// served no-store as a synthetic <c>kind:harness</c> app — so we can iterate on the
/// dashboard without rebuilding the React frontend. It talks to the existing
/// <c>/api/autopilot</c> endpoints (which are themselves operator-gated:
/// plans/loop-autopilot-safety.md), and renders an explicit "disabled by the
/// operator" state when those return 403.
///
/// Same contract as the Understanding app: relative URLs only (resolves under
/// <c>/api/localview/{repoId}/app/autopilot/</c>), no fallback content — a missing
/// app shows an honest empty state and a missing asset 404s.
/// </summary>
public class AutopilotApp
{
    /// <summary>The static app folder at the repo root.</summary>
    public const string AppDirName = "autopilot-app";

    private readonly Logger _logger;

    public AutopilotApp(Logger logger) => _logger = logger;

    public Task Serve(HttpContext ctx, RepositoryRegistry.RepositoryInfo repo, string? rest) =>
        HarnessStaticApp.Serve(ctx, Path.Combine(repo.Path, AppDirName), rest, _logger, EmptyStateHtml, "AUTOPILOT-APP");

    private const string EmptyStateHtml = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Autopilot — empty</title>
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
    <h1>No Autopilot app here yet</h1>
    <p class="muted">This surface serves the autopilot dashboard as a build-less
      folder of static files at the repo root:</p>
    <p><code>autopilot-app/index.html</code> <span class="muted">(plus its JS/CSS —
      relative URLs only)</span></p>
    <p class="muted">There is intentionally no fallback — empty means empty.</p>
  </div>
</body>
</html>
""";
}
