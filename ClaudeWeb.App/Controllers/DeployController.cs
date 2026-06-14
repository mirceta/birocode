using ClaudeWeb.Services.Deploy;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Deployments tab, slice 1 (plans/deployments-tab.md). Behind the global
/// session+IP gate like everything under /api. Operator-only in the UI.
///   GET  /api/deploy/status   -- what's live, armed-rollback state, history
///   POST /api/deploy/keep     -- disarm the auto-rollback ("Keep it")
///   POST /api/deploy/rollback -- run rollback.ps1 now (destructive; the UI
///                                requires a typed confirm before calling)
/// </summary>
[ApiController]
[Route("api/deploy")]
public class DeployController : ControllerBase
{
    private readonly DeployService _deploy;
    private readonly Logger _logger;

    public DeployController(DeployService deploy, Logger logger)
    {
        _deploy = deploy;
        _logger = logger;
    }

    [HttpGet("status")]
    public IActionResult Status()
    {
        _logger.CountRequest();
        return Ok(_deploy.GetStatus());
    }

    [HttpPost("keep")]
    public IActionResult Keep()
    {
        _logger.CountRequest();
        return Ok(new { disarmed = _deploy.Disarm() });
    }

    public record PullMainRequest(string? Confirm, bool? NoSwap);

    /// <summary>
    /// POST /api/deploy/pull-main -- redeploy live from the latest origin/main
    /// without switching the current branch checkout (plans/pull-main-redeploy.md,
    /// option A). Restarts live, so — like rollback — it requires a typed confirm
    /// at the backend too, not just in the UI. Pass {"noSwap":true} to dry-run
    /// (build + health-check origin/main, leave live untouched).
    /// </summary>
    [HttpPost("pull-main")]
    public IActionResult PullMain([FromBody] PullMainRequest? request)
    {
        _logger.CountRequest();
        if (!string.Equals(request?.Confirm, "DEPLOY-MAIN", StringComparison.Ordinal))
            return BadRequest(new { error = "Type DEPLOY-MAIN to confirm." });
        var r = _deploy.PullMainRedeploy(request?.NoSwap ?? false);
        return r.Deploying
            ? Ok(new { deploying = true, mainCommit = r.MainCommit, noSwap = request?.NoSwap ?? false })
            : UnprocessableEntity(new { error = r.Error });
    }

    public record RollbackRequest(string? Confirm);

    [HttpPost("rollback")]
    public IActionResult Rollback([FromBody] RollbackRequest? request)
    {
        _logger.CountRequest();
        // Defence in depth: the UI gates this behind a typed confirm, and so
        // does the backend — a stray POST can't restart live.
        if (!string.Equals(request?.Confirm, "ROLLBACK", StringComparison.Ordinal))
            return BadRequest(new { error = "Type ROLLBACK to confirm." });
        _deploy.TriggerRollback();
        return Ok(new { rollingBack = true });
    }
}
