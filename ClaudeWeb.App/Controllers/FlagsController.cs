using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The agent-flags ledger API (docs/loop-driven-agent-convention.md,
/// "Non-blocking flags"): the web app's footer lists every undismissed
/// <c>FLAG:</c> line lifted from driven-loop replies, and dismiss is the human's
/// "seen it" tap. GLOBAL like /api/autopilot (a flag names its repo), and
/// deliberately session-auth only, NOT operator-gated: flag text follows the
/// StopDetail precedent (the NEEDS_HUMAN question already shows verbatim on the
/// ungated dashboard) — agent-authored text written for the human, no prompts,
/// no config, no action surface beyond dismissing an entry.
/// </summary>
[ApiController]
[Route("api/flags")]
public class FlagsController : ControllerBase
{
    private readonly FlagsStore _flags;
    private readonly Logger _logger;

    public FlagsController(FlagsStore flags, Logger logger)
    {
        _flags = flags;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        return Ok(new { flags = _flags.Open() });
    }

    [HttpPost("{id}/dismiss")]
    public IActionResult Dismiss(string id)
    {
        _logger.CountRequest();
        if (!_flags.Dismiss(id))
            return NotFound(new { error = $"no open flag \"{id}\"" });
        return Ok(new { flags = _flags.Open() });
    }
}
