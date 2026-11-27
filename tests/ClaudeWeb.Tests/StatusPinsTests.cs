using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Settings;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// fleet task 61a0d521 — the Status tab's pinned agents on the hub: keyed by sourceId + repoId, pin order kept, pin and
/// unpin idempotent, a reload (another browser) reads the same, labels refreshed on re-pin, malformed ids refused.
/// </summary>
public sealed class StatusPinsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-pins-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    [Fact]
    public void Pins_keep_their_order_survive_a_reload_and_pinning_twice_changes_nothing()
    {
        var a = new StatusPinsService(_logger, _dir);
        Assert.Empty(a.List());
        a.Set("self", "r1", true, "DESKTOP-POAPPP3", "prg", 1);
        a.Set("a92e0b48", "r2", true, "spacex", "msg-platform-agent", 2);
        var (again, err) = a.Set("self", "r1", true, "DESKTOP-POAPPP3", "prg renamed", 3);
        Assert.Null(err);
        Assert.Equal(new[] { "self|r1", "a92e0b48|r2" }, again.Select(p => p.Key));
        Assert.Equal("prg renamed", again[0].Name);      // label refreshed, position and pinnedAt kept
        Assert.Equal(1, again[0].PinnedAt);

        var b = new StatusPinsService(_logger, _dir);   // a reload / another browser
        Assert.Equal(new[] { "self|r1", "a92e0b48|r2" }, b.List().Select(p => p.Key));
        Assert.Equal("spacex", b.List()[1].Machine);
    }

    [Fact]
    public void Unpin_is_idempotent_and_reorder_puts_the_named_keys_first()
    {
        var s = new StatusPinsService(_logger, _dir);
        foreach (var r in new[] { "r1", "r2", "r3" }) s.Set("self", r, true, "hub", r, 1);
        Assert.Equal(2, s.Set("self", "r2", false, null, null, 2).Pins.Count);
        Assert.Equal(2, s.Set("self", "r2", false, null, null, 3).Pins.Count);   // already gone: unchanged
        Assert.Equal(new[] { "self|r3", "self|r1" }, s.Reorder(new[] { "self|r3", "nope|x" }).Select(p => p.Key));
    }

    [Fact]
    public void Malformed_ids_are_refused_with_a_reason()
    {
        var s = new StatusPinsService(_logger, _dir);
        var (pins, err) = s.Set("../etc", "r1", true, null, null, 1);
        Assert.NotNull(err);
        Assert.Empty(pins);
        Assert.NotNull(s.Set(null, "r1", true, null, null, 1).Error);
    }
}
