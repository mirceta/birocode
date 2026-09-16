using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// fleet task 576ead63 — renaming a Kanban card / editing its description. Both the
/// board's operator PATCH (title / note) and the arch's update_task funnel into
/// TaskGraphService.UpdateNode, so this pins that ONE path: a rename changes only the
/// display title, a description edit only the note, the id (and so the #ref the Operator
/// pastes) is untouched and still resolves, and a blank title is refused unchanged.
/// </summary>
public sealed class TaskRenameTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-ren-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();
    private readonly TaskGraphService _graph;

    public TaskRenameTests()
    {
        Directory.CreateDirectory(_dir);
        _graph = new TaskGraphService(_logger, _dir, new NotesService(_logger, _dir));
    }

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    [Fact]
    public void Rename_changes_only_the_title_and_keeps_id_ref_status_note_and_assignees()
    {
        var card = _graph.AddNode("feat/x-7f3a: impl svc + ctl", "original note", "r1", null, 0, 0, Now(), createdBy: "arch")!;
        _graph.UpdateNode(card.Id, null, null, null, null, "doing", null, null, Now());
        var refBefore = TaskGraphService.CardRef(card.Id);

        var renamed = _graph.UpdateNode(card.Id, "  Export the invoice register as CSV  ", null, null, null, null, null, null, Now());

        Assert.NotNull(renamed);
        Assert.Equal("Export the invoice register as CSV", renamed!.Title);   // trimmed
        Assert.Equal(card.Id, renamed.Id);                                      // id untouched
        Assert.Equal(refBefore, TaskGraphService.CardRef(renamed.Id));          // so the #ref is too
        Assert.Equal("original note", renamed.Note);                            // a title-only PATCH keeps the note
        Assert.Equal("doing", renamed.Status);
        Assert.Equal("r1", renamed.RepoId);
        Assert.Single(TaskGraphService.AssigneesOf(renamed));
        Assert.Equal("arch", renamed.CreatedBy);
    }

    [Fact]
    public void Describe_changes_only_the_note_and_an_empty_note_clears_it()
    {
        var card = _graph.AddNode("cryptic", "old", null, null, 0, 0, Now())!;

        var described = _graph.UpdateNode(card.Id, null, "Rewritten in the Operator's words.\nSecond line.", null, null, null, null, null, Now())!;
        Assert.Equal("cryptic", described.Title);                                // a note-only PATCH keeps the title
        Assert.Equal("Rewritten in the Operator's words.\nSecond line.", described.Note);

        var cleared = _graph.UpdateNode(card.Id, null, "", null, null, null, null, null, Now())!;
        Assert.Null(cleared.Note);                                               // "" clears; null would have kept it
        Assert.Equal("cryptic", cleared.Title);
        Assert.Equal(card.Id, cleared.Id);
    }

    [Fact]
    public void A_blank_title_is_refused_and_nothing_changes()
    {
        var card = _graph.AddNode("keep me", "n", null, null, 0, 0, Now())!;
        Assert.Null(_graph.UpdateNode(card.Id, "   ", null, null, null, null, null, null, Now()));
        var after = _graph.Find(card.Id)!;
        Assert.Equal("keep me", after.Title);
        Assert.Equal("n", after.Note);
    }

    [Fact]
    public void The_pasted_ref_still_resolves_to_the_same_task_after_a_rename()
    {
        var card = _graph.AddNode("a1b2c3-agent-name", null, null, null, 0, 0, Now())!;
        var reference = TaskGraphService.CardRef(card.Id); // "#xxxxxxxx", what the Operator pasted earlier
        _graph.UpdateNode(card.Id, "Readable name", null, null, null, null, null, null, Now());

        var (resolved, err) = _graph.ResolveTaskRef(reference);
        Assert.Null(err);
        Assert.Equal(card.Id, resolved);
        Assert.Equal("Readable name", _graph.Find(resolved!)!.Title);
    }

    [Fact]
    public void Rename_survives_a_reload_of_the_store()
    {
        var card = _graph.AddNode("cryptic", "body", null, null, 0, 0, Now())!;
        _graph.UpdateNode(card.Id, "Readable", "Readable body", null, null, null, null, null, Now());

        var reloaded = new TaskGraphService(_logger, _dir, new NotesService(_logger, _dir)).Find(card.Id)!;
        Assert.Equal("Readable", reloaded.Title);
        Assert.Equal("Readable body", reloaded.Note);
    }
}
