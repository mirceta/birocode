using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// Automatic "Ask for understanding" at the end of every agent turn (openspec
/// change auto-understanding-after-turn). Subscribes to
/// <see cref="RunSessionService.RunCompleted"/> — the single choke point every
/// run starter (user send, autopilot auto-send, loop resend) funnels through —
/// and starts the same understanding run the dock button starts, when ALL hold:
///
///   - lane is "builder" (the ask lane is a read-only side conversation);
///   - terminal status is "done" (explaining a stopped/crashed/error turn is noise);
///   - the run captured a Claude session id (no transcript = nothing to fork);
///   - the repo's persisted AutoUnderstanding flag is on (default off — every
///     turn is a paid agentic run).
///
/// The subscription keeps the dependency direction understanding → chat (the chat
/// module knows nothing about this module; plans/INTEGRATION.md). Recursion is
/// structurally impossible: the understanding run executes via the Claude Monitor
/// gateway, never through RunSessionService, so it can't complete a RunSession.
/// The handler body only reads the flag and pokes the jobs registry (both
/// non-blocking) and never throws — a broken trigger must never fail a chat turn.
/// </summary>
public class AutoUnderstandingTrigger : IHostedService
{
    private readonly RunSessionService _runs;
    private readonly RepositoryRegistry _repos;
    private readonly UnderstandingJobs _jobs;
    private readonly Logger _logger;

    public AutoUnderstandingTrigger(
        RunSessionService runs, RepositoryRegistry repos, UnderstandingJobs jobs, Logger logger)
    {
        _runs = runs;
        _repos = repos;
        _jobs = jobs;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _runs.RunCompleted += OnRunCompleted;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _runs.RunCompleted -= OnRunCompleted;
        return Task.CompletedTask;
    }

    private void OnRunCompleted(RunSessionService.RunCompletedEvent e)
    {
        try
        {
            if (e.Lane != "builder" || e.Status != "done" || string.IsNullOrWhiteSpace(e.SessionId))
                return;

            var repo = _repos.TryGet(e.RepoId);
            if (repo is null || !repo.AutoUnderstanding)
                return;
            if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
            {
                _logger.Error($"[UNDERSTANDING] Auto-run skipped for \"{repo?.Name}\": working directory missing.");
                return;
            }

            _logger.Info($"[UNDERSTANDING] Auto-run for \"{repo.Name}\" (turn done, session {e.SessionId[..Math.Min(8, e.SessionId.Length)]}…)");
            _jobs.EnqueueLatest(repo.Id, repo.Name, repo.Path, e.SessionId);
        }
        catch (Exception ex)
        {
            // Defense in depth: RunSessionService already catches handler
            // exceptions, but this trigger must never surface one at all.
            _logger.Error($"[UNDERSTANDING] Auto-trigger failed: {ex.Message}");
        }
    }
}
