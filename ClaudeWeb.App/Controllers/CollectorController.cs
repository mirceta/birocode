using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Manage and read the event-feed COLLECTOR (openspec change add-event-feed-collector).
/// Auto-discovered by AddControllers(); behind the usual session auth like every /api route.
///
///   GET    /api/collector/sources            -> [{ id, label, address, kind, active, status, lastSeq, lastError, lastPolledAt }]
///   POST   /api/collector/sources            { address, label?, credential? } -> the new source
///   POST   /api/collector/sources/{id}/start -> { ok }
///   POST   /api/collector/sources/{id}/stop  -> { ok }
///   DELETE /api/collector/sources/{id}       -> { ok }   (the built-in self source is non-removable)
///   GET    /api/collector/events?after=N     -> { events: [{ seq, at, type, source, data, sourceId, sourceLabel }], lastSeq }
///
/// These endpoints mutate only the collector's OWN subscription list — they never cause or
/// expose an action on a watched harness (the collector only ever GETs a source's feed).
/// A source's credential is write-only: accepted on add, encrypted at rest, and NEVER
/// returned in any response.
/// </summary>
[ApiController]
[Route("api/collector")]
public class CollectorController : ControllerBase
{
    private readonly CollectorService _collector;
    private readonly HostEventSound _hostSound;
    private readonly Logger _logger;

    public CollectorController(CollectorService collector, HostEventSound hostSound, Logger logger)
    {
        _collector = collector;
        _hostSound = hostSound;
        _logger = logger;
    }

    public sealed record AddSourceRequest(string? Address, string? Label, string? Credential);
    public sealed record SoundRequest(bool On);

    [HttpGet("sources")]
    public IActionResult Sources()
    {
        _logger.CountRequest();
        return Ok(_collector.ListSources());
    }

    [HttpPost("sources")]
    public async Task<IActionResult> AddSource([FromBody] AddSourceRequest? req)
    {
        _logger.CountRequest();
        try
        {
            // No request-abort token: a quick client disconnect must not cancel the
            // add-time probe (it is bounded by the HttpClient timeout instead).
            var view = await _collector.AddSourceAsync(req?.Address, req?.Label, req?.Credential);
            return Ok(view);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("sources/{id}/start")]
    public IActionResult Start(string id)
    {
        _logger.CountRequest();
        return _collector.SetActive(id, true)
            ? Ok(new { ok = true })
            : NotFound(new { error = "No such source." });
    }

    [HttpPost("sources/{id}/stop")]
    public IActionResult Stop(string id)
    {
        _logger.CountRequest();
        return _collector.SetActive(id, false)
            ? Ok(new { ok = true })
            : NotFound(new { error = "No such source." });
    }

    [HttpDelete("sources/{id}")]
    public IActionResult Remove(string id)
    {
        _logger.CountRequest();
        if (id == CollectorService.SelfId)
            return BadRequest(new { error = "The self source cannot be removed." });
        return _collector.Remove(id)
            ? Ok(new { ok = true })
            : NotFound(new { error = "No such source (or it is non-removable)." });
    }

    [HttpGet("events")]
    public IActionResult Events([FromQuery] int after = -1)
    {
        _logger.CountRequest();
        var (events, lastSeq) = _collector.ReadEvents(after);
        return Ok(new { events, lastSeq });
    }

    // Host-side beep on each new event (openspec add-event-feed-collector): plays on the
    // computer running the harness, independent of any browser. Operator-toggled, persisted.
    [HttpGet("sound")]
    public IActionResult GetSound()
    {
        _logger.CountRequest();
        return Ok(new { on = _hostSound.Enabled });
    }

    [HttpPost("sound")]
    public IActionResult SetSound([FromBody] SoundRequest? req)
    {
        _logger.CountRequest();
        _hostSound.SetEnabled(req?.On ?? false);
        return Ok(new { on = _hostSound.Enabled });
    }

    // Play the host sound right now (ignores the on/off toggle) — to verify audio works.
    [HttpPost("sound/test")]
    public IActionResult TestSound()
    {
        _logger.CountRequest();
        _hostSound.PlayNow();
        return Ok(new { ok = true });
    }
}
