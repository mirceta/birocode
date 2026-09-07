using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// fleet task e3b7065c — deleting a task from the board. Covers what the arch delete_task
/// tool and the DELETE endpoint both funnel through: resolve a card by its #ref or a unique
/// prefix (openspec kanban-card-ref), then DeleteNode removes the node, its dependency edges
/// and tombstones them, and restores any idea it was promoted from. Incl. the trash
/// "CANCELLED …" card the Operator wants gone.
/// </summary>
public sealed class TaskDeleteTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-del-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();
    private readonly NotesService _notes;
    private readonly TaskGraphService _graph;

    public TaskDeleteTests()
    {
        Directory.CreateDirectory(_dir);
        _notes = new NotesService(_logger, _dir);
        _graph = new TaskGraphService(_logger, _dir, _notes); // wired: DeleteNode restores the idea
    }

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    [Fact]
    public void Delete_by_ref_removes_the_node_its_edges_and_restores_its_idea()
    {
        var idea = _notes.Add("expose a form", "prg", 3, false, Now())!;
        var dep = _graph.AddNode("prerequisite", null, null, null, 0, 0, Now())!;
        var card = _graph.AddNode("CANCELLED junk card", null, "r1", null, 0, 0, Now(), ideaId: idea.Id)!;
        _graph.AddEdge(card.Id, dep.Id, Now()); // card depends on dep
        Assert.DoesNotContain(_notes.List(), n => n.Id == idea.Id); // promoting consumed the idea

        // The Operator pastes the card's #ref; resolve exactly like the tool does.
        var (resolved, err) = _graph.ResolveTaskRef(TaskGraphService.CardRef(card.Id));
        Assert.Null(err);
        Assert.Equal(card.Id, resolved);

        var dropped = _graph.DeleteNode(resolved!, Now());
        Assert.Equal(1, dropped); // the one dependency edge went with it

        Assert.Null(_graph.Find(card.Id));                                  // card gone
        Assert.NotNull(_graph.Find(dep.Id));                                 // its prerequisite is untouched
        Assert.Empty(_graph.Get().Edges);                                    // no dangling edge
        var restored = _notes.List().SingleOrDefault(n => n.Id == idea.Id);  // idea returned, inactive
        Assert.NotNull(restored);
        Assert.False(restored!.Active);
        Assert.Null(restored.ConsumedByTaskId);
    }

    [Fact]
    public void Delete_by_unique_prefix_resolves_and_removes()
    {
        var card = _graph.AddNode("CANCELLED other junk", null, null, null, 0, 0, Now())!;
        var (resolved, err) = _graph.ResolveTaskRef(card.Id[..8]); // a unique prefix
        Assert.Null(err);
        Assert.Equal(card.Id, resolved);
        Assert.True(_graph.DeleteNode(resolved!, Now()) >= 0);
        Assert.Null(_graph.Find(card.Id));
    }

    [Fact]
    public void Delete_of_a_multi_assignee_card_takes_all_assignee_rows_with_it()
    {
        var card = _graph.AddNode("CANCELLED", null, "r1", null, 0, 0, Now())!;
        _graph.AddAssignee(card.Id, "src-b", "r2", "human", Now());
        Assert.True(TaskGraphService.AssigneesOf(_graph.Find(card.Id)!).Count >= 2);
        _graph.DeleteNode(card.Id, Now());
        Assert.Null(_graph.Find(card.Id)); // node (and the assignee rows it carries) gone
    }

    [Fact]
    public void Deleting_an_unknown_ref_is_reported_not_thrown()
    {
        var (resolved, err) = _graph.ResolveTaskRef("#deadbeef");
        Assert.Null(resolved);
        Assert.NotNull(err);
        Assert.Equal(-1, _graph.DeleteNode("nope", Now()));
    }
}
