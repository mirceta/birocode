using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Per-project ideas/notes (plans/ideas-tab.md). Scoped to the current project
/// by the X-Repo-Id header (RepositoryResolver), exactly like Files/Git — a
/// note created under one project is never visible under another.
///   GET    /api/notes        -- this project's notes, newest first
///   POST   /api/notes        -- { text } create -> the note
///   PATCH  /api/notes/{id}   -- { text } edit  -> the note
///   DELETE /api/notes/{id}   -- remove one
/// </summary>
[ApiController]
[Route("api/notes")]
public class NotesController : ControllerBase
{
    private readonly NotesService _notes;
    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public NotesController(NotesService notes, RepositoryResolver repos, Logger logger)
    {
        _notes = notes;
        _repos = repos;
        _logger = logger;
    }

    public record NoteRequest(string? Text);

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        return Ok(_notes.List(repo.Id));
    }

    [HttpPost]
    public IActionResult Create([FromBody] NoteRequest? request)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        var note = _notes.Add(repo.Id, request?.Text, Now());
        if (note is null) return BadRequest(new { error = "Note text is required." });
        return Ok(note);
    }

    [HttpPatch("{id}")]
    public IActionResult Update(string id, [FromBody] NoteRequest? request)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        var note = _notes.Update(repo.Id, id, request?.Text, Now());
        if (note is null) return NotFound(new { error = "Unknown note id or empty text." });
        return Ok(note);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        if (!_notes.Delete(repo.Id, id)) return NotFound(new { error = "Unknown note id." });
        return Ok(new { id });
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
