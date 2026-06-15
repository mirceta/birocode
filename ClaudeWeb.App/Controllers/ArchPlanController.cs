using ClaudeWeb.Services.ArchPlan;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The single global architectural-plan document (plans/ideas-arch-plan.md) —
/// free text the Operator maintains by hand, shown in the Ideas surface.
///   GET /api/arch-plan          -- { text }
///   PUT /api/arch-plan { text } -- save -> { text }
/// </summary>
[ApiController]
[Route("api/arch-plan")]
public class ArchPlanController : ControllerBase
{
    private readonly ArchPlanService _plan;
    private readonly Logger _logger;

    public ArchPlanController(ArchPlanService plan, Logger logger)
    {
        _plan = plan;
        _logger = logger;
    }

    public record ArchPlanRequest(string? Text);

    [HttpGet]
    public IActionResult Get()
    {
        _logger.CountRequest();
        return Ok(new { text = _plan.Get() });
    }

    [HttpPut]
    public IActionResult Put([FromBody] ArchPlanRequest? request)
    {
        _logger.CountRequest();
        var text = _plan.Set(request?.Text);
        return Ok(new { text });
    }
}
