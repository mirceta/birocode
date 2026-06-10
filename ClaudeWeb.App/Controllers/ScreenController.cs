using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Screen;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Host-desktop snapshot endpoints for the Screen tab (plans/screen-tab.md).
/// Repo-independent: captures the Operator's desktop, not a repository.
///   GET /api/screen/windows -- visible top-level windows [{ hwnd, title }]
///   GET /api/screen?hwnd=N  -- JPEG snapshot (whole desktop when no hwnd)
/// </summary>
[ApiController]
[Route("api/screen")]
public class ScreenController : ControllerBase
{
    private readonly ScreenService _screen;
    private readonly Logger _logger;

    public ScreenController(ScreenService screen, Logger logger)
    {
        _screen = screen;
        _logger = logger;
    }

    /// <summary>GET /api/screen/windows -- capturable window list.</summary>
    [HttpGet("windows")]
    public IActionResult Windows()
    {
        _logger.CountRequest();
        try
        {
            var windows = _screen.ListWindows()
                .Select(w => new { hwnd = w.Hwnd, title = w.Title });
            return Ok(windows);
        }
        catch (Exception ex)
        {
            _logger.Error($"[SCREEN] Window list failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/screen -- JPEG snapshot of the desktop or one window.</summary>
    [HttpGet]
    public IActionResult Snapshot([FromQuery] long? hwnd)
    {
        _logger.CountRequest();
        try
        {
            var jpeg = _screen.Capture(hwnd);
            return File(jpeg, "image/jpeg");
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.Error($"[SCREEN] Capture failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
