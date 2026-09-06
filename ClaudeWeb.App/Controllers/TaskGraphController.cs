using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The task dependency graph (plans/task-dependency-graph.md): ONE global board of
/// step nodes + "depends-on" edges, shared across the whole app.
///   GET    /api/taskgraph                -- { nodes, edges, machines }
///   POST   /api/taskgraph/nodes          -- { title, note?, repoId?, machineId?, x?, y? } -> node
///   PATCH  /api/taskgraph/nodes/{id}     -- { title?, note?, repoId?, machineId?, status?, x?, y? } -> node
///   DELETE /api/taskgraph/nodes/{id}     -- remove node (+ its edges)
///   PATCH  /api/taskgraph/scratch        -- { text } free-text scratchpad -> { scratch }
///   POST   /api/taskgraph/edges          -- { source, target } -> edge  (Source depends on Target)
///   DELETE /api/taskgraph/edges/{id}     -- remove one edge
///   POST   /api/taskgraph/machines       -- { name?, x?, y?, w?, h? } -> machine (grouping box = one host)
///   PATCH  /api/taskgraph/machines/{id}  -- { name?, x?, y?, w?, h? } -> machine
///   DELETE /api/taskgraph/machines/{id}  -- remove box, DETACHING its member nodes
///   POST   /api/taskgraph/verify         -- run one verifier pass now (openspec board-verify-remote) -> { checked, probed, changes, notes, at }
/// An edge Source->Target means Source must wait on Target (Target is the prerequisite).
/// </summary>
[ApiController]
[Route("api/taskgraph")]
public class TaskGraphController : ControllerBase
{
    private readonly TaskGraphService _graph;
    private readonly Services.Arch.ArchAgentService _arch;
    private readonly TaskVerificationPoller _verifier;
    private readonly Logger _logger;

    public TaskGraphController(TaskGraphService graph, Services.Arch.ArchAgentService arch, TaskVerificationPoller verifier, Logger logger)
    {
        _graph = graph;
        _arch = arch;
        _verifier = verifier;
        _logger = logger;
    }

    /// <summary>Run one verification pass right now (openspec board-verify-remote): this
    /// machine's assignees from their clones, every card with a PR against GitHub. The
    /// operator's "Re-verify board" button; also how stuck cards are backfilled without
    /// waiting for the next minute tick. Serialised with the background pass.</summary>
    [HttpPost("verify")]
    public IActionResult Verify()
    {
        _logger.CountRequest();
        var r = _verifier.VerifyOnce();
        return Ok(new
        {
            r.Checked, r.Probed, r.At,
            changes = r.Changes.Select(c => new { c.Id, c.Title, c.From, c.To }),
            notes = r.Notes,
        });
    }

    public record NodeRequest(string? Title, string? Note, string? RepoId, string? MachineId, string? Status, double? X, double? Y,
        string? SourceId = null, string? CreatedBy = null, string? IdeaId = null);
    public record AssignRequest(string? SourceId, string? RepoId, string? By);
    public record EdgeRequest(string? Source, string? Target);
    public record ScratchRequest(string? Text);
    public record MachineRequest(string? Name, double? X, double? Y, double? W, double? H);

    [HttpGet]
    public IActionResult Get()
    {
        _logger.CountRequest();
        var b = _graph.Get();
        // staleHours rides along so the client draws the same stale badge the
        // harness computes (openspec kanban-lifecycle-columns).
        return Ok(new { nodes = b.Nodes, edges = b.Edges, machines = b.Machines, scratch = b.Scratch, staleHours = _graph.StaleAfterMs / 3600_000.0 });
    }

    [HttpPost("nodes")]
    public IActionResult CreateNode([FromBody] NodeRequest? request)
    {
        _logger.CountRequest();
        var node = _graph.AddNode(request?.Title, request?.Note, request?.RepoId, request?.MachineId, request?.X ?? 0, request?.Y ?? 0, Now(),
            request?.SourceId, request?.CreatedBy ?? "human", request?.IdeaId);
        if (node is null) return BadRequest(new { error = "Node title is required." });
        return Ok(node);
    }

    [HttpPatch("nodes/{id}")]
    public IActionResult UpdateNode(string id, [FromBody] NodeRequest? request)
    {
        _logger.CountRequest();
        var node = _graph.UpdateNode(id, request?.Title, request?.Note, request?.RepoId, request?.MachineId, request?.Status, request?.X, request?.Y, Now());
        if (node is null) return NotFound(new { error = "Unknown node id, blank title, or invalid status." });
        return Ok(node);
    }

    /// <summary>Assign a task to a repo agent on this or another harness (openspec
    /// task-board-kanban); blank repoId unassigns.</summary>
    [HttpPost("nodes/{id}/assign")]
    public IActionResult Assign(string id, [FromBody] AssignRequest? request)
    {
        _logger.CountRequest();
        var node = _graph.Assign(id, request?.SourceId, request?.RepoId, request?.By ?? "human", Now());
        if (node is null) return NotFound(new { error = "Unknown node id." });
        return Ok(node);
    }

    /// <summary>Ping the assignee with the task (the operator's button): the task
    /// text goes to that repo agent's conversation through the arch send path, and
    /// the card moves to doing when the send lands.</summary>
    [HttpPost("nodes/{id}/dispatch")]
    public IActionResult Dispatch(string id)
    {
        _logger.CountRequest();
        var o = _arch.DispatchTask(id, requireArmed: false, by: "operator");
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    [HttpDelete("nodes/{id}")]
    public IActionResult DeleteNode(string id)
    {
        _logger.CountRequest();
        var dropped = _graph.DeleteNode(id, Now());
        if (dropped < 0) return NotFound(new { error = "Unknown node id." });
        return Ok(new { id, removedEdges = dropped });
    }

    [HttpPatch("scratch")]
    public IActionResult UpdateScratch([FromBody] ScratchRequest? request)
    {
        _logger.CountRequest();
        return Ok(new { scratch = _graph.SetScratch(request?.Text, Now()) });
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
        if (!_graph.DeleteEdge(id, Now())) return NotFound(new { error = "Unknown edge id." });
        return Ok(new { id });
    }

    [HttpPost("machines")]
    public IActionResult CreateMachine([FromBody] MachineRequest? request)
    {
        _logger.CountRequest();
        var machine = _graph.AddMachine(request?.Name, request?.X, request?.Y, request?.W, request?.H, Now());
        return Ok(machine);
    }

    [HttpPatch("machines/{id}")]
    public IActionResult UpdateMachine(string id, [FromBody] MachineRequest? request)
    {
        _logger.CountRequest();
        var machine = _graph.UpdateMachine(id, request?.Name, request?.X, request?.Y, request?.W, request?.H, Now());
        if (machine is null) return NotFound(new { error = "Unknown machine id, or blank name." });
        return Ok(machine);
    }

    [HttpDelete("machines/{id}")]
    public IActionResult DeleteMachine(string id)
    {
        _logger.CountRequest();
        var detached = _graph.DeleteMachine(id, Now());
        if (detached < 0) return NotFound(new { error = "Unknown machine id." });
        return Ok(new { id, detachedNodes = detached });
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
