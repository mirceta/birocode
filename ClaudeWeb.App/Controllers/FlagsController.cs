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
/// no config, no action surface beyond dismissing an entry and the channel
/// on/off switch (the same class of control as parking a briefing rule).
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

    // One payload shape for every endpoint, so any mutation reconciles the whole
    // surface (footer, dock badges, console history) in one round trip. The
    // dismissed list is the audit trail — a dismissal moves an entry there, it
    // never silently disappears (bounded only by the ledger's overall cap).
    private object Payload() => new
    {
        enabled = _flags.Enabled,
        flags = _flags.Open(),
        dismissed = _flags.Dismissed(),
    };

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        return Ok(Payload());
    }

    [HttpPost("{id}/dismiss")]
    public IActionResult Dismiss(string id)
    {
        _logger.CountRequest();
        if (!_flags.Dismiss(id))
            return NotFound(new { error = $"no open flag \"{id}\"" });
        return Ok(Payload());
    }

    public sealed record EnabledReq(bool? Enabled);

    /// <summary>The FLAG: channel switch — off removes the teaching line from
    /// every subsequent driven send's briefing AND stops mining replies; already
    /// open flags stay listed until dismissed. Session-auth like the rest of this
    /// controller: it is the same class of control as parking a briefing rule.</summary>
    [HttpPost("enabled")]
    public IActionResult SetEnabled([FromBody] EnabledReq req)
    {
        _logger.CountRequest();
        if (req?.Enabled is not { } enabled)
            return BadRequest(new { error = "missing enabled" });
        _flags.SetEnabled(enabled);
        return Ok(Payload());
    }
}
