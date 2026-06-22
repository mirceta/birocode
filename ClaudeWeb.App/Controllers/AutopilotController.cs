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
    private readonly LoopConfigStore _loops;
    private readonly AutopilotGate _operatorGate;
    private readonly AutopilotAuditLog _audit;
    private readonly SystemTestsService _systests;
    private readonly Logger _logger;

    public AutopilotController(
        AutopilotDiscoveryService discovery, AutopilotService engine,
        AutopilotConfigStore config, LoopConfigStore loops, AutopilotGate operatorGate,
        AutopilotAuditLog audit, SystemTestsService systests, Logger logger)
    {
        _discovery = discovery;
        _engine = engine;
        _config = config;
        _loops = loops;
        _operatorGate = operatorGate;
        _audit = audit;
        _systests = systests;
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

    public sealed record LoopRequest(
        string? RepoId, string? Action, string? Prompt, string? Sentinel, int? MaxIterations);

    /// <summary>Loop mode (plans/autopilot-loop-mode.md): arm / edit / stop the
    /// per-agent fixed-prompt resend loop. <c>action</c> = start | update | stop.
    /// Gated like every other autopilot endpoint; returns the fresh state.</summary>
    [HttpPost("loop")]
    public IActionResult Loop([FromBody] LoopRequest req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (req is null || string.IsNullOrWhiteSpace(req.RepoId))
            return BadRequest(new { error = "missing repoId" });

        switch ((req.Action ?? "start").ToLowerInvariant())
        {
            case "start":
                if (string.IsNullOrWhiteSpace(req.Prompt))
                    return BadRequest(new { error = "a loop needs a prompt to resend" });
                _loops.Start(req.RepoId, req.Prompt.Trim(), req.Sentinel, req.MaxIterations);
                break;
            case "update":
                _loops.Update(req.RepoId, req.Prompt, req.Sentinel, req.MaxIterations);
                break;
            case "stop":
                _loops.Stop(req.RepoId);
                break;
            default:
                return BadRequest(new { error = $"unknown action \"{req.Action}\"" });
        }

        return Ok(BuildState());
    }

    // --- System tests (understanding.md: real-runner) -----------------------
    // The loop-mode tests, runnable one-click from the System Tests tab. Each
    // spawns a fixed Node/Playwright script against THIS harness; node (and, for
    // the browser tests, Playwright) must be installed on the host or the run
    // reports an honest error. Gated like everything else here.

    /// <summary>GET — every test plus its live/last run state (status, output,
    /// exit code, screenshot readiness).</summary>
    [HttpGet("systests")]
    public IActionResult SysTests()
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        return Ok(new { tests = _systests.Snapshot() });
    }

    /// <summary>POST — start one test by id. Returns immediately; the UI polls
    /// the list endpoint for progress.</summary>
    [HttpPost("systests/{id}/run")]
    public IActionResult RunSysTest(string id)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (!_systests.Start(id)) return NotFound(new { error = $"unknown test \"{id}\"" });
        return Ok(new { tests = _systests.Snapshot() });
    }

    /// <summary>GET — the PNG screenshot a browser test wrote, if it exists.</summary>
    [HttpGet("systests/{id}/artifact")]
    public IActionResult SysTestArtifact(string id)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        var path = _systests.ArtifactPath(id);
        if (path is null || !System.IO.File.Exists(path))
            return NotFound(new { error = "no screenshot yet — run the test first" });
        // no-store so each re-run's fresh screenshot shows on reload.
        Response.Headers["Cache-Control"] = "no-store";
        return PhysicalFile(path, "image/png");
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
            loops = _loops.All(),
            log = _engine.Log(),
            intercepts = _engine.Intercepts(),
            audit = _audit.Recent(),
            // The brain's actual label space (the user's editable custom prompts,
            // enriched by mining), so the UI can show exactly what autopilot may send —
            // label + trigger words + base confidence.
            routines = _engine.Routines().Select(r => new
            {
                label = r.Label,
                triggers = r.Triggers,
                baseConfidence = r.BaseConfidence,
            }),
        };
    }
}
