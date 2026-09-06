using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.TaskGraph;

namespace ClaudeWeb.Services.Tasks;

/// <summary>
/// The Tasks agent's tool layer (openspec: tasks-agent, D2/D3): eight thin wrappers
/// over <see cref="NotesService"/> and <see cref="TaskGraphService"/>, each recorded
/// in the action audit. No CLI, no HTTP, no runner — the unit tests construct it
/// over temp-dir stores. Every outcome carries <c>status</c> so the role prompt has
/// something exact to key on; a refused edge reports the service's reason.
/// </summary>
public class TasksToolbox
{
    public const string AuditKind = "tasks";
    public const string AuditOutcomeTool = "tasks-tool";

    private const double FirstX = 40, FirstY = 40, ColumnGap = 260, RowGap = 140;
    private const int PerRow = 4;

    private readonly NotesService _notes;
    private readonly TaskGraphService _graph;
    private readonly AutopilotAuditLog _audit;
    private readonly Logger _logger;

    public TasksToolbox(NotesService notes, TaskGraphService graph, AutopilotAuditLog audit, Logger logger)
    {
        _notes = notes;
        _graph = graph;
        _audit = audit;
        _logger = logger;
    }

    public sealed record ToolOutcome(bool Ok, string Status, string Detail, object? Data = null);

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    // ---- ideas -------------------------------------------------------------------------

    public ToolOutcome ListIdeas()
    {
        var list = _notes.List().Select(IdeaView).ToList();
        Audit("list_ideas", $"{list.Count} idea(s)");
        return new ToolOutcome(true, "ok", $"{list.Count} idea(s)", list);
    }

    public ToolOutcome CreateIdea(string? text, string? project, int? priority, bool? active)
    {
        var note = _notes.Add(text, project, priority ?? 0, active ?? false, Now());
        if (note is null)
        {
            Audit("create_idea", "refused: empty text");
            return new ToolOutcome(false, "error", "text is required");
        }
        Audit("create_idea", Short(note.Text));
        return new ToolOutcome(true, "created", $"idea {note.Id} created", IdeaView(note));
    }

    /// <summary>Partial update: an omitted field keeps its value (the REST PATCH
    /// overwrites; the tool must not surprise the model).</summary>
    public ToolOutcome UpdateIdea(string? id, string? text, string? project, int? priority, bool? active)
    {
        // Include consumed ideas in the id lookup: a promoted idea is hidden from the
        // list but must still be resolvable by id (openspec ideas-consume-on-promotion).
        var current = _notes.List(includeConsumed: true).FirstOrDefault(n => n.Id == (id ?? "").Trim());
        if (current is null)
        {
            Audit("update_idea", $"refused: unknown id {id}");
            return new ToolOutcome(false, "missing", $"no idea with id \"{id}\"");
        }
        var note = _notes.Update(current.Id,
            text is null ? current.Text : text,
            project is null ? current.Project : project,
            priority ?? current.Priority,
            active ?? current.Active,
            Now());
        if (note is null)
        {
            Audit("update_idea", "refused: empty text");
            return new ToolOutcome(false, "error", "text cannot be empty");
        }
        Audit("update_idea", Short(note.Text));
        return new ToolOutcome(true, "updated", $"idea {note.Id} updated", IdeaView(note));
    }

    // ---- tasks -------------------------------------------------------------------------

    public ToolOutcome ListTasks()
    {
        var board = _graph.Get();
        var nodes = board.Nodes.Select(NodeView).ToList();
        var edges = board.Edges.Select(e => new { id = e.Id, source = e.Source, target = e.Target }).ToList();
        Audit("list_tasks", $"{nodes.Count} task(s), {edges.Count} edge(s)");
        return new ToolOutcome(true, "ok", $"{nodes.Count} task(s), {edges.Count} dependency edge(s); an edge means source depends on target",
            new { nodes, edges });
    }

    public ToolOutcome CreateTask(string? title, string? note, string? repoId)
    {
        var (x, y) = NextPosition();
        var node = _graph.AddNode(title, note, repoId, null, x, y, Now(), createdBy: "tasks-agent");
        if (node is null)
        {
            Audit("create_task", "refused: empty title");
            return new ToolOutcome(false, "error", "title is required");
        }
        Audit("create_task", Short(node.Title));
        return new ToolOutcome(true, "created", $"task {node.Id} created", NodeView(node));
    }

    public ToolOutcome UpdateTask(string? id, string? title, string? note, string? repoId, string? status)
    {
        var clean = (id ?? "").Trim();
        if (_graph.Get().Nodes.All(n => n.Id != clean))
        {
            Audit("update_task", $"refused: unknown id {id}");
            return new ToolOutcome(false, "missing", $"no task with id \"{id}\"");
        }
        if (status is not null && !TaskGraphService.Statuses.Contains(status.Trim(), StringComparer.OrdinalIgnoreCase))
        {
            Audit("update_task", $"refused: bad status {status}");
            return new ToolOutcome(false, "error", $"status must be one of {string.Join(", ", TaskGraphService.Statuses)}");
        }
        var node = _graph.UpdateNode(clean, title, note, repoId, null, status?.Trim().ToLowerInvariant(), null, null, Now());
        if (node is null)
        {
            Audit("update_task", "refused: empty title");
            return new ToolOutcome(false, "error", "title cannot be empty");
        }
        Audit("update_task", Short(node.Title));
        return new ToolOutcome(true, "updated", $"task {node.Id} updated", NodeView(node));
    }

    /// <summary>source depends on target. A refusal reports the graph's own reason
    /// as the status, so the model sees why (a cycle is never silently dropped).</summary>
    public ToolOutcome LinkTasks(string? source, string? target)
    {
        var (edge, error) = _graph.AddEdge(source, target, Now());
        if (edge is not null)
        {
            Audit("link_tasks", $"{Short(source)} -> {Short(target)}");
            return new ToolOutcome(true, "linked", $"{edge.Source} now depends on {edge.Target}",
                new { id = edge.Id, source = edge.Source, target = edge.Target });
        }
        var (status, detail) = error switch
        {
            TaskGraphService.EdgeError.MissingNode => ("missing-node", "both source and target must be existing task ids"),
            TaskGraphService.EdgeError.SelfLoop => ("self-loop", "a task cannot depend on itself"),
            TaskGraphService.EdgeError.Duplicate => ("duplicate", "that dependency already exists"),
            TaskGraphService.EdgeError.Cycle => ("cycle", "that would create a dependency cycle; the graph is unchanged"),
            _ => ("error", "could not add the dependency"),
        };
        Audit("link_tasks", $"refused: {status}");
        return new ToolOutcome(false, status, detail, new { source, target });
    }

    public ToolOutcome DeleteTask(string? id)
    {
        // DeleteNode returns the number of edges dropped, or -1 for an unknown id.
        var removed = _graph.DeleteNode((id ?? "").Trim(), Now());
        if (removed < 0)
        {
            Audit("delete_task", $"refused: unknown id {id}");
            return new ToolOutcome(false, "missing", $"no task with id \"{id}\"");
        }
        Audit("delete_task", $"{id} (+{removed} edge(s))");
        return new ToolOutcome(true, "deleted", $"task {id} deleted with {removed} edge(s)", new { id, removedEdges = removed });
    }

    // ---- placement (openspec tasks-agent: task-graph delta) -----------------------------

    /// <summary>Where the next agent-created node goes: the current bottom row
    /// until it holds four, then a new row below it. An empty board starts at the
    /// top-left. Deterministic from the board alone, so a batch created in one
    /// turn lands in readable rows.</summary>
    public (double X, double Y) NextPosition()
    {
        var nodes = _graph.Get().Nodes;
        if (nodes.Count == 0) return (FirstX, FirstY);
        var maxY = nodes.Max(n => n.Y);
        var row = nodes.Where(n => Math.Abs(n.Y - maxY) < 1).ToList();
        if (row.Count < PerRow)
            return (row.Max(n => n.X) + ColumnGap, maxY);
        return (FirstX, maxY + RowGap);
    }

    // ---- helpers -------------------------------------------------------------------------

    private static object IdeaView(NotesService.Note n) => new
    {
        id = n.Id, text = n.Text, project = n.Project, priority = n.Priority, active = n.Active,
        createdAt = n.CreatedAt, updatedAt = n.UpdatedAt,
    };

    private static object NodeView(TaskGraphService.Node n) => new
    {
        id = n.Id, title = n.Title, note = n.Note, repoId = n.RepoId, status = n.Status,
        createdAt = n.CreatedAt, updatedAt = n.UpdatedAt,
    };

    private static string Short(string? s)
    {
        var t = (s ?? "").Replace('\n', ' ').Trim();
        return t.Length > 80 ? t[..80] + "…" : t;
    }

    private void Audit(string tool, string summary)
    {
        try
        {
            _audit.Record(new AutopilotAuditLog.Entry(Now(), TasksAgentService.ReservedId, TasksAgentService.DisplayName,
                "", 1.0, summary, AuditOutcomeTool, false, 0, AuditKind, tool));
        }
        catch (Exception ex)
        {
            _logger.Error($"[TASKS] audit failed for {tool}: {ex.Message}");
        }
    }
}
