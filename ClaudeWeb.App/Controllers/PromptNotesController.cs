using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.PromptNotes;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// User-defined prompt NOTES — freeform working notes drafted before being ported
/// into a prompt plan. The third tab of the ⚙ pop-up. GLOBAL, like prompts/plans
/// (no X-Repo-Id). Kebab path so it can't collide with /api/prompts or /api/notes
/// (the unrelated Ideas store).
///   GET    /api/prompt-notes        -- the whole library (insertion order)
///   POST   /api/prompt-notes        -- { title, body } create -> the note
///   PATCH  /api/prompt-notes/{id}   -- { title, body } edit  -> the note
///   DELETE /api/prompt-notes/{id}   -- remove one
/// A note needs a title OR a body; an empty one is rejected.
/// </summary>
[ApiController]
[Route("api/prompt-notes")]
public class PromptNotesController : ControllerBase
{
    private readonly PromptNotesService _notes;
    private readonly Logger _logger;

    public PromptNotesController(PromptNotesService notes, Logger logger)
    {
        _notes = notes;
        _logger = logger;
    }

    public record NoteRequest(string? Title, string? Body);

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
        var note = _notes.Add(request?.Title, request?.Body);
        if (note is null) return BadRequest(new { error = "A note needs a title or a body." });
        return Ok(note);
    }

    [HttpPatch("{id}")]
    public IActionResult Update(string id, [FromBody] NoteRequest? request)
    {
        _logger.CountRequest();
        var note = _notes.Update(id, request?.Title, request?.Body);
        if (note is null) return NotFound(new { error = "Unknown note id or empty note." });
        return Ok(note);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        if (!_notes.Delete(id)) return NotFound(new { error = "Unknown note id." });
        return Ok(new { id });
    }
}
