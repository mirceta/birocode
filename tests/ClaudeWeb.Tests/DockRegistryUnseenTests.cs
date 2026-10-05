using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec status-agents-attention: the dock's unseen-result latch now sets on EVERY tab of a
/// repo at a run's finish (grid-visible ones too — the fleet Status tab marks a finished agent
/// wherever its dock is), is cleared by the Operator's dedicated acknowledgement
/// (<see cref="DockRegistry.ClearUnseenForRepo"/>), still clears when a hidden dock is shown,
/// and survives a reload of the store.
/// </summary>
public sealed class DockRegistryUnseenTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cw-dock-unseen-" + Guid.NewGuid().ToString("N"));
    public DockRegistryUnseenTests() { Directory.CreateDirectory(_dir); }
    public void Dispose() { try { Directory.Delete(_dir, true); } catch { /* best effort */ } }

    [Fact]
    public void A_finish_latches_visible_and_hidden_tabs_of_the_repo_and_the_dedicated_clear_resets_them()
    {
        var dock = new DockRegistry(new Logger(), _dir);
        var shown = dock.Add("r-prg", "prg");
        var hidden = dock.Add("r-prg", "prg");
        var other = dock.Add("r-web", "web");
        dock.Update(hidden.Id, null, null, null, null, false, null, null, null, null, null);

        Assert.Equal(2, dock.MarkUnseenForRepo("r-prg"));           // both tabs of the repo, shown or hidden
        Assert.Equal(0, dock.MarkUnseenForRepo("r-prg"));           // already latched: nothing new
        Assert.All(dock.GetAll().Where(t => t.RepoId == "r-prg"), t => Assert.True(t.UnseenResult));
        Assert.False(dock.GetAll().First(t => t.Id == other.Id).UnseenResult);

        // Persisted: a fresh registry over the same store reads the latch back.
        var reloaded = new DockRegistry(new Logger(), _dir);
        Assert.Equal(2, reloaded.GetAll().Count(t => t.UnseenResult));

        // The Operator's dedicated acknowledgement clears every tab of the repo; a second call has nothing to do.
        Assert.Equal(2, reloaded.ClearUnseenForRepo("r-prg"));
        Assert.Equal(0, reloaded.ClearUnseenForRepo("r-prg"));
        Assert.Equal(0, reloaded.ClearUnseenForRepo("r-nope"));
        Assert.Equal(0, reloaded.ClearUnseenForRepo(""));
        Assert.All(reloaded.GetAll(), t => Assert.False(t.UnseenResult));
        Assert.All(new DockRegistry(new Logger(), _dir).GetAll(), t => Assert.False(t.UnseenResult));
    }

    [Fact]
    public void Showing_a_hidden_dock_still_clears_its_latch_as_before()
    {
        var dock = new DockRegistry(new Logger(), _dir);
        var tab = dock.Add("r-prg", "prg");
        dock.Update(tab.Id, null, null, null, null, false, null, null, null, null, null);
        Assert.Equal(1, dock.MarkUnseenForRepo("r-prg"));
        dock.Update(tab.Id, null, null, null, null, true, null, null, null, null, null);
        Assert.False(dock.GetAll().Single().UnseenResult);
    }
}
