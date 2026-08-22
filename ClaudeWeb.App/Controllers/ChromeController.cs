using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Claude-in-Chrome integration status (openspec claude-in-chrome). Behind the
/// global session+IP gate like everything under /api.
///   GET /api/chrome/status -- can browser mode work on this host, and is the
///                             single-holder pipe currently taken by a run
/// </summary>
[ApiController]
[Route("api/chrome")]
public class ChromeController : ControllerBase
{
    private readonly ChromeGateService _chrome;
    private readonly Logger _logger;

    public ChromeController(ChromeGateService chrome, Logger logger)
    {
        _chrome = chrome;
        _logger = logger;
    }

    [HttpGet("status")]
    public IActionResult Status()
    {
        _logger.CountRequest();
        var hostRegistered = _chrome.HostRegistered();
        var cliSupported = _chrome.CliSupported();
        var (busy, repo) = _chrome.BusyState();
        return Ok(new
        {
            available = hostRegistered && cliSupported,
            hostRegistered,
            cliSupported,
            busy,
            busyRepo = repo,
        });
    }
}
