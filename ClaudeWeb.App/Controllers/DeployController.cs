using ClaudeWeb.Services.Deploy;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Deployments tab (plans/deployments-tab.md; openspec deploy-final-no-deadman). Behind
/// the global session+IP gate like everything under /api. Operator-only in the UI.
///   GET  /api/deploy/status   -- what's live, whether a manual rollback point exists, history
///   POST /api/deploy/rollback -- run rollback.ps1 now (destructive; the UI
///                                requires a typed confirm before calling)
/// A healthy deploy is final: there is no timer to disarm and therefore no keep route.
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
