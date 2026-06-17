using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Loop-autopilot API (plans/loop-autopilot.md). GLOBAL (no X-Repo-Id): autopilot
/// spans every registered repo, because routine prompts ("deploy", "keep it", "yes")
/// recur across projects.
///   GET  /api/autopilot/discover  — Slice 1: the recurring prompts, most-repeated first
///   GET  /api/autopilot           — Slice 2: config + per-agent state + recent log
///   POST /api/autopilot/config    — arm/disarm an agent, set threshold, kill switch
/// </summary>
[ApiController]
[Route("api/autopilot")]
public class AutopilotController : ControllerBase
{
    private readonly AutopilotDiscoveryService _discovery;
    private readonly AutopilotService _engine;
    private readonly AutopilotConfigStore _config;
    private readonly Logger _logger;

    public AutopilotController(
        AutopilotDiscoveryService discovery, AutopilotService engine,
        AutopilotConfigStore config, Logger logger)
    {
        _discovery = discovery;
        _engine = engine;
        _config = config;
        _logger = logger;
    }

    [HttpGet("discover")]
    public IActionResult Discover()
    {
        _logger.CountRequest();
        return Ok(_discovery.Discover());
    }

    /// <summary>Live state for the Autopilot tab: the gate config, every agent's
    /// current verdict, and the recent suggestion log.</summary>
    [HttpGet]
    public IActionResult State()
    {
        _logger.CountRequest();
        return Ok(BuildState());
    }

    public sealed record ConfigRequest(string? RepoId, bool? Armed, double? Threshold, bool? Enabled);

    /// <summary>Mutates one or more settings per call. Returns the new state so the
    /// UI can reconcile without a second round-trip.</summary>
    [HttpPost("config")]
    public IActionResult Config([FromBody] ConfigRequest req)
    {
        _logger.CountRequest();
        if (req is null) return BadRequest(new { error = "missing body" });

        if (req.Enabled is bool enabled) _config.SetEnabled(enabled);
        if (req.Threshold is double threshold) _config.SetThreshold(threshold);
        if (!string.IsNullOrEmpty(req.RepoId) && req.Armed is bool armed) _config.SetArmed(req.RepoId, armed);

        return Ok(BuildState());
    }

    private object BuildState()
    {
        var cfg = _config.Get();
        return new
        {
            enabled = cfg.Enabled,
            threshold = cfg.Threshold,
            denyList = cfg.DenyList,
            agents = _engine.States(),
            log = _engine.Log(),
        };
    }
}
