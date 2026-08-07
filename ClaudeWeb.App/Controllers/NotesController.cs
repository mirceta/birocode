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
    private readonly Logger _logger;

    public NotesController(NotesService notes, IdeasSyncConfigStore syncConfig, IdeasSyncService sync, Logger logger)
    {
        _notes = notes;
        _syncConfig = syncConfig;
        _sync = sync;
        _logger = logger;
    }

    public record NoteRequest(string? Text, string? Project, int Priority, bool Active);
    public record SyncConfigRequest(bool Enabled, string? SyncUrl, int PollSeconds);

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

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
