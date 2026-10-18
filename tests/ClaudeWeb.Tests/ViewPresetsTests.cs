using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Settings;
using Xunit;
using P = ClaudeWeb.Services.Settings.ViewPresetsService.Preset;
using Pane = ClaudeWeb.Services.Settings.ViewPresetsService.PresetPane;

namespace ClaudeWeb.Tests;

/// <summary>
/// fleet task d6e499cd — the hub copy of the Management dashboard's layout presets: a save
/// round-trips through disk (another browser reads the same list), malformed entries are
/// dropped, fractions stay aligned with the panes and sum to 1, and the count is capped.
/// </summary>
public sealed class ViewPresetsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-vp-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private static P Make(string id, string name, params (string tab, double f)[] panes) =>
        new(id, name, false, panes.Select(p => new Pane(p.tab)).ToList(), panes.Select(p => p.f).ToList(), 1, 2);

    [Fact]
    public void Never_saved_reads_as_an_empty_list()
    {
        var s = new ViewPresetsService(_logger, _dir).Get();
        Assert.Empty(s.Presets);
        Assert.Equal(0, s.SavedAt);
    }

    [Fact]
    public void Save_persists_and_a_fresh_service_reads_the_same_presets()
    {
        var a = new ViewPresetsService(_logger, _dir);
        a.Save(new[]
        {
            Make("p1", "Status | Kanban | Subagents", ("status", 0.2), ("kanban", 0.3), ("subagents", 0.5)),
            new P("p2", "Chat", true, new List<Pane> { new("subagents", "conv-1") }, new List<double> { 1 }, 3, 4),
        }, 99);
        var back = new ViewPresetsService(_logger, _dir).Get();
        Assert.Equal(99, back.SavedAt);
        Assert.Equal(new[] { "p1", "p2" }, back.Presets.Select(p => p.Id));
        Assert.Equal(new[] { "status", "kanban", "subagents" }, back.Presets[0].Panes.Select(p => p.Tab));
        Assert.Equal(new[] { 0.2, 0.3, 0.5 }, back.Presets[0].Fractions);
        Assert.Equal("conv-1", back.Presets[1].Panes[0].Sel);
        Assert.True(back.Presets[1].Auto);
    }

    [Fact]
    public void Malformed_presets_and_panes_are_dropped_and_fractions_renormalised()
    {
        var list = ViewPresetsService.Normalize(new P?[]
        {
            null,
            Make("bad id!", "x", ("status", 1)),
            Make("ok", "  ", ("status", 2), ("BAD TAB", 1), ("status", 1), ("kanban", 0)),
            Make("ok", "duplicate id", ("memory", 1)),
            Make("empty", "no panes"),
        });
        var p = Assert.Single(list);
        Assert.Equal(new[] { "status", "kanban" }, p.Panes.Select(x => x.Tab));
        Assert.Equal("status | kanban", p.Name);               // blank name -> the tab keys
        Assert.Equal(new[] { 0.5, 0.5 }, p.Fractions);         // a zero fraction gets an equal share
    }

    [Fact]
    public void At_most_nine_presets_are_kept()
    {
        var many = Enumerable.Range(0, 12).Select(i => (P?)Make("p" + i, "n" + i, ("status", 1)));
        Assert.Equal(ViewPresetsService.MaxPresets, ViewPresetsService.Normalize(many).Count);
    }
}
