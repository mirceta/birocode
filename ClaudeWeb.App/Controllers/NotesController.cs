using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Global ideas/notes (plans/ideas-pinned-dashboard.md). ONE master list shared
/// across the whole app — NOT project-scoped (reverses plans/ideas-tab.md).
///   GET    /api/notes        -- all ideas, newest first
///   POST   /api/notes        -- { text, project?, priority?, active? } create -> the idea
///   PATCH  /api/notes/{id}   -- { text, project?, priority?, active? } edit  -> the idea
///   DELETE /api/notes/{id}   -- remove one
/// Shared-board sync (openspec ideas-drive-sync):
///   GET    /api/notes/sync/config  -- { enabled, syncUrl, pollSeconds }
///   PUT    /api/notes/sync/config  -- same shape; saving nudges the sync engine
///   GET    /api/notes/sync/status  -- { state, lastSyncAt, lastError, rev, dirty }
/// The syncUrl is a bearer capability; it round-trips only through this
/// authenticated API and is never logged.
/// Harness-as-hub (openspec ideas-harness-hub):
///   GET    /api/notes/hub-info     -- { enabled, token }        (session-gated)
///   POST   /api/notes/hub-info     -- { enabled } toggle        (session-gated)
///   GET    /api/notes/hub/{token}  -- shared-store contract     (token IS the auth;
///   POST   /api/notes/hub/{token}     path exempt in PasswordAuthMiddleware AND
///                                     IpFilterMiddleware -- open to any IP)
/// Hub responses are always HTTP 200 with errors in the body — the same
/// Apps-Script-shaped envelope the remote IdeasSyncClient already parses.
/// `project` is an optional free-text label (plans/ideas-filter-project.md);
/// `priority` is 0 = none, 1–5 = increasing (plans/idea-priority.md);
/// `active` pins the idea into the Active section (plans/ideas-active-section.md).
/// </summary>
[ApiController]
[Route("api/notes")]
public class NotesController : ControllerBase
{
    private readonly NotesService _notes;
    private readonly IdeasSyncConfigStore _syncConfig;
    private readonly IdeasSyncService _sync;
    private readonly IdeasHubService _hub;
    private readonly Logger _logger;

    public NotesController(NotesService notes, IdeasSyncConfigStore syncConfig, IdeasSyncService sync, IdeasHubService hub, Logger logger)
    {
        _notes = notes;
        _syncConfig = syncConfig;
        _sync = sync;
        _hub = hub;
        _logger = logger;
    }

    public record NoteRequest(string? Text, string? Project, int Priority, bool Active);
    public record SyncConfigRequest(bool Enabled, string? SyncUrl, int PollSeconds);
    public record HubInfoRequest(bool Enabled);
    public record HubPostRequest(long BaseRev, IdeasSyncClient.SharedStore? Store);

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        return Ok(_notes.List());
    }

    [HttpPost]
    public IActionResult Create([FromBody] NoteRequest? request)
    {
        _logger.CountRequest();
        var note = _notes.Add(request?.Text, request?.Project, request?.Priority ?? 0, request?.Active ?? false, Now());
        if (note is null) return BadRequest(new { error = "Note text is required." });
        return Ok(note);
    }

    [HttpPatch("{id}")]
    public IActionResult Update(string id, [FromBody] NoteRequest? request)
    {
        _logger.CountRequest();
        var note = _notes.Update(id, request?.Text, request?.Project, request?.Priority ?? 0, request?.Active ?? false, Now());
        if (note is null) return NotFound(new { error = "Unknown note id or empty text." });
        return Ok(note);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        if (!_notes.Delete(id, Now())) return NotFound(new { error = "Unknown note id." });
        return Ok(new { id });
    }

    [HttpGet("sync/config")]
    public IActionResult GetSyncConfig()
    {
        _logger.CountRequest();
        var cfg = _syncConfig.Current;
        return Ok(new { enabled = cfg.Enabled, syncUrl = cfg.SyncUrl, pollSeconds = cfg.PollSeconds });
    }

    [HttpPut("sync/config")]
    public IActionResult PutSyncConfig([FromBody] SyncConfigRequest? request)
    {
        _logger.CountRequest();
        if (request is null) return BadRequest(new { error = "Config body is required." });
        if (request.Enabled && string.IsNullOrWhiteSpace(request.SyncUrl))
            return BadRequest(new { error = "A sync URL is required to enable sync." });
        var before = _syncConfig.Current;
        var cfg = _syncConfig.Update(request.Enabled, request.SyncUrl, request.PollSeconds);
        _sync.Nudge(targetChanged: !string.Equals(before.SyncUrl, cfg.SyncUrl, StringComparison.Ordinal));
        return Ok(new { enabled = cfg.Enabled, syncUrl = cfg.SyncUrl, pollSeconds = cfg.PollSeconds });
    }

    [HttpGet("sync/status")]
    public IActionResult GetSyncStatus()
    {
        _logger.CountRequest();
        var s = _sync.Status;
        return Ok(new { state = s.State, lastSyncAt = s.LastSyncAt, lastError = s.LastError, rev = s.Rev, dirty = s.Dirty });
    }

    [HttpGet("hub-info")]
    public IActionResult GetHubInfo()
    {
        _logger.CountRequest();
        var s = _hub.Current;
        return Ok(new { enabled = s.Enabled, token = s.Token });
    }

    [HttpPost("hub-info")]
    public IActionResult PostHubInfo([FromBody] HubInfoRequest? request)
    {
        _logger.CountRequest();
        if (request is null) return BadRequest(new { error = "Body is required." });
        var s = _hub.SetEnabled(request.Enabled);
        return Ok(new { enabled = s.Enabled, token = s.Token });
    }

    // The hub contract path. ALWAYS HTTP 200 (the remote client reads the body
    // envelope; transport failures mean "offline" to it) — including on a wrong
    // token, which gets the same envelope as a disabled hub so the path leaks
    // nothing about whether hosting is on.
    [HttpGet("hub/{token}")]
    public IActionResult HubGet(string token)
    {
        _logger.CountRequest();
        return Ok(ToWire(_hub.TokenMatches(token)
            ? _hub.Get()
            : new IdeasHubService.HubEnvelope(false, false, 0, null, "Unknown hub URL or hub hosting is disabled.")));
    }

    [HttpPost("hub/{token}")]
    public IActionResult HubPost(string token, [FromBody] HubPostRequest? request)
    {
        _logger.CountRequest();
        if (!_hub.TokenMatches(token))
            return Ok(ToWire(new IdeasHubService.HubEnvelope(false, false, 0, null, "Unknown hub URL or hub hosting is disabled.")));
        if (request is null)
            return Ok(ToWire(new IdeasHubService.HubEnvelope(false, false, 0, null, "A JSON body with baseRev and store is required.")));
        var env = _hub.Post(request.BaseRev, request.Store?.Ideas ?? new(), request.Store?.Tombstones ?? new());
        return Ok(ToWire(env));
    }

    private static object ToWire(IdeasHubService.HubEnvelope env) => new
    {
        ok = env.Ok,
        conflict = env.Conflict,
        rev = env.Rev,
        store = env.Store is null ? null : new { ideas = env.Store.Ideas, tombstones = env.Store.Tombstones },
        error = env.Error,
    };

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
