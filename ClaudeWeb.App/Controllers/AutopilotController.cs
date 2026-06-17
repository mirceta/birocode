using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Loop-autopilot API (plans/loop-autopilot.md). GLOBAL (no X-Repo-Id): autopilot
/// spans every registered repo, because routine prompts ("deploy", "keep it", "yes")
/// recur across projects.
///   GET  /api/autopilot/discover  — Slice 1: the recurring prompts, most-repeated first
///   GET  /api/autopilot           — Slice 2: config + per-agent state + recent log
///   POST /api/autopilot/config    — arm/disarm an agent, set threshold, kill switch
///
/// OPERATOR GATE (plans/loop-autopilot-safety.md): EVERY endpoint here is fenced by
/// <see cref="AutopilotGate"/>. When the host has the gate OFF (the default), all
/// of them return 403 — there is DELIBERATELY no endpoint that can turn the gate on
/// (that lives only in the WinForms host), so a steered web client or
/// prompt-injected brain can never grant autopilot the authority to act.
/// </summary>
[ApiController]
[Route("api/autopilot")]
public class AutopilotController : ControllerBase
{
    private readonly AutopilotDiscoveryService _discovery;
    private readonly AutopilotService _engine;
    private readonly AutopilotConfigStore _config;
    private readonly AutopilotGate _operatorGate;
    private readonly AutopilotAuditLog _audit;
    private readonly Logger _logger;

    public AutopilotController(
        AutopilotDiscoveryService discovery, AutopilotService engine,
        AutopilotConfigStore config, AutopilotGate operatorGate,
        AutopilotAuditLog audit, Logger logger)
    {
        _discovery = discovery;
        _engine = engine;
        _config = config;
        _operatorGate = operatorGate;
        _audit = audit;
        _logger = logger;
    }

    // 403 with a machine-readable marker the local app renders as an explicit
    // "disabled by the operator" state. Returned before any work is done.
    private IActionResult? GateClosed() =>
        _operatorGate.Enabled
            ? null
            : StatusCode(StatusCodes.Status403Forbidden,
                new { error = "Autopilot is disabled by the operator.", gate = "operator-off" });

    [HttpGet("discover")]
    public IActionResult Discover()
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        return Ok(_discovery.Discover());
    }

    /// <summary>Live state for the Autopilot tab: the gate config, every agent's
    /// current verdict, and the recent suggestion log.</summary>
    [HttpGet]
    public IActionResult State()
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        return Ok(BuildState());
    }

    public sealed record ConfigRequest(string? RepoId, bool? Armed, double? Threshold, bool? Enabled, bool? AutoAdvance);

    /// <summary>Mutates one or more settings per call. Returns the new state so the
    /// UI can reconcile without a second round-trip.</summary>
    [HttpPost("config")]
    public IActionResult Config([FromBody] ConfigRequest req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (req is null) return BadRequest(new { error = "missing body" });

        if (req.Enabled is bool enabled) _config.SetEnabled(enabled);
        if (req.AutoAdvance is bool autoAdvance) _config.SetAutoAdvance(autoAdvance);
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
            autoAdvance = cfg.AutoAdvance,
            threshold = cfg.Threshold,
            denyList = cfg.DenyList,
            agents = _engine.States(),
            log = _engine.Log(),
            intercepts = _engine.Intercepts(),
            audit = _audit.Recent(),
            // The brain's actual label space (mined from history), so the UI can show
            // exactly what autopilot may send — label + trigger words + base confidence.
            routines = _engine.Routines().Select(r => new
            {
                label = r.Label,
                triggers = r.Triggers,
                baseConfidence = r.BaseConfidence,
            }),
        };
    }
}
