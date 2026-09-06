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
        // The lifecycle closing convention (openspec kanban-lifecycle-columns):
        // committed-by-default (no push), PR only when the brief allowed it.
        Assert.Contains("TASK COMMITTED t1 <branch> <commit>", text);
        Assert.Contains("TASK PR t1 <url>", text);
        Assert.Contains("TASK BLOCKED t1:", text);
        Assert.Contains("do NOT push", text);
    }

    [Fact]
    public void Dispatch_message_lists_done_prerequisites()
    {
        var pre = new List<TaskGraphService.Node> { new("p1", "Open the gateway", null, null, null, "done", 0, 0, 1, 1) };
        var text = ArchAgentService.DispatchMessage(Node(), pre, "operator", "WIN", "prg");
        Assert.Contains("Prerequisites (all done): Open the gateway.", text);
    }

    // ---- list_tasks filters (openspec task-filters) ----------------------------------------

    private static readonly TaskGraphService.Node[] Board =
    {
        new("a", "Ship filters", null, "r-web", null, "doing", 0, 0, 1, 1),                         // this harness
        new("b", "Arcade sounds", null, "r-arc", null, "todo", 0, 0, 1, 1),                         // this harness
        new("c", "Prg deploy", null, "p1", null, "todo", 0, 0, 1, 1, SourceId: "src-spacex"),         // spacex
        new("d", "Prg tests", null, "p2", null, "done", 0, 0, 1, 1, SourceId: "src-spacex"),          // spacex
        new("e", "Write the plan", null, null, null, "todo", 0, 0, 1, 1),                           // unassigned
    };

    private static string[] Ids(string? status, bool unassigned, bool byMachine, string? source, string? repo) =>
        Board.Where(n => ArchAgentService.TaskMatches(n, status, unassigned, byMachine, source, repo)).Select(n => n.Id).ToArray();

    [Fact]
    public void List_tasks_without_filters_returns_everything()
    {
        Assert.Equal(new[] { "a", "b", "c", "d", "e" }, Ids(null, false, false, null, null));
        Assert.Equal(new[] { "a", "b", "c", "d", "e" }, Ids("", false, false, null, null));
    }

    [Fact]
    public void List_tasks_status_filter_is_case_insensitive_and_trimmed()
    {
        Assert.Equal(new[] { "b", "c", "e" }, Ids("todo", false, false, null, null));
        Assert.Equal(new[] { "d" }, Ids(" Done ", false, false, null, null));
    }

    [Fact]
    public void List_tasks_machine_filter_keeps_assigned_tasks_of_that_harness_only()
    {
        Assert.Equal(new[] { "c", "d" }, Ids(null, false, true, "src-spacex", null));   // a peer
        Assert.Equal(new[] { "a", "b" }, Ids(null, false, true, null, null));           // self (null source)
        Assert.Empty(Ids(null, false, true, "src-nowhere", null));
    }

    [Fact]
    public void List_tasks_agent_filter_keeps_exactly_that_assignee()
    {
        Assert.Equal(new[] { "c" }, Ids(null, false, false, "src-spacex", "p1"));
        Assert.Equal(new[] { "a" }, Ids(null, false, false, null, "r-web"));
        Assert.Empty(Ids(null, false, false, null, "p1")); // p1 lives on spacex, not here
    }

    [Fact]
    public void List_tasks_unassigned_filter_keeps_tasks_without_a_repo()
    {
        Assert.Equal(new[] { "e" }, Ids(null, true, false, null, null));
    }

    [Fact]
    public void List_tasks_filters_and_across_status_and_assignee()
    {
        Assert.Equal(new[] { "c" }, Ids("todo", false, true, "src-spacex", null));
        Assert.Empty(Ids("doing", false, true, "src-spacex", null));
        Assert.Equal(new[] { "e" }, Ids("todo", true, false, null, null));
        Assert.Empty(Ids("done", true, false, null, null));
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
