using ClaudeWeb.Models;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// Automatic "Ask for understanding" — and "Update goal" (openspec goal-app) — at the
/// end of every agent turn (openspec change auto-understanding-after-turn). Subscribes
/// to <see cref="RunSessionService.RunCompleted"/> — the single choke point every run
/// starter (user send, autopilot auto-send, loop resend) funnels through — and starts
/// the same run the dock button starts, per kind, when ALL hold:
///
///   - lane is "builder" (the ask lane is a read-only side conversation);
///   - terminal status is "done" (explaining a stopped/crashed/error turn is noise);
///   - the run captured a Claude session id (no transcript = nothing to read);
///   - the repo's persisted flag for that kind is on: AutoUnderstanding for the
///     Understanding app, AutoGoal for the Goal app (both default off — every turn
///     is a paid agentic run). The two flags are independent.
///
/// The subscription keeps the dependency direction understanding → chat (the chat
/// module knows nothing about this module; plans/INTEGRATION.md). Recursion is
/// structurally impossible: the builds run as ephemeral helper runs, never through
/// RunSessionService, so they can't complete a RunSession. The handler body only
/// reads the flags and pokes the jobs registry (both non-blocking) and never throws
/// — a broken trigger must never fail a chat turn.
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

    /// <summary>The kinds a completed turn should refresh for this repo, given its flags —
    /// pure, so the rule is unit-testable without a RunSessionService.</summary>
    public static IReadOnlyList<AppBuildKind> KindsToRun(RunSessionService.RunCompletedEvent e, RepositoryConfig? repo)
    {
        if (e.Lane != "builder" || e.Status != "done" || string.IsNullOrWhiteSpace(e.SessionId) || repo is null)
            return Array.Empty<AppBuildKind>();
        var kinds = new List<AppBuildKind>(2);
        if (repo.AutoUnderstanding) kinds.Add(AppBuildKind.Understanding);
        if (repo.AutoGoal) kinds.Add(AppBuildKind.Goal);
        return kinds;
    }

    private void OnRunCompleted(RunSessionService.RunCompletedEvent e)
    {
        try
        {
            var repo = _repos.TryGet(e.RepoId);
            var kinds = KindsToRun(e, repo);
            if (kinds.Count == 0) return;
            if (string.IsNullOrWhiteSpace(repo!.Path) || !Directory.Exists(repo.Path))
            {
                _logger.Error($"[UNDERSTANDING] Auto-run skipped for \"{repo.Name}\": working directory missing.");
                return;
            }

            foreach (var kind in kinds)
            {
                _logger.Info($"[{kind.Key.ToUpperInvariant()}] Auto-run for \"{repo.Name}\" (turn done, session {e.SessionId![..Math.Min(8, e.SessionId.Length)]}…)");
                _jobs.EnqueueLatest(kind, repo.Id, repo.Name, repo.Path, e.SessionId!);
            }
        }
        catch (Exception ex)
        {
            // Defense in depth: RunSessionService already catches handler
            // exceptions, but this trigger must never surface one at all.
            _logger.Error($"[UNDERSTANDING] Auto-trigger failed: {ex.Message}");
        }
    }
}
