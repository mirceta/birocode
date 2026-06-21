using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.PromptPlans;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// User-defined prompt PLANS (plans/prompt-plans.md) — named, ordered prompt-step
/// sequences. GLOBAL, like prompts (no X-Repo-Id). Kebab path so it can't collide
/// with /api/prompts.
///   GET    /api/prompt-plans        -- the whole library (insertion order)
///   POST   /api/prompt-plans        -- { name, steps[] } create -> the plan
///   PATCH  /api/prompt-plans/{id}   -- { name, steps[] } edit  -> the plan
///   DELETE /api/prompt-plans/{id}   -- remove one
/// A step is { name, details, expected }; the step ORDER is the send sequence, so
/// create/edit fully REPLACES the step list with the array sent.
/// </summary>
[ApiController]
[Route("api/prompt-plans")]
public class PromptPlansController : ControllerBase
{
    private readonly PromptPlansService _plans;
    private readonly Logger _logger;

    public PromptPlansController(PromptPlansService plans, Logger logger)
    {
        _plans = plans;
        _logger = logger;
    }

    public record StepRequest(string? Name, string? Details, string? Expected);
    public record PlanRequest(string? Name, List<StepRequest>? Steps);

    private static IEnumerable<PromptPlansService.PlanStep> ToSteps(List<StepRequest>? steps) =>
        (steps ?? new List<StepRequest>())
            .Select(s => new PromptPlansService.PlanStep(s?.Name ?? "", s?.Details ?? "", s?.Expected ?? ""));

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        return Ok(_plans.List());
    }

    [HttpPost]
    public IActionResult Create([FromBody] PlanRequest? request)
    {
        _logger.CountRequest();
        var plan = _plans.Add(request?.Name, ToSteps(request?.Steps));
        if (plan is null) return BadRequest(new { error = "Plan name is required." });
        return Ok(plan);
    }

    [HttpPatch("{id}")]
    public IActionResult Update(string id, [FromBody] PlanRequest? request)
    {
        _logger.CountRequest();
        var plan = _plans.Update(id, request?.Name, ToSteps(request?.Steps));
        if (plan is null) return NotFound(new { error = "Unknown plan id or empty name." });
        return Ok(plan);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        if (!_plans.Delete(id)) return NotFound(new { error = "Unknown plan id." });
        return Ok(new { id });
    }
}
