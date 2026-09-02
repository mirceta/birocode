using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Manage and read the event-feed COLLECTOR (openspec change add-event-feed-collector).
/// Auto-discovered by AddControllers(); behind the usual session auth like every /api route.
///
///   GET    /api/collector/sources            -> [{ id, label, address, kind, active, status, lastSeq, lastError, lastPolledAt }]
///   POST   /api/collector/sources            { address, label, credential? } -> the new source (label required)
///   POST   /api/collector/sources/{id}/start -> { ok }
///   POST   /api/collector/sources/{id}/stop  -> { ok }
///   DELETE /api/collector/sources/{id}       -> { ok }   (the built-in self source is non-removable)
///   GET    /api/collector/events?after=N     -> { events: [{ seq, at, type, source, data, sourceId, sourceLabel }], lastSeq }
///   GET    /api/collector/sound/rules            -> { rules: [{ slot, hasCustom, fileName }], repos: [{ repo, rules }] }
///   POST   /api/collector/sound/rules/{slot}?name=x.wav[&repo=R] (body = audio bytes) -> { rules, repos }
///   DELETE /api/collector/sound/rules/{slot}[?repo=R] -> { rules, repos }
///   POST   /api/collector/sound/rules/{slot}/test[?repo=R] -> { ok }  (plays the slot's effective host cue now)
///
/// The optional ?repo= selects a REPO SCOPE for the rule (openspec repo-sounds-and-latency);
/// without it the call addresses the global scope, exactly as before repo scopes existed.
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
    public sealed record SoundRequest(bool? On, string? Mode);

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

    public sealed record SendsRequest(bool? Allow);

    /// <summary>Operator consent for the FLEET CLIENT to send tasks to this source
    /// (openspec add-fleet-arch-agent). Mutates only the collector's own source
    /// record; the collector's polling stays read-only regardless.</summary>
    [HttpPost("sources/{id}/sends")]
    public IActionResult Sends(string id, [FromBody] SendsRequest? req)
    {
        _logger.CountRequest();
        if (req?.Allow is not bool allow) return BadRequest(new { error = "allow (true|false) is required" });
        return _collector.SetAllowSends(id, allow)
            ? Ok(_collector.ListSources().First(s => s.Id == id))
            : NotFound(new { error = "No such remote source." });
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

    // Host-side cue on each new event (openspec add-event-feed-collector, add-host-voice-mode):
    // plays on the computer running the harness, independent of any browser. Operator-toggled and
    // persisted, with a selectable mode ("beep" or "voice" — the latter speaks a spoken phrase).
    [HttpGet("sound")]
    public IActionResult GetSound()
    {
        _logger.CountRequest();
        return Ok(new { on = _hostSound.Enabled, mode = _hostSound.Mode });
    }

    [HttpPost("sound")]
    public IActionResult SetSound([FromBody] SoundRequest? req)
    {
        _logger.CountRequest();
        if (req?.On is bool on) _hostSound.SetEnabled(on);
        if (req?.Mode is string mode) _hostSound.SetMode(mode);
        return Ok(new { on = _hostSound.Enabled, mode = _hostSound.Mode });
    }

    // Play the host cue right now (ignores the on/off toggle) — to verify audio works. An optional
    // "mode" in the body auditions beep or voice directly; with no body it plays the current mode.
    [HttpPost("sound/test")]
    public IActionResult TestSound([FromBody] SoundRequest? req = null)
    {
        _logger.CountRequest();
        _hostSound.PlayNow(req?.Mode);
        return Ok(new { ok = true });
    }

    // Event → sound rules (openspec add-host-event-sound-rules): per-slot custom audio the HOST
    // plays on matching events, stored server-side. The upload is the raw audio bytes as the
    // request body (no multipart) with the original filename in ?name= — the extension is
    // validated and the size capped. The listing never returns the bytes.
    private object RulesBody() => new { rules = _hostSound.ListRules(), repos = _hostSound.ListRepoRules() };

    [HttpGet("sound/rules")]
    public IActionResult GetSoundRules()
    {
        _logger.CountRequest();
        return Ok(RulesBody());
    }

    [HttpPost("sound/rules/{slot}")]
    public async Task<IActionResult> SetSoundRule(string slot, [FromQuery] string? name, [FromQuery] string? repo = null)
    {
        _logger.CountRequest();
        // Bounded read regardless of (possibly absent) Content-Length, so an oversize body is
        // rejected without buffering more than the cap.
        if (Request.ContentLength is long len && len > HostEventSound.MaxRuleBytes)
            return BadRequest(new { error = $"Audio file must be at most {HostEventSound.MaxRuleBytes / (1024 * 1024)} MB." });
        using var ms = new MemoryStream();
        var buf = new byte[64 * 1024];
        int read;
        while ((read = await Request.Body.ReadAsync(buf)) > 0)
        {
            if (ms.Length + read > HostEventSound.MaxRuleBytes)
                return BadRequest(new { error = $"Audio file must be at most {HostEventSound.MaxRuleBytes / (1024 * 1024)} MB." });
            ms.Write(buf, 0, read);
        }
        try
        {
            _hostSound.AssignRule(slot, ms.ToArray(), name, repo);
            return Ok(RulesBody());
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("sound/rules/{slot}")]
    public IActionResult ClearSoundRule(string slot, [FromQuery] string? repo = null)
    {
        _logger.CountRequest();
        try
        {
            _hostSound.ClearRule(slot, repo);
            return Ok(RulesBody());
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // Play, on the host and right now, exactly what a live event of this slot's type (from
    // ?repo=, when given) would play — the per-slot Test button.
    [HttpPost("sound/rules/{slot}/test")]
    public IActionResult TestSoundRule(string slot, [FromQuery] string? repo = null)
    {
        _logger.CountRequest();
        try
        {
            _hostSound.PlayEffectiveNow(slot, repo);
            return Ok(new { ok = true });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
