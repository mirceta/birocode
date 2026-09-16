using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// fleet task 0a57d282 — the saved Kanban column layout. Server-side per harness: a
/// save round-trips through disk, a fresh service (a reload / another browser) reads it
/// back, an unknown column or an absurd width is normalised away, and "never saved" is
/// an honest null rather than a fabricated default.
/// </summary>
public sealed class KanbanLayoutTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-kbl-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    [Fact]
    public void Nothing_saved_reads_as_null_not_a_default()
    {
        var svc = new KanbanLayoutService(_logger, _dir);
        Assert.Null(svc.Get());
    }

    [Fact]
    public void Save_persists_and_a_fresh_service_restores_visible_set_and_widths_exactly()
    {
        var a = new KanbanLayoutService(_logger, _dir);
        var saved = a.Save(new[] { "done", "todo", "doing" }, new Dictionary<string, int> { ["todo"] = 320, ["doing"] = 200 }, 1_700_000_000_000);
        // Canonical column order, regardless of the order the client sent.
        Assert.Equal(new[] { "todo", "doing", "done" }, saved.Visible);
        Assert.Equal(320, saved.Widths["todo"]);
        Assert.Equal(200, saved.Widths["doing"]);

        var b = new KanbanLayoutService(_logger, _dir); // a reload: nothing in memory
        var back = b.Get();
        Assert.NotNull(back);
        Assert.Equal(saved.Visible, back!.Visible);
        Assert.Equal(saved.Widths, back.Widths);
        Assert.Equal(1_700_000_000_000, back.SavedAt);
    }

    [Fact]
    public void Unknown_columns_are_dropped_and_widths_are_clamped()
    {
        var svc = new KanbanLayoutService(_logger, _dir);
        var saved = svc.Save(new[] { "todo", "blocked", "nope" }, new Dictionary<string, int> { ["todo"] = 5, ["done"] = 99_999, ["ghost"] = 300 }, 1);
        Assert.Equal(new[] { "todo" }, saved.Visible);                       // no such column as blocked/nope
        Assert.Equal(KanbanLayoutService.MinWidth, saved.Widths["todo"]);    // 5 → min
        Assert.Equal(KanbanLayoutService.MaxWidth, saved.Widths["done"]);    // 99999 → max (a hidden column keeps its width)
        Assert.False(saved.Widths.ContainsKey("ghost"));
    }

    [Fact]
    public void Hiding_every_column_is_stored_faithfully()
    {
        // The board renders its own "all columns hidden" note; the store must not
        // second-guess the Operator by re-adding a column.
        var svc = new KanbanLayoutService(_logger, _dir);
        var saved = svc.Save(Array.Empty<string>(), null, 1);
        Assert.Empty(saved.Visible);
        Assert.Empty(saved.Widths);
        Assert.Empty(new KanbanLayoutService(_logger, _dir).Get()!.Visible);
    }

    [Fact]
    public void A_corrupt_file_reads_as_not_saved_instead_of_throwing()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, "kanban-layout.json"), "{ this is not json");
        var svc = new KanbanLayoutService(_logger, _dir);
        Assert.Null(svc.Get());
        // …and saving over it works.
        Assert.Single(svc.Save(new[] { "doing" }, null, 2).Visible);
    }
}
