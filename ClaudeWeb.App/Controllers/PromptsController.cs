using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Prompts;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// User-defined composer prompt presets (plans/custom-prompts.md). GLOBAL — the
/// user's personal library, NOT scoped by repo (no X-Repo-Id), unlike Notes/Pins.
///   GET    /api/prompts?owner=        -- one owner's library in order (no owner = the repo agents')
///   POST   /api/prompts               -- { emoji, label, text, owner?, category?, hint? } create -> the preset
///   PATCH  /api/prompts/{id}          -- { emoji, label, text, category?, hint? } edit  -> the preset
///   DELETE /api/prompts/{id}          -- remove one
///   POST   /api/prompts/reorder       -- { owner?, ids } -> the owner's library in the new order
///   POST   /api/prompts/{id}/duplicate -- a copy right after it
///   POST   /api/prompts/seed/arch     -- seed the arch's cached prompts from the Arch examples
///                                        (adds missing categories only; edited ones survive)
/// The arch owner (openspec arch-custom-prompts) is the same store: the Arch agent's panel,
/// the arch's cache_prompt tool and this controller read and write one prompts.json.
/// </summary>
[ApiController]
[Route("api/prompts")]
public class PromptsController : ControllerBase
{
    private readonly PromptsService _prompts;
    private readonly ArchExamplesMiner? _examples;
    private readonly Logger _logger;

    public PromptsController(PromptsService prompts, Logger logger, ArchExamplesMiner? examples = null)
    {
        _prompts = prompts;
        _examples = examples;
        _logger = logger;
    }

    public record PromptRequest(string? Emoji, string? Label, string? Text, string? Owner = null, string? Category = null, string? Hint = null);
    public record ReorderRequest(string? Owner, List<string>? Ids);

    [HttpGet]
    public IActionResult List([FromQuery] string? owner = null)
    {
        _logger.CountRequest();
        return Ok(_prompts.List(string.IsNullOrWhiteSpace(owner) ? null : owner));
    }

    [HttpPost]
    public IActionResult Create([FromBody] PromptRequest? request)
    {
        _logger.CountRequest();
        var prompt = _prompts.Add(request?.Emoji, request?.Label, request?.Text, request?.Owner, request?.Category, request?.Hint);
        if (prompt is null) return BadRequest(new { error = "Prompt text is required." });
        return Ok(prompt);
    }

    [HttpPatch("{id}")]
    public IActionResult Update(string id, [FromBody] PromptRequest? request)
    {
        _logger.CountRequest();
        var prompt = _prompts.Update(id, request?.Emoji, request?.Label, request?.Text, request?.Category, request?.Hint);
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

    [HttpPost("reorder")]
    public IActionResult Reorder([FromBody] ReorderRequest? request)
    {
        _logger.CountRequest();
        if (request?.Ids is null) return BadRequest(new { error = "ids is required: the full ordered id list" });
        return Ok(_prompts.Reorder(string.IsNullOrWhiteSpace(request.Owner) ? null : request.Owner, request.Ids));
    }

    [HttpPost("{id}/duplicate")]
    public IActionResult Duplicate(string id)
    {
        _logger.CountRequest();
        var copy = _prompts.Duplicate(id);
        return copy is null ? NotFound(new { error = "Unknown prompt id." }) : Ok(copy);
    }

    /// <summary>Seed (or re-seed) the arch's cached prompts from the Arch examples catalogue —
    /// this hub's mining run or the committed snapshot. Only missing categories are added.</summary>
    [HttpPost("seed/arch")]
    public IActionResult SeedArch()
    {
        _logger.CountRequest();
        var examples = _examples?.Current();
        var seeds = ArchPromptSeeds.WithTips(ArchPromptSeeds.FromExamples(examples), examples);
        var (added, total) = _prompts.Seed(PromptsService.OwnerArch, seeds);
        return Ok(new
        {
            ok = true, added, total, seeds = seeds.Count,
            source = examples is null ? "curated" : examples["source"]?.ToString() ?? "mined",
            detail = added == 0 ? $"nothing to add: all {seeds.Count} seed prompts are present ({total} arch prompts; edited ones kept)" : $"added {added} seed prompt(s) ({total} arch prompts now; existing ones untouched)",
            prompts = _prompts.List(PromptsService.OwnerArch),
        });
    }
}
