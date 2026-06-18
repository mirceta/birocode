using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The task dependency graph (plans/task-dependency-graph.md): ONE global board of
/// step nodes + "depends-on" edges, shared across the whole app.
///   GET    /api/taskgraph              -- { nodes, edges }
///   POST   /api/taskgraph/nodes        -- { title, note?, repoId?, x?, y? } -> node
///   PATCH  /api/taskgraph/nodes/{id}   -- { title?, note?, repoId?, status?, x?, y? } -> node
///   DELETE /api/taskgraph/nodes/{id}   -- remove node (+ its edges)
///   PATCH  /api/taskgraph/scratch      -- { text } free-text scratchpad -> { scratch }
///   POST   /api/taskgraph/edges        -- { source, target } -> edge  (Source depends on Target)
///   DELETE /api/taskgraph/edges/{id}   -- remove one edge
/// An edge Source->Target means Source must wait on Target (Target is the prerequisite).
/// </summary>
[ApiController]
[Route("api/taskgraph")]
public class TaskGraphController : ControllerBase
{
    private readonly TaskGraphService _graph;
    private readonly Logger _logger;

    public TaskGraphController(TaskGraphService graph, Logger logger)
    {
        _graph = graph;
        _logger = logger;
    }

    public record NodeRequest(string? Title, string? Note, string? RepoId, string? Status, double? X, double? Y);
    public record EdgeRequest(string? Source, string? Target);
    public record ScratchRequest(string? Text);

    [HttpGet]
    public IActionResult Get()
    {
        _logger.CountRequest();
        return Ok(_graph.Get());
    }

    [HttpPost("nodes")]
    public IActionResult CreateNode([FromBody] NodeRequest? request)
    {
        _logger.CountRequest();
        var node = _graph.AddNode(request?.Title, request?.Note, request?.RepoId, request?.X ?? 0, request?.Y ?? 0, Now());
        if (node is null) return BadRequest(new { error = "Node title is required." });
        return Ok(node);
    }

    [HttpPatch("nodes/{id}")]
    public IActionResult UpdateNode(string id, [FromBody] NodeRequest? request)
    {
        _logger.CountRequest();
        var node = _graph.UpdateNode(id, request?.Title, request?.Note, request?.RepoId, request?.Status, request?.X, request?.Y, Now());
        if (node is null) return NotFound(new { error = "Unknown node id, blank title, or invalid status." });
        return Ok(node);
    }

    [HttpDelete("nodes/{id}")]
    public IActionResult DeleteNode(string id)
    {
        _logger.CountRequest();
        var dropped = _graph.DeleteNode(id);
        if (dropped < 0) return NotFound(new { error = "Unknown node id." });
        return Ok(new { id, removedEdges = dropped });
    }

    [HttpPatch("scratch")]
    public IActionResult UpdateScratch([FromBody] ScratchRequest? request)
    {
        _logger.CountRequest();
        return Ok(new { scratch = _graph.SetScratch(request?.Text) });
    }

    [HttpPost("edges")]
    public IActionResult CreateEdge([FromBody] EdgeRequest? request)
    {
        _logger.CountRequest();
        var (edge, error) = _graph.AddEdge(request?.Source, request?.Target, Now());
        if (edge is not null) return Ok(edge);
        var message = error switch
        {
            TaskGraphService.EdgeError.MissingNode => "Both source and target nodes must exist.",
            TaskGraphService.EdgeError.SelfLoop => "A step can't depend on itself.",
            TaskGraphService.EdgeError.Duplicate => "That dependency already exists.",
            TaskGraphService.EdgeError.Cycle => "That would create a dependency cycle.",
            _ => "Could not add the dependency.",
        };
        return BadRequest(new { error = message });
    }

    [HttpDelete("edges/{id}")]
    public IActionResult DeleteEdge(string id)
    {
        _logger.CountRequest();
        if (!_graph.DeleteEdge(id)) return NotFound(new { error = "Unknown edge id." });
        return Ok(new { id });
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
