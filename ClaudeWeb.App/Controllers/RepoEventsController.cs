using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Read the per-repo Event Console log (openspec change agent-dock-event-console).
/// Auto-discovered by AddControllers(). The dock's Console lane polls this at the
/// dock cadence, holding a sequence watermark and asking only for events newer
/// than it — the same <c>?after=N</c> reattach contract chat and discovery-status
/// use.
///
///   GET /api/repos/{repoId}/events?after=N
///     -> { events: [{ seq, at, op, phase, title, detail }], lastSeq }
///
/// The repo is named explicitly in the path (the lane knows its own repo id), not
/// via X-Repo-Id — two docks on the same repo read the same log. Read-only and
/// behind the normal session auth like every other /api route; not gated by the
/// autopilot operator gate (these are ordinary harness operations, not
/// auto-driving). An <c>after</c> of -1 (or absent) returns the full retained log.
/// </summary>
[ApiController]
[Route("api/repos")]
public class RepoEventsController : ControllerBase
{
    private readonly RepoEventLog _log;
    private readonly Logger _logger;

    public RepoEventsController(RepoEventLog log, Logger logger)
    {
        _log = log;
        _logger = logger;
    }

    [HttpGet("{repoId}/events")]
    public IActionResult Events(string repoId, [FromQuery] int after = -1)
    {
        _logger.CountRequest();

        var (events, lastSeq) = _log.Read(repoId, after);
        return Ok(new
        {
            events = events.Select(e => new
            {
                seq = e.Seq,
                at = e.At,
                op = e.Op,
                phase = e.Phase,
                title = e.Title,
                detail = e.Detail,
            }),
            lastSeq,
        });
    }
}
