using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Settings;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The Management dashboard's layout presets, hub copy (fleet task d6e499cd):
///   GET /api/settings/view-presets -- { presets: [...], savedAt } (empty + 0 when never saved)
///   PUT /api/settings/view-presets -- { presets: [...] } replaces the list (normalised), returns it.
/// The browser decides what to PUT (its own copy wins a conflict). Auth: the global middleware.
/// </summary>
[ApiController]
[Route("api/settings/view-presets")]
public class ViewPresetsController : ControllerBase
{
    private readonly ViewPresetsService _presets;
    private readonly Logger _logger;

    public ViewPresetsController(ViewPresetsService presets, Logger logger)
    {
        _presets = presets;
        _logger = logger;
    }

    public record SaveRequest(List<ViewPresetsService.Preset?>? Presets);

    [HttpGet]
    public IActionResult Get()
    {
        _logger.CountRequest();
        return Ok(_presets.Get());
    }

    [HttpPut]
    public IActionResult Save([FromBody] SaveRequest? request)
    {
        _logger.CountRequest();
        if (request?.Presets is null) return BadRequest(new { error = "presets (a list) is required." });
        return Ok(_presets.Save(request.Presets, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));
    }
}
