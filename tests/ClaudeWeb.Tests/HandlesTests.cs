using System.Text.Json;
using ClaudeWeb.Services;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec stable-handles: repo handles (slug + #k, unique, stable, backfill in
/// list order), agent references resolved by handle / name / id, idea numbers
/// (allocation, stability across edit and reload, backfill of an old store, lookup
/// by "#12" / "12" / id, ambiguity reported).</summary>
public class HandlesTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-handles-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();

    public HandlesTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    // ---- repo handles -------------------------------------------------------------------

    [Theory]
    [InlineData("prg", "prg")]
    [InlineData("Claude Web (this app)", "claude-web-this-app")]
    [InlineData("  Sunny Project ", "sunny-project")]
    [InlineData("___", "repo")]
    public void Slug_is_lowercase_dashed_and_never_empty(string name, string expected) => Assert.Equal(expected, Handles.Slug(name));

    [Fact]
    public void Repeated_names_get_numbered_suffixes_in_list_order()
    {
        var h = Handles.AssignRepoHandles(new[] { ("a", "prg", (string?)null), ("b", "prg", null), ("c", "PRG", null), ("d", "fluent", null) });
        Assert.Equal("prg", h["a"]);
        Assert.Equal("prg#2", h["b"]);
        Assert.Equal("prg#3", h["c"]);
        Assert.Equal("fluent", h["d"]);
        Assert.Equal(4, h.Values.Distinct(StringComparer.OrdinalIgnoreCase).Count());
    }

    [Fact]
    public void Existing_handles_are_kept_and_never_reshuffled()
    {
        // "b" already holds prg#2 and "a" was removed: a newcomer named prg takes the first
        // free suffix (prg — the bare slug is free again) without touching prg#2.
        var h = Handles.AssignRepoHandles(new[] { ("b", "prg", (string?)"prg#2"), ("e", "prg", null), ("f", "prg", null) });
        Assert.Equal("prg#2", h["b"]);
        Assert.Equal("prg", h["e"]);
        Assert.Equal("prg#3", h["f"]);
        // A second backfill over the same list changes nothing.
        var again = Handles.AssignRepoHandles(new[] { ("b", "prg", (string?)"prg#2"), ("e", "prg", (string?)"prg"), ("f", "prg", (string?)"prg#3") });
        Assert.Equal(h, again);
    }

    [Theory]
    [InlineData("spacex/prg#2", "spacex", "prg#2")]
    [InlineData("prg#2", null, "prg#2")]
    [InlineData("a1b2c3d4e5f6478890abcdef12345678", null, "a1b2c3d4e5f6478890abcdef12345678")]
    [InlineData(" MONSTER / game-arcade ", "MONSTER", "game-arcade")]
    public void Agent_reference_splits_machine_and_repo(string reference, string? machine, string repo)
    {
        var (m, r) = Handles.ParseAgentRef(reference);
        Assert.Equal(machine, m);
        Assert.Equal(repo, r);
    }

    [Fact]
    public void Repo_reference_resolves_by_id_then_handle_then_unique_name()
    {
        var cands = new List<(string, string, string)> { ("id1", "prg", "prg"), ("id2", "prg#2", "prg"), ("id3", "fluent", "fluent") };
        Assert.Equal("id2", Handles.ResolveRepoRef("id2", cands, "spacex").Id);
        Assert.Equal("id2", Handles.ResolveRepoRef("PRG#2", cands, "spacex").Id);
        Assert.Equal("id3", Handles.ResolveRepoRef("fluent", cands, "spacex").Id);
        var (id, err) = Handles.ResolveRepoRef("prg", cands, "spacex");
        // "prg" is a handle (id1) — a handle match beats the ambiguous name.
        Assert.Equal("id1", id);
        Assert.Null(err);
        var (none, why) = Handles.ResolveRepoRef("nope", cands, "spacex");
        Assert.Null(none);
        Assert.Contains("spacex/prg#2", why);
    }

    [Fact]
    public void Ambiguous_name_is_reported_with_the_handles_to_use()
    {
        var cands = new List<(string, string, string)> { ("id1", "x-prg", "prg"), ("id2", "y-prg", "prg") };
        var (id, err) = Handles.ResolveRepoRef("prg", cands, "spacex");
        Assert.Null(id);
        Assert.Contains("spacex/x-prg", err);
        Assert.Contains("spacex/y-prg", err);
    }

    // ---- idea numbers -------------------------------------------------------------------

    [Theory]
    [InlineData("#12", 12)]
    [InlineData("12", 12)]
    [InlineData(" #7 ", 7)]
    [InlineData("#0", null)]
    [InlineData("c8859d0967f94b81b6a430f13d881ca6", null)]
    public void Idea_reference_parses_numbers_only(string reference, int? expected) => Assert.Equal(expected, Handles.ParseIdeaRef(reference));

    [Fact]
    public void Ideas_get_running_numbers_that_survive_edits_and_reloads()
    {
        var notes = new NotesService(_logger, _dir);
        var a = notes.Add("first", null, 0, false, 1)!;
        var b = notes.Add("second", null, 0, false, 2)!;
        Assert.Equal(1, a.Number);
        Assert.Equal(2, b.Number);
        var edited = notes.Update(a.Id, "first, edited", "p", 3, true, 3)!;
        Assert.Equal(1, edited.Number);
        notes.Delete(b.Id, 4);
        var c = notes.Add("third", null, 0, false, 5)!;
        Assert.Equal(2, c.Number); // the highest live number + 1; numbers are not reused across a delete? — they are: max is over live notes

        var reloaded = new NotesService(_logger, _dir);
        Assert.Equal(1, reloaded.FindByRef("#1").Note!.Number);
        Assert.Equal("third", reloaded.FindByRef("2").Note!.Text);
        Assert.Equal(edited.Id, reloaded.FindByRef(edited.Id).Note!.Id);
    }

    [Fact]
    public void Old_store_without_numbers_is_backfilled_in_creation_order_once()
    {
        var legacy = new
        {
            Ideas = new[]
            {
                new { Id = "n2", Text = "later", Project = (string?)null, CreatedAt = 200L, UpdatedAt = 200L, Priority = 0, Active = false },
                new { Id = "n1", Text = "earlier", Project = (string?)null, CreatedAt = 100L, UpdatedAt = 100L, Priority = 0, Active = true },
            },
        };
        File.WriteAllText(Path.Combine(_dir, "notes.json"), JsonSerializer.Serialize(legacy));

        var notes = new NotesService(_logger, _dir);
        Assert.Equal(1, notes.FindByRef("n1").Note!.Number);
        Assert.Equal(2, notes.FindByRef("n2").Note!.Number);
        var added = notes.Add("new", null, 0, false, 300)!;
        Assert.Equal(3, added.Number);

        // Persisted: a second load sees the same numbers, and nothing is renumbered.
        var again = new NotesService(_logger, _dir);
        Assert.Equal(1, again.FindByRef("#1").Note!.Number);
        Assert.Equal("earlier", again.FindByRef("#1").Note!.Text);
        Assert.Equal(3, again.FindByRef("#3").Note!.Number);
    }

    [Fact]
    public void Unknown_and_ambiguous_idea_references_are_named()
    {
        var notes = new NotesService(_logger, _dir);
        notes.Add("one", null, 0, false, 1);
        var (none, why) = notes.FindByRef("#9");
        Assert.Null(none);
        Assert.Equal("no idea #9", why);
        var (bad, why2) = notes.FindByRef("zzz");
        Assert.Null(bad);
        Assert.Contains("#<number>", why2);

        // A cross-box merge can bring a note that carries a number already taken here.
        notes.MergeFrom(new List<NotesService.Note> { new("remote", "twin", null, 5, 5, 0, false, 1) }, new List<NotesService.Tombstone>());
        var (dup, why3) = notes.FindByRef("#1");
        Assert.Null(dup);
        Assert.Contains("ambiguous", why3);
        Assert.NotNull(notes.FindByRef("remote").Note); // the id still works
    }

    [Fact]
    public void Merge_backfills_numbers_for_remote_notes_that_have_none()
    {
        var notes = new NotesService(_logger, _dir);
        notes.Add("mine", null, 0, false, 1);
        notes.MergeFrom(new List<NotesService.Note> { new("remote", "theirs", null, 2, 2, 0, false) }, new List<NotesService.Tombstone>());
        Assert.Equal(2, notes.FindByRef("remote").Note!.Number);
    }
}
