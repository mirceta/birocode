using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Prompts;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// User-defined composer prompt presets (plans/custom-prompts.md). GLOBAL — the
/// user's personal library, NOT scoped by repo (no X-Repo-Id), unlike Notes/Pins.
///   GET    /api/prompts        -- the whole library (insertion order)
///   POST   /api/prompts        -- { emoji, label, text } create -> the preset
///   PATCH  /api/prompts/{id}   -- { emoji, label, text } edit  -> the preset
///   DELETE /api/prompts/{id}   -- remove one
/// </summary>
[ApiController]
[Route("api/prompts")]
public class PromptsController : ControllerBase
{
    private readonly PromptsService _prompts;
    private readonly Logger _logger;

    public PromptsController(PromptsService prompts, Logger logger)
    {
        _prompts = prompts;
        _logger = logger;
    }

    public record PromptRequest(string? Emoji, string? Label, string? Text);

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        return Ok(_prompts.List());
    }

    [HttpPost]
    public IActionResult Create([FromBody] PromptRequest? request)
    {
        _logger.CountRequest();
        var prompt = _prompts.Add(request?.Emoji, request?.Label, request?.Text);
        if (prompt is null) return BadRequest(new { error = "Prompt text is required." });
        return Ok(prompt);
    }

    [HttpPatch("{id}")]
    public IActionResult Update(string id, [FromBody] PromptRequest? request)
    {
        _logger.CountRequest();
        var prompt = _prompts.Update(id, request?.Emoji, request?.Label, request?.Text);
        if (prompt is null) return NotFound(new { error = "Unknown prompt id or empty text." });
        return Ok(prompt);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        if (!_prompts.Delete(id)) return NotFound(new { error = "Unknown prompt id." });
        return Ok(new { id });
    }
}
