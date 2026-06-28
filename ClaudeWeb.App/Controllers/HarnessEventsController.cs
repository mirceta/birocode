using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Read the harness-wide event feed (openspec change add-harness-event-feed).
/// Auto-discovered by AddControllers(). This is the pilot's single, READ-ONLY
/// surface for an outside observer — the in-repo consumer app today, a
/// cross-harness collector service later — to watch what happens inside the
/// harness, starting with agent turns ending.
///
///   GET /api/events?after=N
///     -> { events: [{ seq, at, type, source, data }], lastSeq }
///
/// Watermark polling, exactly like the per-repo Event Console
/// (<see cref="RepoEventsController"/>): hold the highest seq seen, ask only for
/// events newer than it. An <c>after</c> of -1 (or absent) returns the full
/// retained feed.
///
/// STRICTLY read-only: a GET with no side effects, no mutation, no harness action.
/// It is behind the normal session auth like every other /api route
/// (PasswordAuthMiddleware) — this change adds no new action endpoint and exposes
/// no harness action over REST. The feed only reports; it never causes.
/// </summary>
[ApiController]
[Route("api/events")]
public class HarnessEventsController : ControllerBase
{
    private readonly HarnessEventFeed _feed;
    private readonly Logger _logger;

    public HarnessEventsController(HarnessEventFeed feed, Logger logger)
    {
        _feed = feed;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult Events([FromQuery] int after = -1)
    {
        _logger.CountRequest();

        var (events, lastSeq) = _feed.Read(after);
        return Ok(new
        {
            events = events.Select(e => new
            {
                seq = e.Seq,
                at = e.At,
                type = e.Type,
                source = e.Source,
                data = e.Data,
            }),
            lastSeq,
        });
    }
}
