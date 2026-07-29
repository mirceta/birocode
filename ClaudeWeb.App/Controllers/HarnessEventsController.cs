using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The harness-wide event feed (openspec change add-harness-event-feed).
/// Auto-discovered by AddControllers(). This is the pilot's single surface for
/// an outside observer — the in-repo consumer app today, a cross-harness
/// collector service later — to watch what happens inside the harness.
///
///   GET /api/events?after=N
///     -> { events: [{ seq, at, type, source, data }], lastSeq }
///
/// Watermark polling, exactly like the per-repo Event Console
/// (<see cref="RepoEventsController"/>): hold the highest seq seen, ask only for
/// events newer than it. An <c>after</c> of -1 (or absent) returns the full
/// retained feed. The read is a GET with no side effects, behind the normal
/// session auth like every other /api route (PasswordAuthMiddleware).
///
/// One deliberate exception to "read-only" (openspec change add-chat-focus-event):
/// POST /api/events/chat-focus, the feed's single FIXED-TYPE publish endpoint.
/// The browser is the only place that can observe the End User focusing a dock's
/// chat composer, so the client reports it here and the server publishes a
/// <c>chat.focus</c> event. The type is fixed server-side and the repo comes from
/// the request's own repo context — a caller cannot publish arbitrary types or
/// forge turn events. Appending that one best-effort event is the endpoint's
/// entire effect; it still causes no harness action.
/// </summary>
[ApiController]
[Route("api/events")]
public class HarnessEventsController : ControllerBase
{
    private readonly HarnessEventFeed _feed;
    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public HarnessEventsController(HarnessEventFeed feed, RepositoryResolver repos, Logger logger)
    {
        _feed = feed;
        _repos = repos;
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

    /// <summary>Optional dock context sent by the composer; never a type or a source.</summary>
    public sealed record ChatFocusBody(string? TabId);

    [HttpPost("chat-focus")]
    public IActionResult ChatFocus([FromBody] ChatFocusBody? body)
    {
        _logger.CountRequest();

        // Same repo resolution as every scoped route: X-Repo-Id header via
        // RepositoryResolver, falling back to the registry default.
        var repo = _repos.Current();
        _feed.Publish(
            "chat.focus",
            source: new { repoId = repo?.Id ?? "", repoName = repo?.Name ?? "" },
            data: new { tabId = body?.TabId ?? "" });
        return NoContent();
    }
}
