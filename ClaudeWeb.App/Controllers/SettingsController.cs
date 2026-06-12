using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Settings;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Backend-synced UI settings (plans/settings-tab.md).
///   GET /api/settings/ui -- { tabOrder: [...] } (empty = default order)
///   PUT /api/settings/ui -- save; unknown tab keys are dropped, duplicates
///                           collapsed. Auth: global middleware as always.
/// </summary>
[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    // Canonical tab keys — mirror client/src/layout/tabRegistry.jsx.
    private static readonly HashSet<string> KnownTabs = new()
    {
        "claude", "files", "plan", "git", "history",
        "agents", "screen", "projects", "guests", "app", "settings",
    };

    private readonly UiSettingsService _settings;
    private readonly Logger _logger;

    public SettingsController(UiSettingsService settings, Logger logger)
    {
        _settings = settings;
        _logger = logger;
    }

    public record UiSettingsRequest(List<string>? TabOrder);

    [HttpGet("ui")]
    public IActionResult Get()
    {
        _logger.CountRequest();
        return Ok(new { tabOrder = _settings.TabOrder });
    }

    [HttpPut("ui")]
    public IActionResult Put([FromBody] UiSettingsRequest? request)
    {
        _logger.CountRequest();
        if (request?.TabOrder is null)
            return BadRequest(new { error = "tabOrder is required (empty list = default order)" });

        var cleaned = request.TabOrder
            .Where(KnownTabs.Contains)
            .Distinct()
            .ToList();
        _settings.SetTabOrder(cleaned);
        return Ok(new { tabOrder = cleaned });
    }
}
