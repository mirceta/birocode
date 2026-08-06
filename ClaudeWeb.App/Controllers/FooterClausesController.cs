using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Prompts;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Footer clauses (openspec prompt-footer-clauses). GLOBAL — one list for the
/// whole harness, NOT scoped by repo (no X-Repo-Id), like PromptsController.
///   GET    /api/footer-clauses        -- the whole list (insertion order)
///   POST   /api/footer-clauses        -- { text, active? } create -> the clause
///   PATCH  /api/footer-clauses/{id}   -- { text?, active? } edit; omitted fields keep current
///   DELETE /api/footer-clauses/{id}   -- remove one
/// </summary>
[ApiController]
[Route("api/footer-clauses")]
public class FooterClausesController : ControllerBase
{
    private readonly FooterClausesService _clauses;
    private readonly Logger _logger;

    public FooterClausesController(FooterClausesService clauses, Logger logger)
    {
        _clauses = clauses;
        _logger = logger;
    }

    public record ClauseRequest(string? Text, bool? Active);

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        return Ok(_clauses.List());
    }

    [HttpPost]
    public IActionResult Create([FromBody] ClauseRequest? request)
    {
        _logger.CountRequest();
        var clause = _clauses.Add(request?.Text, request?.Active ?? false);
        if (clause is null) return BadRequest(new { error = "Clause text is required." });
        return Ok(clause);
    }

    [HttpPatch("{id}")]
    public IActionResult Update(string id, [FromBody] ClauseRequest? request)
    {
        _logger.CountRequest();
        var clause = _clauses.Update(id, request?.Text, request?.Active);
        if (clause is null) return NotFound(new { error = "Unknown clause id or empty text." });
        return Ok(clause);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        if (!_clauses.Delete(id)) return NotFound(new { error = "Unknown clause id." });
        return Ok(new { id });
    }
}
