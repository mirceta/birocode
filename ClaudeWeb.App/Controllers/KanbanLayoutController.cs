using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The saved Kanban column layout (fleet task 0a57d282): GET returns the Operator's
/// saved visible-set + widths (or <c>layout: null</c> when nothing was ever saved), PUT
/// snapshots the current one. Per harness, persisted by <see cref="KanbanLayoutService"/>
/// — not part of the fleet-synced graph. Auto-discovered by AddControllers().
/// </summary>
[ApiController]
[Route("api/taskgraph/layout")]
public class KanbanLayoutController : ControllerBase
{
    private readonly KanbanLayoutService _layouts;
    private readonly Logger _logger;

    public KanbanLayoutController(KanbanLayoutService layouts, Logger logger)
    {
        _layouts = layouts;
        _logger = logger;
    }

    public record LayoutRequest(List<string>? Visible, Dictionary<string, int>? Widths);

    [HttpGet]
    public IActionResult Get()
    {
        _logger.CountRequest();
        return Ok(new { layout = _layouts.Get() });
    }

    [HttpPut]
    public IActionResult Save([FromBody] LayoutRequest? request)
    {
        _logger.CountRequest();
        if (request?.Visible is null) return BadRequest(new { error = "visible (list of column keys) is required." });
        var saved = _layouts.Save(request.Visible, request.Widths, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        return Ok(new { layout = saved });
    }
}
