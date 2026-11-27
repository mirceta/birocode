using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Settings;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The Status tab's pinned agents, on the hub (fleet task 61a0d521):
///   GET  /api/settings/status-pins            -> { pins: [{ sourceId, repoId, machine, name, pinnedAt }] }  (pin order)
///   POST /api/settings/status-pins            { sourceId, repoId, pinned, machine?, name? } -> { pins }   idempotent
///   PUT  /api/settings/status-pins/order      { keys: ["sourceId|repoId", …] } -> { pins }
/// Auth: the global password middleware.
/// </summary>
[ApiController]
[Route("api/settings/status-pins")]
public class StatusPinsController : ControllerBase
{
    private readonly StatusPinsService _pins;
    private readonly Logger _logger;

    public StatusPinsController(StatusPinsService pins, Logger logger) { _pins = pins; _logger = logger; }

    [HttpGet]
    public IActionResult Get()
    {
        _logger.CountRequest();
        return Ok(new { pins = _pins.List() });
    }

    public sealed record PinRequest(string? SourceId, string? RepoId, bool Pinned, string? Machine, string? Name);

    [HttpPost]
    public IActionResult Set([FromBody] PinRequest? req)
    {
        _logger.CountRequest();
        var (pins, error) = _pins.Set(req?.SourceId, req?.RepoId, req?.Pinned ?? false, req?.Machine, req?.Name, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        return error is null ? Ok(new { pins }) : BadRequest(new { error, pins });
    }

    public sealed record OrderRequest(List<string>? Keys);

    [HttpPut("order")]
    public IActionResult Order([FromBody] OrderRequest? req)
    {
        _logger.CountRequest();
        return Ok(new { pins = _pins.Reorder(req?.Keys) });
    }
}
