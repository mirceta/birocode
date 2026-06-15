using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Global ideas/notes (plans/ideas-pinned-dashboard.md). ONE master list shared
/// across the whole app — NOT project-scoped (reverses plans/ideas-tab.md).
///   GET    /api/notes        -- all ideas, newest first
///   POST   /api/notes        -- { text, project?, priority? } create -> the idea
///   PATCH  /api/notes/{id}   -- { text, project?, priority? } edit  -> the idea
///   DELETE /api/notes/{id}   -- remove one
/// `project` is an optional free-text label (plans/ideas-filter-project.md);
/// `priority` is 0 = none, 1–5 = increasing (plans/idea-priority.md).
/// </summary>
[ApiController]
[Route("api/notes")]
public class NotesController : ControllerBase
{
    private readonly NotesService _notes;
    private readonly Logger _logger;

    public NotesController(NotesService notes, Logger logger)
    {
        _notes = notes;
        _logger = logger;
    }

    public record NoteRequest(string? Text, string? Project, int Priority);

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
        var note = _notes.Add(request?.Text, request?.Project, request?.Priority ?? 0, Now());
        if (note is null) return BadRequest(new { error = "Note text is required." });
        return Ok(note);
    }

    [HttpPatch("{id}")]
    public IActionResult Update(string id, [FromBody] NoteRequest? request)
    {
        _logger.CountRequest();
        var note = _notes.Update(id, request?.Text, request?.Project, request?.Priority ?? 0, Now());
        if (note is null) return NotFound(new { error = "Unknown note id or empty text." });
        return Ok(note);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        if (!_notes.Delete(id)) return NotFound(new { error = "Unknown note id." });
        return Ok(new { id });
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
