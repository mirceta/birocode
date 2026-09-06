using System.Text.Json.Nodes;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec ideas-consume-on-promotion: promoting an idea into a task consumes it
/// (off the Ideas list, linked to the task), deleting the task restores it inactive,
/// completing the task keeps it consumed, the includeConsumed flag reveals consumed
/// ideas, and a startup migration consumes ideas that already have a task. Everything
/// is temp-dir backed through the same NotesService/TaskGraphService paths the arch
/// idea_to_task tool and the UI promote actions use (both go through AddNode/DeleteNode).
/// </summary>
public sealed class IdeasConsumeTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-consume-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();
    private readonly NotesService _notes;
    private readonly TaskGraphService _graph;

    public IdeasConsumeTests()
    {
        Directory.CreateDirectory(_dir);
        _notes = new NotesService(_logger, _dir);
        _graph = new TaskGraphService(_logger, _dir, _notes); // wired: AddNode consumes, DeleteNode restores
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    // The promotion path used by both idea_to_task and the UI: a node carrying the idea id.
    private TaskGraphService.Node Promote(NotesService.Note idea, string? title = null) =>
        _graph.AddNode(title ?? idea.Text, idea.Project, null, null, 0, 0, Now(), ideaId: idea.Id)!;

    [Fact]
    public void Promoting_an_idea_consumes_it_and_hides_it_by_default()
    {
        var idea = _notes.Add("expose a form", "prg", 3, true, Now())!;
        var node = Promote(idea);

        // Gone from the default list (all views + list_ideas read this).
        Assert.DoesNotContain(_notes.List(), n => n.Id == idea.Id);
        // Visible with the flag, flagged consumed and linked to the task.
        var consumed = _notes.List(includeConsumed: true).Single(n => n.Id == idea.Id);
        Assert.Equal(node.Id, consumed.ConsumedByTaskId);
        Assert.False(consumed.Active); // a consumed idea is no longer active idea-work
    }

    [Fact]
    public void IncludeConsumed_flag_toggles_visibility()
    {
        var kept = _notes.Add("still an idea", null, 0, false, Now())!;
        var promoted = _notes.Add("becomes a task", null, 0, false, Now())!;
        Promote(promoted);

        var defaultList = _notes.List();
        Assert.Contains(defaultList, n => n.Id == kept.Id);
        Assert.DoesNotContain(defaultList, n => n.Id == promoted.Id);

        var full = _notes.List(includeConsumed: true);
        Assert.Contains(full, n => n.Id == kept.Id);
        Assert.Contains(full, n => n.Id == promoted.Id);
    }

    [Fact]
    public void Deleting_the_task_restores_the_idea_as_inactive_with_original_fields()
    {
        var idea = _notes.Add("restore me", "projX", 4, true, Now())!;
        var node = Promote(idea);
        Assert.DoesNotContain(_notes.List(), n => n.Id == idea.Id);

        _graph.DeleteNode(node.Id, Now());

        var restored = _notes.List().Single(n => n.Id == idea.Id); // back in the default list
        Assert.Null(restored.ConsumedByTaskId);
        Assert.False(restored.Active);            // returns inactive
        Assert.Equal("restore me", restored.Text); // original text/project/priority preserved
        Assert.Equal("projX", restored.Project);
        Assert.Equal(4, restored.Priority);
    }

    [Fact]
    public void Completing_the_task_keeps_the_idea_consumed()
    {
        var idea = _notes.Add("done not deleted", null, 0, false, Now())!;
        var node = Promote(idea);

        _graph.UpdateNode(node.Id, null, null, null, null, "done", null, null, Now());

        Assert.DoesNotContain(_notes.List(), n => n.Id == idea.Id); // still consumed
        Assert.Equal(node.Id, _notes.List(includeConsumed: true).Single(n => n.Id == idea.Id).ConsumedByTaskId);
    }

    [Fact]
    public void Deleting_a_task_never_frees_an_idea_linked_to_a_different_task()
    {
        var idea = _notes.Add("one idea", null, 0, false, Now())!;
        var node = Promote(idea);
        // A stray unrelated node id must not restore this idea.
        var other = _graph.AddNode("unrelated", null, null, null, 0, 0, Now())!;
        _graph.DeleteNode(other.Id, Now());
        Assert.DoesNotContain(_notes.List(), n => n.Id == idea.Id); // still consumed by `node`
        Assert.Equal(node.Id, _notes.List(includeConsumed: true).Single(n => n.Id == idea.Id).ConsumedByTaskId);
    }

    [Fact]
    public async Task Startup_migration_consumes_ideas_that_already_have_a_task()
    {
        var idea = _notes.Add("legacy promoted", "p", 2, false, Now())!;
        // Simulate a PRE-EXISTING promotion: a node carrying the idea id created WITHOUT
        // the consume wiring (an unwired graph over a separate dir), so the idea is still
        // on the list — exactly the state an old board is in before this change.
        var dir2 = Path.Combine(_dir, "g2");
        var unwired = new TaskGraphService(_logger, dir2);
        var node = unwired.AddNode("legacy promoted", null, null, null, 0, 0, Now(), ideaId: idea.Id)!;
        Assert.Contains(_notes.List(), n => n.Id == idea.Id); // not consumed yet

        await new ConsumedIdeaMigration(_notes, unwired, _logger).StartAsync(default);

        Assert.DoesNotContain(_notes.List(), n => n.Id == idea.Id);
        Assert.Equal(node.Id, _notes.List(includeConsumed: true).Single(n => n.Id == idea.Id).ConsumedByTaskId);
    }

    [Fact]
    public void Reconcile_is_idempotent_and_ignores_unknown_or_already_consumed()
    {
        var a = _notes.Add("a", null, 0, false, Now())!;
        var b = _notes.Add("b", null, 0, false, Now())!;
        // a -> task1 (new), b already consumed by task0, plus an unknown idea id.
        _notes.Consume(b.Id, "task0", Now());
        var links = new Dictionary<string, string> { [a.Id] = "task1", [b.Id] = "taskX", ["ghost"] = "taskY" };

        Assert.Equal(1, _notes.ReconcileConsumed(links, Now())); // only `a` newly consumed
        Assert.Equal(0, _notes.ReconcileConsumed(links, Now())); // second pass is a no-op
        Assert.Equal("task1", _notes.List(includeConsumed: true).Single(n => n.Id == a.Id).ConsumedByTaskId);
        Assert.Equal("task0", _notes.List(includeConsumed: true).Single(n => n.Id == b.Id).ConsumedByTaskId); // untouched
    }

    [Fact]
    public void Consumption_state_round_trips_through_reload()
    {
        var idea = _notes.Add("persist", null, 1, false, Now())!;
        var node = Promote(idea);
        // A fresh service over the same dir reads the persisted consumed flag.
        var reloaded = new NotesService(_logger, _dir);
        Assert.DoesNotContain(reloaded.List(), n => n.Id == idea.Id);
        Assert.Equal(node.Id, reloaded.List(includeConsumed: true).Single(n => n.Id == idea.Id).ConsumedByTaskId);
    }

    // ---- tool surface (the flag plumbing) ------------------------------------------------

    [Fact]
    public void Arch_tool_schema_exposes_includeConsumed_and_documents_consumption()
    {
        var tools = ArchMcpServer.ToolsList();

        var listIdeas = tools.OfType<JsonObject>().Single(t => (string?)t["name"] == "list_ideas");
        var props = (JsonObject)listIdeas["inputSchema"]!["properties"]!;
        Assert.True(props.ContainsKey("includeConsumed"));

        var ideaToTask = tools.OfType<JsonObject>().Single(t => (string?)t["name"] == "idea_to_task");
        Assert.Contains("CONSUMED", (string)ideaToTask["description"]!);
    }
}
