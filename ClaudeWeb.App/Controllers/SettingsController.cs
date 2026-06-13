using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Settings;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Backend-synced UI settings (plans/settings-tab.md, plans/pane-widths.md).
///   GET /api/settings/ui -- { tabOrder: [...], tabWidths: { key: 1-4 } }
///                           (empty = defaults: registry order, width 1)
///   PUT /api/settings/ui -- save; unknown tab keys are dropped, duplicates
///                           collapsed, widths clamped to 1-4 (1 = omitted).
///                           Auth: global middleware as always.
/// </summary>
[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    // Canonical tab keys — mirror client/src/layout/tabRegistry.jsx.
    private static readonly HashSet<string> KnownTabs = new()
    {
        "claude", "files", "plan", "git", "history",
        "agents", "screen", "projects", "guests", "app", "localapp", "settings",
    };

    private readonly UiSettingsService _settings;
    private readonly Logger _logger;

    public SettingsController(UiSettingsService settings, Logger logger)
    {
        _settings = settings;
        _logger = logger;
    }

    // claude (home slot) and settings (the toggle UI itself) can never be
    // hidden — hiding them would strand the user (plans/tab-visibility.md).
    private static readonly HashSet<string> NonHideable = new() { "claude", "settings" };

    public record UiSettingsRequest(List<string>? TabOrder, Dictionary<string, int>? TabWidths, List<string>? HiddenTabs);

    [HttpGet("ui")]
    public IActionResult Get()
    {
        _logger.CountRequest();
        return Ok(new { tabOrder = _settings.TabOrder, tabWidths = _settings.TabWidths, hiddenTabs = _settings.HiddenTabs });
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

        if (request.TabWidths != null)
        {
            var widths = request.TabWidths
                .Where(kv => KnownTabs.Contains(kv.Key))
                .Select(kv => (kv.Key, Value: Math.Clamp(kv.Value, 1, 4)))
                .Where(kv => kv.Value > 1) // width 1 is the default — keep the store sparse
                .ToDictionary(kv => kv.Key, kv => kv.Value);
            _settings.SetTabWidths(widths);
        }

        if (request.HiddenTabs != null)
        {
            var hidden = request.HiddenTabs
                .Where(KnownTabs.Contains)
                .Where(k => !NonHideable.Contains(k))
                .Distinct()
                .ToList();
            _settings.SetHiddenTabs(hidden);
        }

        return Ok(new { tabOrder = cleaned, tabWidths = _settings.TabWidths, hiddenTabs = _settings.HiddenTabs });
    }
}
