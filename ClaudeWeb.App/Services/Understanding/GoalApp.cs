using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// The harness-provided, always-on "Goal" app (openspec goal-app): the
/// <see cref="UnderstandingApp"/>'s twin. NOT a separate process — a synthetic
/// <c>kind:harness</c> local app on every repo that
/// <see cref="Controllers.LocalProxyController"/> serves from here, from the
/// agent-authored folder <c>goal-app/</c> at the repo root (the Goal app plus its
/// <c>goal.json</c>), no-store, relative URLs, under
/// <c>/api/localview/{repoId}/app/goal/</c>. Same rule as the Understanding app: no
/// fallback — a missing index.html is an explicit empty state, a missing asset a 404.
/// </summary>
public class GoalApp
{
    /// <summary>The agent-authored SPA folder at the repo root.</summary>
    public const string AppDirName = GoalAsk.AppDirName;

    private readonly Logger _logger;

    public GoalApp(Logger logger) => _logger = logger;

    public Task Serve(HttpContext ctx, RepositoryRegistry.RepositoryInfo repo, string? rest) =>
        HarnessStaticApp.Serve(ctx, Path.Combine(repo.Path, AppDirName), rest, _logger, EmptyStateHtml, "GOAL");

    private const string EmptyStateHtml = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Goal — empty</title>
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
    <h1>No Goal app here yet</h1>
    <p class="muted">This surface shows the goal of what is being built in this repo agent,
      as a single-page app the agent authors at the repo root:</p>
    <p><code>goal-app/index.html</code> <span class="muted">(plus <code>goal-app/goal.json</code>,
      its JS/CSS and vendored libs — relative URLs only)</span></p>
    <p class="muted">Set the goal in the agent's chat ("we want to create …", or a message
      starting with <code>GOAL:</code>) and press 🎯 Update goal in the dock — or tick its
      Auto box to refresh it after every turn. There is intentionally no fallback — empty
      means no goal has been recorded.</p>
  </div>
</body>
</html>
""";
}
