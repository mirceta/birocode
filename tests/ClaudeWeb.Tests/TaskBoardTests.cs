using System.Text.Json;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec task-board-kanban: the pure parts of the shared task board — the
/// brief a repo agent receives when a task is dispatched, and the node record's
/// compatibility with boards (and sync peers) that predate assignment.</summary>
public class TaskBoardTests
{
    private static TaskGraphService.Node Node(string? note = null, string? repo = "r1", string? by = "human") =>
        new("t1", "Ship the thing", note, repo, null, "todo", 0, 0, 1, 1, SourceId: null, AssignedBy: by, AssignedAt: 1);

    [Fact]
    public void Dispatch_message_carries_title_id_assignee_and_closing_convention()
    {
        var text = ArchAgentService.DispatchMessage(Node("Acceptance: tests green."), Array.Empty<TaskGraphService.Node>(), "arch", "MONSTER", "game-arcade");
        Assert.StartsWith("[Task from the fleet board] Ship the thing", text);
        Assert.Contains("Task id: t1", text);
        Assert.Contains("game-arcade on MONSTER", text);
        Assert.Contains("Acceptance: tests green.", text);
        Assert.Contains("Prerequisites: none.", text);
        Assert.Contains("TASK DONE t1", text);
        Assert.Contains("TASK BLOCKED t1:", text);
    }

    [Fact]
    public void Dispatch_message_lists_done_prerequisites()
    {
        var pre = new List<TaskGraphService.Node> { new("p1", "Open the gateway", null, null, null, "done", 0, 0, 1, 1) };
        var text = ArchAgentService.DispatchMessage(Node(), pre, "operator", "WIN", "prg");
        Assert.Contains("Prerequisites (all done): Open the gateway.", text);
    }

    [Fact]
    public void Old_node_json_without_assignment_fields_reads_back_with_defaults()
    {
        const string json = "{\"Id\":\"a\",\"Title\":\"t\",\"Note\":null,\"RepoId\":null,\"MachineId\":null,\"Status\":\"todo\",\"X\":1,\"Y\":2,\"CreatedAt\":3,\"UpdatedAt\":4}";
        var n = JsonSerializer.Deserialize<TaskGraphService.Node>(json)!;
        Assert.Null(n.SourceId);
        Assert.Null(n.AssignedBy);
        Assert.Null(n.DispatchedAt);
        Assert.Equal(0, n.DispatchCount);
        Assert.Null(n.IdeaId);
        // Round trip keeps the new fields once set.
        var again = JsonSerializer.Deserialize<TaskGraphService.Node>(JsonSerializer.Serialize(n with { SourceId = "s", DispatchCount = 2 }))!;
        Assert.Equal("s", again.SourceId);
        Assert.Equal(2, again.DispatchCount);
    }
}
