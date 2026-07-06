using ClaudeWeb.Services.Audit;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Understanding;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The second agentic dock button — "Ask for understanding" (openspec change
/// add-ask-for-understanding). Forks the dock's builder-lane conversation into
/// Claude Monitor and has the forked agent build the repo's Understanding app
/// explaining the latest turn. The dock's repo is resolved from the X-Repo-Id
/// header / ?repo= fallback like every other per-repo endpoint.
///
/// The run is BACKEND-OWNED (mirrors LocalAppsController/discover): it runs as a
/// per-repo job in <see cref="UnderstandingJobs"/> on its own cancellation token, so
/// a browser refresh / disconnect never cancels it and the state is retained
/// server-side for reattach. The request's abort token is deliberately NOT threaded
/// into the run.
///
///   POST /api/understanding/ask    -- start-or-join the caller's repo run for the
///                                     given builder sessionId; returns job state
///   GET  /api/understanding/status -- the caller's repo's most recent job state,
///                                     for reattach on (re)load — never starts a run
///
/// Both return { repoId, repoName, status: running|done|error|idle, error?,
/// startedAt?, finishedAt? }. Progress also lands in the per-repo Event Console as
/// op="understanding" events (started/done/error), so it shows in the same lane as
/// Discover with no Console UI change.
/// </summary>
[ApiController]
[Route("api/understanding")]
public class UnderstandingController : ControllerBase
{
    private readonly RepositoryResolver _repos;
    private readonly UnderstandingJobs _jobs;
    private readonly AuditService _audit;
    private readonly Logger _logger;

    public UnderstandingController(RepositoryResolver repos, UnderstandingJobs jobs, AuditService audit, Logger logger)
    {
        _repos = repos;
        _jobs = jobs;
        _audit = audit;
        _logger = logger;
    }

    // Start-or-join: forks the dock conversation and returns the current state
    // immediately. It does not block the run on the request, so the job lives on
    // even if the client aborts.
    [HttpPost("ask")]
    public IActionResult Ask([FromBody] AskRequest body)
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });
        if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
            return BadRequest(new { error = $"Repository working directory not found: '{repo.Path}'." });
        if (string.IsNullOrWhiteSpace(body?.SessionId))
            return BadRequest(new { error = "No conversation to explain yet — start a conversation in this dock first." });

        // Agentic audit (openspec add-agent-audit-trail): resolve WHO here — identity
        // is request-scoped — and hand it to the registry, which owns the lifecycle
        // and records the call only if this is an actual start (not a join).
        var actor = _audit.ResolveActor(HttpContext);
        var job = _jobs.StartOrJoin(repo.Id, repo.Name, repo.Path, body.SessionId, actor.Display, actor.Ip);
        return Ok(JobBody(repo.Id, repo.Name, job));
    }

    // Reattach: the dock calls this on mount / repo-change (and while polling) to
    // observe a running run, pick up a result/error that landed while it was away,
    // or learn there is nothing recent (idle) — without starting a new run.
    [HttpGet("status")]
    public IActionResult Status()
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });

        var job = _jobs.Get(repo.Id);
        return Ok(JobBody(repo.Id, repo.Name, job));
    }

    public sealed class AskRequest
    {
        public string? SessionId { get; set; }
    }

    // Shared projection. A null job means "no recent run" (idle); otherwise we
    // surface running/done/error with the error detail on error.
    private static object JobBody(string repoId, string repoName, UnderstandingJob? job)
    {
        if (job is null)
            return new { repoId, repoName, status = "idle" };

        var status = job.Status switch
        {
            UnderstandingStatus.Done => "done",
            UnderstandingStatus.Error => "error",
            _ => "running",
        };

        return new
        {
            repoId,
            repoName,
            status,
            error = job.Status == UnderstandingStatus.Error ? job.Error : null,
            startedAt = job.StartedAt,
            finishedAt = job.FinishedAt,
        };
    }
}
