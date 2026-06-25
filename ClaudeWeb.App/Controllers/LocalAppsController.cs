using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.StructuredAsk;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Discover local-app exposures in ONE repository on demand (openspec changes
/// discover-local-apps + discover-local-apps-resilient). Triggered from a
/// repository's agent dock; the dock's repo is resolved from the X-Repo-Id header /
/// ?repo= fallback like every other per-repo endpoint. Read-only: it runs a
/// read-only agent scan and never registers or mutates anything, and it does NOT
/// read the registered-apps store as its discovery source.
///
/// Discovery is BACKEND-OWNED (discover-local-apps-resilient): the scan runs as a
/// per-repo job in <see cref="LocalAppDiscoveryJobs"/> on its own cancellation
/// token, so a browser refresh / disconnect never cancels it and the result is
/// retained server-side for reattach. The request's abort token is deliberately
/// NOT threaded into the run.
///
///   GET /api/local-apps/discover         -- start-or-join the caller's repo scan;
///                                           returns the current job state
///   GET /api/local-apps/discover/status  -- the caller's repo's most recent job
///                                           state, for reattach on (re)load
///
/// Both return { repoId, repoName, status: running|done|error|idle, apps?, error?,
/// startedAt?, finishedAt? }. On a completed scan the body still carries
/// { repoId, repoName, apps } so existing callers stay backward-compatible.
/// </summary>
[ApiController]
[Route("api/local-apps")]
public class LocalAppsController : ControllerBase
{
    private readonly RepositoryResolver _repos;
    private readonly LocalAppDiscoveryJobs _jobs;
    private readonly Logger _logger;

    public LocalAppsController(RepositoryResolver repos, LocalAppDiscoveryJobs jobs, Logger logger)
    {
        _repos = repos;
        _jobs = jobs;
        _logger = logger;
    }

    // Start-or-join: registers/joins the repo's background scan and returns the
    // current state immediately. It no longer blocks the run on the request, so the
    // job lives on even if the client aborts.
    [HttpGet("discover")]
    public IActionResult Discover()
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });
        if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
            return BadRequest(new { error = $"Repository working directory not found: '{repo.Path}'." });

        var job = _jobs.StartOrJoin(repo.Id, repo.Path);
        return Ok(JobBody(repo.Id, repo.Name, job));
    }

    // Reattach: the dock calls this on mount / repo-change (and while polling) to
    // observe a running scan, pick up a result/error that landed while it was away,
    // or learn there is nothing recent (idle) — without starting a new scan.
    [HttpGet("discover/status")]
    public IActionResult Status()
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });

        var job = _jobs.Get(repo.Id);
        return Ok(JobBody(repo.Id, repo.Name, job));
    }

    // Shared projection. A null job means "no recent discovery" (idle); otherwise we
    // surface running/done/error with the apps list on done. The completed shape
    // keeps { repoId, repoName, apps } so the route stays backward-compatible.
    private static object JobBody(string repoId, string repoName, DiscoveryJob? job)
    {
        if (job is null)
            return new { repoId, repoName, status = "idle" };

        var status = job.Status switch
        {
            DiscoveryStatus.Done => "done",
            DiscoveryStatus.Error => "error",
            _ => "running",
        };

        return new
        {
            repoId,
            repoName,
            status,
            apps = job.Status == DiscoveryStatus.Done
                ? job.Result!.Apps.Select(a => new
                {
                    name = a.Name,
                    port = a.Port,
                    folder = a.Folder,
                    evidence = a.Evidence,
                })
                : null,
            error = job.Status == DiscoveryStatus.Error ? job.Error : null,
            startedAt = job.StartedAt,
            finishedAt = job.FinishedAt,
        };
    }
}
