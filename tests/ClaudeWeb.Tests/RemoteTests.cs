using System.Text.Json;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Remote;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec sofa-mode: the remote command ring (seq, watermark, no replay into a
/// fresh listener, the feed event), the big screens' heartbeats and their expiry, and the
/// pairing PIN (six digits, single use, expiry, wrong digits).</summary>
public class RemoteTests
{
    private static JsonElement Args(string json) => JsonDocument.Parse(json).RootElement.Clone();

    // ---- commands -----------------------------------------------------------------------------

    [Fact]
    public void Post_assigns_increasing_seq_and_publishes_remote_command()
    {
        var feed = new HarnessEventFeed();
        var store = new RemoteCommandStore(feed);

        var a = store.Post("open-agent", Args("{\"repoId\":\"r1\"}"), "192.168.1.50");
        var b = store.Post("scroll", Args("{\"dir\":\"up\"}"), "192.168.1.50");

        Assert.Equal(1, a.Seq);
        Assert.Equal(2, b.Seq);
        Assert.Equal("open-agent", a.Type);
        var (events, _) = feed.Read(-1);
        Assert.Equal(2, events.Count);
        Assert.All(events, e => Assert.Equal("remote.command", e.Type));
    }

    [Fact]
    public void Read_returns_only_commands_after_the_watermark()
    {
        var store = new RemoteCommandStore(new HarnessEventFeed());
        store.Post("open-agent", null, "p");
        store.Post("scroll", null, "p");
        store.Post("zoom", null, "p");

        var (cmds, seq) = store.Read(1);
        Assert.Equal(3, seq);
        Assert.Equal(new[] { 2, 3 }, cmds.Select(c => c.Seq).ToArray());
    }

    [Fact]
    public void A_fresh_listener_catches_up_without_replaying_old_commands()
    {
        var store = new RemoteCommandStore(new HarnessEventFeed());
        store.Post("open-agent", null, "p");
        store.Post("open-view", null, "p");

        var (cmds, seq) = store.Read(-1);
        Assert.Empty(cmds);
        Assert.Equal(2, seq);
        // …and from there it sees only what comes next.
        store.Post("stop", null, "p");
        var (next, _) = store.Read(seq);
        Assert.Single(next);
        Assert.Equal("stop", next[0].Type);
    }

    [Fact]
    public void The_ring_keeps_the_last_hundred_and_seq_keeps_counting()
    {
        var store = new RemoteCommandStore(new HarnessEventFeed());
        for (var i = 0; i < 130; i++) store.Post("scroll", null, "p");
        var (cmds, seq) = store.Read(0);
        Assert.Equal(130, seq);
        Assert.Equal(100, cmds.Count);
        Assert.Equal(31, cmds[0].Seq);
    }

    [Theory]
    [InlineData("open-agent", true)]
    [InlineData("OPEN-VIEW", true)]
    [InlineData("scroll", true)]
    [InlineData("zoom", true)]
    [InlineData("lane", true)]
    [InlineData("stop", true)]
    [InlineData("rm -rf", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Only_the_dispatch_tables_types_are_known(string? type, bool known) => Assert.Equal(known, RemoteCommandStore.IsKnownType(type));

    // ---- screens -------------------------------------------------------------------------------

    [Fact]
    public void Screens_report_what_they_show_and_vanish_after_twenty_seconds_of_silence()
    {
        long now = 1_000_000;
        var store = new RemoteCommandStore(new HarnessEventFeed(), () => now);

        store.Heartbeat("tab-1", "projector", "http://x/studio/agent", "pers-dec", "agent");
        store.Heartbeat("tab-2", "desk", "http://x/studio/tasks", null, "tasks");
        Assert.Equal(2, store.Screens().Count);
        Assert.Equal("pers-dec", store.Screens().Single(s => s.Id == "tab-1").ActiveAgent);

        now += 15_000;
        store.Heartbeat("tab-1", "projector", "http://x/studio/agent", "prg", "agent"); // still alive
        now += 10_000; // tab-2 is now 25 s silent
        var alive = store.Screens();
        Assert.Single(alive);
        Assert.Equal("prg", alive[0].ActiveAgent);
    }

    [Fact]
    public void A_heartbeat_without_a_name_uses_the_id()
    {
        var store = new RemoteCommandStore(new HarnessEventFeed());
        var screens = store.Heartbeat("abc", "  ", "u", " ", "");
        Assert.Equal("abc", screens[0].Name);
        Assert.Null(screens[0].ActiveAgent);
        Assert.Null(screens[0].View);
    }

    // ---- pairing -------------------------------------------------------------------------------

    [Fact]
    public void A_pin_is_six_digits_and_redeems_exactly_once()
    {
        var pairing = new RemotePairing();
        var (pin, _) = pairing.NewPin();

        Assert.Matches("^[0-9]{6}$", pin);
        Assert.True(pairing.HasActivePin);
        Assert.True(pairing.Redeem(pin));
        Assert.False(pairing.HasActivePin);
        Assert.False(pairing.Redeem(pin)); // single use
    }

    [Fact]
    public void Wrong_digits_are_refused_and_the_pin_stays_for_the_real_phone()
    {
        var pairing = new RemotePairing();
        var (pin, _) = pairing.NewPin();
        var wrong = pin == "000000" ? "000001" : "000000";

        Assert.False(pairing.Redeem(wrong));
        Assert.False(pairing.Redeem(""));
        Assert.False(pairing.Redeem(null));
        Assert.True(pairing.HasActivePin);
        Assert.True(pairing.Redeem(pin[..3] + " " + pin[3..])); // typed with a space — digits only count
    }

    [Fact]
    public void A_pin_expires_after_five_minutes()
    {
        var now = new DateTime(2026, 10, 8, 20, 0, 0, DateTimeKind.Utc);
        var pairing = new RemotePairing(() => now);
        var (pin, expires) = pairing.NewPin();

        Assert.Equal(now + RemotePairing.Lifetime, expires);
        now = now.AddMinutes(4).AddSeconds(59);
        Assert.True(pairing.HasActivePin);
        now = now.AddSeconds(2);
        Assert.False(pairing.HasActivePin);
        Assert.False(pairing.Redeem(pin));
    }

    [Fact]
    public void A_new_pin_replaces_the_old_one()
    {
        var pairing = new RemotePairing();
        var (first, _) = pairing.NewPin();
        var (second, _) = pairing.NewPin();
        if (first == second) return; // one in a million — nothing to assert
        Assert.False(pairing.Redeem(first));
        Assert.True(pairing.Redeem(second));
    }

    [Fact]
    public void Nothing_redeems_before_a_pin_exists()
    {
        var pairing = new RemotePairing();
        Assert.False(pairing.HasActivePin);
        Assert.False(pairing.Redeem("123456"));
    }
}
