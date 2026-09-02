using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Dock;

/// <summary>
/// Latches the dock "unseen result" flag at turn end (openspec
/// dock-busy-indicator, unseen-result amendment). Subscribes to
/// <see cref="RunSessionService.RunCompleted"/> — the single choke point every
/// run starter (user send, autopilot auto-send, loop resend) funnels through —
/// and marks every dock tab of the completed run's repo that is HIDDEN from the
/// dashboard, so the toolbar can show an exclamation dot for a finish the
/// operator never saw. The latch lives on the persisted tab: it survives page
/// reloads and is set even when no browser has the dashboard open at completion
/// time. <see cref="DockRegistry.Update"/> clears it when the tab is shown.
///
/// Scope mirrors the busy dot it complements: builder lane only (the dot tracks
/// the builder run slot; ask is a read-only side conversation) and genuine
/// finishes only ("done"/"error"). "stopped" is excluded on purpose — a stop is
/// a deliberate operator action, not a completion that slipped by unwatched
/// (and app-shutdown marks every running session "stopped", which would latch
/// the whole roster on each redeploy).
///
/// Same wiring pattern as <c>AutoUnderstandingTrigger</c>: the dependency
/// direction stays dock → chat (plans/INTEGRATION.md), and the handler body
/// never throws — a broken latch must never fail a chat turn.
/// </summary>
public class DockUnseenResultTrigger : IHostedService
{
    private readonly RunSessionService _runs;
    private readonly DockRegistry _dock;
    private readonly Logger _logger;

    public DockUnseenResultTrigger(RunSessionService runs, DockRegistry dock, Logger logger)
    {
        _runs = runs;
        _dock = dock;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _runs.RunCompleted += OnRunCompleted;
        _runs.RunStarted += OnRunStarted;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _runs.RunCompleted -= OnRunCompleted;
        _runs.RunStarted -= OnRunStarted;
        return Task.CompletedTask;
    }

    // The other end of the run (openspec dock-recent-tab-emphasis): a builder
    // run starting IS "a prompt was sent to this agent", so stamp LastPromptAt
    // on every tab of the repo — hidden ones included, they're the point: the
    // toolbar's "recent" filter is how the operator finds a hidden agent they
    // used a few hours ago. Same lane scope and same never-throws rule as the
    // completion latch above.
    private void OnRunStarted(RunSessionService.RunStartedEvent e)
    {
        try
        {
            if (e.Lane != "builder") return;
            var stamped = _dock.MarkPromptedForRepo(e.RepoId, e.StartedAtMs);
            if (stamped > 0)
                _logger.Info($"[DOCK] Last-prompt stamp set on {stamped} tab(s) for repo {e.RepoId}.");
        }
        catch (Exception ex)
        {
            _logger.Error($"[DOCK] Last-prompt trigger failed: {ex.Message}");
        }
    }

    private void OnRunCompleted(RunSessionService.RunCompletedEvent e)
    {
        try
        {
            if (e.Lane != "builder" || (e.Status != "done" && e.Status != "error"))
                return;
            var latched = _dock.MarkUnseenForRepo(e.RepoId);
            if (latched > 0)
                _logger.Info($"[DOCK] Unseen-result latch set on {latched} hidden tab(s) for repo {e.RepoId} ({e.Status}).");
        }
        catch (Exception ex)
        {
            // Defense in depth: RunSessionService already catches handler
            // exceptions, but this trigger must never surface one at all.
            _logger.Error($"[DOCK] Unseen-result trigger failed: {ex.Message}");
        }
    }
}
