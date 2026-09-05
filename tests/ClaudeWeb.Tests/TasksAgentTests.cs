using System.Text.Json;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.TaskGraph;
using ClaudeWeb.Services.Tasks;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Unit coverage for the Tasks agent's tool layer (openspec: tasks-agent,
/// task 3.1): the tool list, a create + link round trip through the JSON-RPC
/// face, a cycle surfacing as a tool error, and the bearer check. Everything is
/// temp-dir backed — no harness, no CLI.</summary>
public sealed class TasksAgentTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-tasks-" + Guid.NewGuid().ToString("N"));
    private readonly NotesService _notes;
    private readonly TaskGraphService _graph;
    private readonly AutopilotAuditLog _audit;
    private readonly TasksToolbox _tools;
    private readonly TasksMcpServer _mcp;

    public TasksAgentTests()
    {
        Directory.CreateDirectory(_dir);
        var logger = new Logger();
        _notes = new NotesService(logger, _dir);
        _graph = new TaskGraphService(logger, _dir);
        _audit = new AutopilotAuditLog(logger, _dir);
        _tools = new TasksToolbox(_notes, _graph, _audit, logger);
        _mcp = new TasksMcpServer(_tools);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    private static JsonObject Rpc(string method, JsonObject? @params = null, int id = 1) => new()
    {
        ["jsonrpc"] = "2.0",
        ["id"] = id,
        ["method"] = method,
        ["params"] = @params,
    };

    private JsonElement CallTool(string name, JsonObject args)
    {
        var reply = _mcp.Handle(Rpc("tools/call", new JsonObject { ["name"] = name, ["arguments"] = args }));
        Assert.Equal(200, reply.Status);
        var text = reply.Body!["result"]!["content"]![0]!["text"]!.GetValue<string>();
        return JsonDocument.Parse(text).RootElement;
    }

    // ---- tools/list ---------------------------------------------------------------------

    [Fact]
    public void Tool_list_is_exactly_the_eight_tools()
    {
        var reply = _mcp.Handle(Rpc("tools/list"));
        Assert.Equal(200, reply.Status);
        var names = reply.Body!["result"]!["tools"]!.AsArray().Select(t => t!["name"]!.GetValue<string>()).ToList();
        Assert.Equal(new[] { "list_ideas", "create_idea", "update_idea", "list_tasks", "create_task", "update_task", "link_tasks", "delete_task" }, names);
        Assert.Equal(names, TasksMcpServer.ToolNames);
        Assert.All(reply.Body!["result"]!["tools"]!.AsArray(), t => Assert.NotNull(t!["inputSchema"]));
    }

    [Fact]
    public void Initialize_advertises_tools_and_unknown_tool_is_an_rpc_error()
    {
        var init = _mcp.Handle(Rpc("initialize", new JsonObject { ["protocolVersion"] = "2025-03-26" }));
        Assert.Equal("claude-web-tasks", init.Body!["result"]!["serverInfo"]!["name"]!.GetValue<string>());
        Assert.NotNull(init.Body!["result"]!["capabilities"]!["tools"]);

        var bad = _mcp.Handle(Rpc("tools/call", new JsonObject { ["name"] = "send_task", ["arguments"] = new JsonObject() }));
        Assert.Equal(-32602, bad.Body!["error"]!["code"]!.GetValue<int>());
    }

    // ---- create + link round trip ---------------------------------------------------------

    [Fact]
    public void Create_task_and_link_tasks_round_trip_lands_in_the_graph_and_the_audit()
    {
        var a = CallTool("create_task", new JsonObject { ["title"] = "Add the Tasks MCP server", ["note"] = "eight tools" });
        var b = CallTool("create_task", new JsonObject { ["title"] = "Wire the Ideas button" });
        Assert.True(a.GetProperty("ok").GetBoolean());
        Assert.Equal("created", a.GetProperty("status").GetString());
        var aId = a.GetProperty("data").GetProperty("id").GetString()!;
        var bId = b.GetProperty("data").GetProperty("id").GetString()!;

        var link = CallTool("link_tasks", new JsonObject { ["source"] = bId, ["target"] = aId });
        Assert.True(link.GetProperty("ok").GetBoolean());
        Assert.Equal("linked", link.GetProperty("status").GetString());

        var board = _graph.Get();
        Assert.Equal(2, board.Nodes.Count);
        var edge = Assert.Single(board.Edges);
        Assert.Equal(bId, edge.Source);
        Assert.Equal(aId, edge.Target);
        Assert.Equal("todo", board.Nodes.First(n => n.Id == aId).Status);
        Assert.Equal("eight tools", board.Nodes.First(n => n.Id == aId).Note);

        // Auto-placement: the second node sits to the right of the first on the same row.
        var na = board.Nodes.First(n => n.Id == aId);
        var nb = board.Nodes.First(n => n.Id == bId);
        Assert.Equal(na.Y, nb.Y);
        Assert.True(nb.X > na.X);

        var rows = _audit.Recent(50).Where(e => e.Kind == TasksToolbox.AuditKind && e.Outcome == TasksToolbox.AuditOutcomeTool).ToList();
        Assert.Equal(3, rows.Count);
        Assert.Equal(new[] { "link_tasks", "create_task", "create_task" }, rows.Select(r => r.Phase).ToArray()); // newest first
        Assert.All(rows, r => Assert.Equal(TasksAgentService.ReservedId, r.RepoId));

        // list_tasks reports both nodes and the edge as data.
        var list = CallTool("list_tasks", new JsonObject());
        Assert.Equal(2, list.GetProperty("data").GetProperty("nodes").GetArrayLength());
        Assert.Equal(1, list.GetProperty("data").GetProperty("edges").GetArrayLength());
    }

    [Fact]
    public void A_fifth_node_starts_a_new_row()
    {
        var ids = Enumerable.Range(0, 5).Select(i => CallTool("create_task", new JsonObject { ["title"] = $"t{i}" }).GetProperty("data").GetProperty("id").GetString()!).ToList();
        var nodes = _graph.Get().Nodes;
        var firstRowY = nodes.First(n => n.Id == ids[0]).Y;
        Assert.All(ids.Take(4), id => Assert.Equal(firstRowY, nodes.First(n => n.Id == id).Y));
        Assert.True(nodes.First(n => n.Id == ids[4]).Y > firstRowY);
        Assert.Equal(nodes.First(n => n.Id == ids[0]).X, nodes.First(n => n.Id == ids[4]).X);
    }

    // ---- cycle surfaces as a tool error ----------------------------------------------------

    [Fact]
    public void A_cycle_is_refused_as_an_error_and_leaves_the_graph_unchanged()
    {
        var a = CallTool("create_task", new JsonObject { ["title"] = "A" }).GetProperty("data").GetProperty("id").GetString()!;
        var b = CallTool("create_task", new JsonObject { ["title"] = "B" }).GetProperty("data").GetProperty("id").GetString()!;
        Assert.True(CallTool("link_tasks", new JsonObject { ["source"] = a, ["target"] = b }).GetProperty("ok").GetBoolean());

        var reply = _mcp.Handle(Rpc("tools/call", new JsonObject { ["name"] = "link_tasks", ["arguments"] = new JsonObject { ["source"] = b, ["target"] = a } }));
        Assert.True(reply.Body!["result"]!["isError"]!.GetValue<bool>());
        var outcome = JsonDocument.Parse(reply.Body!["result"]!["content"]![0]!["text"]!.GetValue<string>()).RootElement;
        Assert.False(outcome.GetProperty("ok").GetBoolean());
        Assert.Equal("cycle", outcome.GetProperty("status").GetString());
        Assert.Single(_graph.Get().Edges);

        var dup = CallTool("link_tasks", new JsonObject { ["source"] = a, ["target"] = b });
        Assert.Equal("duplicate", dup.GetProperty("status").GetString());
        var self = CallTool("link_tasks", new JsonObject { ["source"] = a, ["target"] = a });
        Assert.Equal("self-loop", self.GetProperty("status").GetString());
        var missing = CallTool("link_tasks", new JsonObject { ["source"] = a, ["target"] = "nope" });
        Assert.Equal("missing-node", missing.GetProperty("status").GetString());
    }

    // ---- ideas ---------------------------------------------------------------------------------

    [Fact]
    public void Update_idea_keeps_the_fields_it_does_not_name()
    {
        var created = CallTool("create_idea", new JsonObject { ["text"] = "share the board", ["project"] = "harness", ["priority"] = 3, ["active"] = true });
        var id = created.GetProperty("data").GetProperty("id").GetString()!;
        var updated = CallTool("update_idea", new JsonObject { ["id"] = id, ["priority"] = 5 });
        Assert.True(updated.GetProperty("ok").GetBoolean());
        var note = _notes.List().Single(n => n.Id == id);
        Assert.Equal("share the board", note.Text);
        Assert.Equal("harness", note.Project);
        Assert.Equal(5, note.Priority);
        Assert.True(note.Active);

        var missing = CallTool("update_idea", new JsonObject { ["id"] = "nope", ["text"] = "x" });
        Assert.Equal("missing", missing.GetProperty("status").GetString());
    }

    // ---- bearer ------------------------------------------------------------------------------

    [Fact]
    public void Bearer_rejects_missing_wrong_and_near_miss_tokens_and_accepts_its_own()
    {
        var bearer = new McpBearer();
        Assert.False(bearer.Validate(null));
        Assert.False(bearer.Validate(""));
        Assert.False(bearer.Validate("deadbeef"));
        Assert.False(bearer.Validate(bearer.Token[..^1] + (bearer.Token[^1] == 'A' ? 'B' : 'A')));
        Assert.False(bearer.Validate(new McpBearer().Token));
        Assert.True(bearer.Validate(bearer.Token));

        Assert.False(bearer.ValidateHeader(null));
        Assert.False(bearer.ValidateHeader("Basic abc"));
        Assert.False(bearer.ValidateHeader("Bearer "));
        Assert.True(bearer.ValidateHeader("Bearer " + bearer.Token));
        Assert.True(bearer.ValidateHeader("bearer " + bearer.Token));
    }

    [Fact]
    public void Reserved_id_is_not_a_repo()
    {
        Assert.True(ClaudeWeb.Services.Repositories.RepositoryResolver.IsReserved("@tasks"));
        Assert.True(TasksAgentService.IsReserved("@tasks"));
        Assert.False(TasksAgentService.IsReserved("@arch"));
        Assert.Equal(ClaudeWeb.Services.Arch.ArchAgentService.DisallowedTools, TasksAgentService.DisallowedTools);
    }
}
