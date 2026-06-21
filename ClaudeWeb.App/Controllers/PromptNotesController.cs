using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.PromptNotes;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The user's prompt NOTES — a SINGLE freeform scratch canvas drafted before being
/// ported into a prompt plan. The third tab of the ⚙ pop-up. GLOBAL, like
/// prompts/plans (no X-Repo-Id). Kebab path so it can't collide with /api/prompts or
/// /api/notes (the unrelated Ideas store). One document, not a list:
///   GET /api/prompt-notes   -- { text } the current canvas
///   PUT /api/prompt-notes   -- { text } replace the canvas -> { text }
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

    public record NotesRequest(string? Text);

    [HttpGet]
    public IActionResult Get()
    {
        _logger.CountRequest();
        return Ok(new { text = _notes.Get() });
    }

    [HttpPut]
    public IActionResult Set([FromBody] NotesRequest? request)
    {
        _logger.CountRequest();
        var text = _notes.Set(request?.Text);
        return Ok(new { text });
    }
}
