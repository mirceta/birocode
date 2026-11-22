using ClaudeWeb.Services.LocalApps;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Local-app autostart + sentry (fleet task f88f97fe, openspec local-apps-autostart-sentry) — the Management
/// dashboard's "Local apps" tab talks to its home harness (the hub) only:
///   GET  /api/local-apps/autostart/fleet?fresh=     -> { machines: [MachineView], attention }
///   GET  /api/local-apps/autostart/summary          -> { attention, flagged, … }   (the tab badge; cached peer reads)
///   PUT  /api/local-apps/autostart/flag             { machine, repoId, appId, autostart, healthUrl?, expectStatus?, order, delaySec, startCommand?, folder? }
///   PUT  /api/local-apps/autostart/settings         { intervalMin, cooldownMin }
///   POST /api/local-apps/autostart/apply            { machine }   start the flagged apps that are down
///   POST /api/local-apps/autostart/check            { machine }   one sentry pass now
/// Auth: the global password middleware.
/// </summary>
[ApiController]
[Route("api/local-apps/autostart")]
public class LocalAppsAutostartController : ControllerBase
{
    private readonly LocalAppsFleet _fleet;
    private readonly Logger _logger;

    public LocalAppsAutostartController(LocalAppsFleet fleet, Logger logger) { _fleet = fleet; _logger = logger; }

    [HttpGet("fleet")]
    public IActionResult Fleet([FromQuery] bool fresh = false)
    {
        _logger.CountRequest();
        var machines = _fleet.Overview(fresh);
        return Ok(new { machines, attention = machines.Sum(m => m.Down + m.Failing) });
    }

    [HttpGet("summary")]
    public IActionResult Summary()
    {
        _logger.CountRequest();
        var machines = _fleet.Overview(fresh: false);
        return Ok(new
        {
            attention = machines.Sum(m => m.Down + m.Failing),
            flagged = machines.Sum(m => m.Flagged), up = machines.Sum(m => m.Up), down = machines.Sum(m => m.Down), failing = machines.Sum(m => m.Failing),
        });
    }

    public sealed record FlagRequest(string? Machine, string? RepoId, string? AppId, bool Autostart, string? HealthUrl, int? ExpectStatus,
        int Order = 0, int DelaySec = 0, string? StartCommand = null, string? Folder = null);

    [HttpPut("flag")]
    public IActionResult Flag([FromBody] FlagRequest? req)
    {
        _logger.CountRequest();
        if (req is null || string.IsNullOrWhiteSpace(req.RepoId) || string.IsNullOrWhiteSpace(req.AppId))
            return BadRequest(new { error = "repoId and appId are required" });
        var (o, machine) = _fleet.SetFlag(req.Machine ?? "self", new AutostartFlag(req.RepoId, req.AppId, req.Autostart, req.HealthUrl, req.ExpectStatus, req.Order, req.DelaySec, req.StartCommand, req.Folder));
        if (o.Status == "not-found") return NotFound(new { error = o.Detail });
        // Saved on the hub either way; a peer that could not be reached gets it when it next answers.
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, machine, saved = true });
    }

    [HttpPut("settings")]
    public IActionResult Settings([FromBody] SentrySettings? req)
    {
        _logger.CountRequest();
        if (req is null) return BadRequest(new { error = "intervalMin / cooldownMin required" });
        return Ok(new { settings = _fleet.SetSettings(req) });
    }

    public sealed record MachineRequest(string? Machine);

    [HttpPost("apply")]
    public async Task<IActionResult> Apply([FromBody] MachineRequest? req)
    {
        _logger.CountRequest();
        var o = await _fleet.RunAsync(req?.Machine ?? "self", apply: true, HttpContext.RequestAborted);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail });
    }

    [HttpPost("check")]
    public async Task<IActionResult> Check([FromBody] MachineRequest? req)
    {
        _logger.CountRequest();
        var o = await _fleet.RunAsync(req?.Machine ?? "self", apply: false, HttpContext.RequestAborted);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail });
    }
}
