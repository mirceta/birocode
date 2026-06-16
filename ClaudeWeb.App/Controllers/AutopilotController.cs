using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Loop-autopilot (plans/loop-autopilot.md), Slice 1 — DISCOVER the user's
/// recurring "routine" prompts from the transcripts already on disk. Read-only:
///   GET /api/autopilot/discover  -- the recurring prompts, most-repeated first
/// GLOBAL (no X-Repo-Id): discovery spans every registered repo, because routine
/// prompts ("deploy", "keep it", "yes") recur across projects.
/// </summary>
[ApiController]
[Route("api/autopilot")]
public class AutopilotController : ControllerBase
{
    private readonly AutopilotDiscoveryService _discovery;
    private readonly Logger _logger;

    public AutopilotController(AutopilotDiscoveryService discovery, Logger logger)
    {
        _discovery = discovery;
        _logger = logger;
    }

    [HttpGet("discover")]
    public IActionResult Discover()
    {
        _logger.CountRequest();
        return Ok(_discovery.Discover());
    }
}
