using ClaudeWeb.Services.Audit;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Understanding;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The "Update goal" dock button (openspec goal-app) — the Goal app's twin of
/// <see cref="UnderstandingController"/>, same three endpoints, same shapes, same
/// X-Repo-Id / ?repo= resolution, on the same backend-owned per-(kind, repo) job
/// registry with kind = goal:
///
///   POST /api/goal/ask     -- start-or-join the caller's repo goal run for the
///                             given builder sessionId; returns job state
///   GET  /api/goal/status  -- the caller's repo's most recent goal job state, for
///                             reattach on (re)load — never starts a run
///   GET  /api/goal/auto    -- the repo's persisted auto-goal flag
///   POST /api/goal/auto    -- flip it ({ enabled }); persisted server-side so the
///                             turn-end trigger fires with no client attached
///
/// Progress lands in the per-repo Event Console as op="goal" events and in the
/// agentic audit trail as feature "update-goal".
/// </summary>
[ApiController]
[Route("api/goal")]
public class GoalController : ControllerBase
{
    private readonly RepositoryResolver _repos;
    private readonly RepositoryRegistry _registry;
    private readonly UnderstandingJobs _jobs;
    private readonly AuditService _audit;
    private readonly Logger _logger;

    public GoalController(RepositoryResolver repos, RepositoryRegistry registry, UnderstandingJobs jobs, AuditService audit, Logger logger)
    {
        _repos = repos;
        _registry = registry;
        _jobs = jobs;
        _audit = audit;
        _logger = logger;
    }

    [HttpPost("ask")]
    public IActionResult Ask([FromBody] UnderstandingController.AskRequest body)
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });
        if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
            return BadRequest(new { error = $"Repository working directory not found: '{repo.Path}'." });
        if (string.IsNullOrWhiteSpace(body?.SessionId))
            return BadRequest(new { error = "No conversation to read the goal from yet — start a conversation in this dock first." });

        var actor = _audit.ResolveActor(HttpContext);
        var job = _jobs.StartOrJoin(AppBuildKind.Goal, repo.Id, repo.Name, repo.Path, body.SessionId, actor.Display, actor.Ip);
        return Ok(UnderstandingController.JobBody(repo.Id, repo.Name, job));
    }

    [HttpGet("status")]
    public IActionResult Status()
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });

        return Ok(UnderstandingController.JobBody(repo.Id, repo.Name, _jobs.Get(AppBuildKind.Goal, repo.Id)));
    }

    [HttpGet("auto")]
    public IActionResult GetAuto()
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });

        return Ok(new { repoId = repo.Id, enabled = repo.AutoGoal });
    }

    [HttpPost("auto")]
    public IActionResult SetAuto([FromBody] UnderstandingController.AutoRequest body)
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });
        if (body is null)
            return BadRequest(new { error = "Body { enabled } is required." });

        if (!_registry.SetAutoGoal(repo.Id, body.Enabled))
            return NotFound(new { error = "Repository not found." });
        return Ok(new { repoId = repo.Id, enabled = body.Enabled });
    }
}
