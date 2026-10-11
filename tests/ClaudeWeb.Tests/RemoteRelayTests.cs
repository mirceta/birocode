using System.Text.Json;
using ClaudeWeb.Services.Remote;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec remote-fleet-agents: the relay's allow-list, the hop URLs, and the pure plan that
/// decides where a phone command goes and what an open-agent across machines becomes.</summary>
public class RemoteRelayTests
{
    private static JsonElement Args(string json) => JsonDocument.Parse(json).RootElement.Clone();

    // ---- allow-list ----------------------------------------------------------------------------

    [Theory]
    [InlineData("GET", "dock", true, false)]
    [InlineData("GET", "sessions/abc-123/messages", true, false)]
    [InlineData("GET", "sessions/abc-123/tools", true, false)]
    [InlineData("GET", "remote/screens", true, false)]
    [InlineData("POST", "remote/commands", true, false)]
    [InlineData("POST", "remote/pair/new", true, false)]
    [InlineData("POST", "chat", true, true)]
    [InlineData("POST", "chat/stop", true, true)]
    [InlineData("post", "/chat/", true, true)]
    [InlineData("GET", "chat", false, false)]
    [InlineData("POST", "dock", false, false)]
    [InlineData("GET", "repos", false, false)]
    [InlineData("GET", "auth/check", false, false)]
    [InlineData("POST", "arch/send", false, false)]
    [InlineData("GET", "sessions/abc/messages/extra", false, false)]
    [InlineData("DELETE", "dock", false, false)]
    public void Only_the_remotes_routes_are_relayed(string method, string path, bool allowed, bool isSend)
    {
        var m = RemoteRelay.Match(method, path);
        Assert.Equal(allowed, m is not null);
        if (m is not null) Assert.Equal(isSend, m.IsSend);
    }

    // ---- urls ----------------------------------------------------------------------------------

    [Fact]
    public void Hop_url_redeems_the_pin_on_the_peers_remote_then_lands_on_the_studio_with_the_agent_and_the_screen()
    {
        var url = RemoteRelay.HopUrl("http://192.168.0.42:5099/", "123456", "pers-dec", "projector");
        Assert.Equal("http://192.168.0.42:5099/remote?pin=123456&then=%2Fstudio%3Fagent%3Dpers-dec%26screen%3Dprojector", url);
        // no credential for the peer: the studio directly — the peer's login page, honestly
        Assert.Equal("http://192.168.0.42:5099/studio?agent=pers-dec&screen=projector", RemoteRelay.HopUrl("http://192.168.0.42:5099", null, "pers-dec", "projector"));
        Assert.Equal("http://hub:5099/studio?agent=r1&screen=living%20room", RemoteRelay.SelfUrl("http://hub:5099/", "r1", "living room"));
    }

    // ---- the plan ------------------------------------------------------------------------------

    private static string? Addr(string sid) => sid == "peer1" ? "http://192.168.0.42:5099" : null;
    private static string? Pin(string sid) => sid == "peer1" ? "246810" : null;

    [Fact]
    public void A_local_command_with_the_screen_on_this_harness_is_untouched()
    {
        var p = RemoteRelay.PlanCommand("scroll", Args("{\"dir\":\"up\"}"), null, "http://hub:5099", "projector", Addr, Pin);
        Assert.Equal("self", p.Queue); Assert.Equal("scroll", p.Type); Assert.Equal("up", p.Args!.Value.GetProperty("dir").GetString());
        var o = RemoteRelay.PlanCommand("open-agent", Args("{\"repoId\":\"r1\"}"), "self", "http://hub:5099", "projector", Addr, Pin);
        Assert.Equal("self", o.Queue); Assert.Equal("open-agent", o.Type);
    }

    [Fact]
    public void A_command_while_the_screen_shows_a_peer_goes_to_that_peers_queue()
    {
        var p = RemoteRelay.PlanCommand("layout", Args("{\"mode\":\"sofa\"}"), "peer1", "http://hub:5099", "projector", Addr, Pin);
        Assert.Equal("peer1", p.Queue); Assert.Equal("layout", p.Type);
    }

    [Fact]
    public void Opening_a_peers_agent_becomes_a_navigate_with_the_pin_hop_enqueued_where_the_screen_is()
    {
        var p = RemoteRelay.PlanCommand("open-agent", Args("{\"sourceId\":\"peer1\",\"repoId\":\"pers-dec\"}"), null, "http://hub:5099", "projector", Addr, Pin);
        Assert.Equal("self", p.Queue);
        Assert.Equal("navigate", p.Type);
        Assert.Equal("http://192.168.0.42:5099/remote?pin=246810&then=%2Fstudio%3Fagent%3Dpers-dec%26screen%3Dprojector", p.Args!.Value.GetProperty("url").GetString());
        Assert.Equal("peer1", p.Args!.Value.GetProperty("sourceId").GetString());
        Assert.Null(p.Note);
        // the screen is already on another peer: the navigate goes to THAT peer's queue
        var q = RemoteRelay.PlanCommand("open-agent", Args("{\"sourceId\":\"peer1\",\"repoId\":\"pers-dec\"}"), "peer2", "http://hub:5099", "projector", _ => "http://x", Pin);
        Assert.Equal("peer2", q.Queue); Assert.Equal("navigate", q.Type);
    }

    [Fact]
    public void Opening_this_harnesss_agent_while_the_screen_shows_a_peer_navigates_back_here()
    {
        var p = RemoteRelay.PlanCommand("open-agent", Args("{\"repoId\":\"r1\"}"), "peer1", "http://hub:5099", "projector", Addr, Pin);
        Assert.Equal("peer1", p.Queue);
        Assert.Equal("navigate", p.Type);
        Assert.Equal("http://hub:5099/studio?agent=r1&screen=projector", p.Args!.Value.GetProperty("url").GetString());
    }

    [Fact]
    public void An_unknown_machine_or_a_peer_without_credential_is_said_plainly()
    {
        var unknown = RemoteRelay.PlanCommand("open-agent", Args("{\"sourceId\":\"nope\",\"repoId\":\"r\"}"), null, "http://hub:5099", "projector", Addr, Pin);
        Assert.Equal("navigate", unknown.Type); Assert.Null(unknown.Args); Assert.Equal("unknown machine", unknown.Note);
        var noPin = RemoteRelay.PlanCommand("open-agent", Args("{\"sourceId\":\"peer1\",\"repoId\":\"r\"}"), null, "http://hub:5099", "projector", Addr, _ => null);
        Assert.Equal("navigate", noPin.Type);
        Assert.Equal("http://192.168.0.42:5099/studio?agent=r&screen=projector", noPin.Args!.Value.GetProperty("url").GetString());
        Assert.Contains("login page", noPin.Note);
    }

    [Fact]
    public void Navigate_is_a_known_command_type() => Assert.True(RemoteCommandStore.IsKnownType("navigate"));

    [Fact]
    public void A_phone_posted_navigate_means_home_and_a_forwarded_one_is_enqueued_as_it_is()
    {
        var away = RemoteRelay.PlanCommand("navigate", Args("{}"), "peer1", "http://hub:5099", "projector", Addr, Pin);
        Assert.Equal("peer1", away.Queue);
        Assert.Equal("http://hub:5099/studio?screen=projector", away.Args!.Value.GetProperty("url").GetString());
        var home = RemoteRelay.PlanCommand("navigate", null, null, "http://hub:5099", "projector", Addr, Pin);
        Assert.Null(home.Args); Assert.Equal("already home", home.Note);
        // the peer receiving the hub's planned navigate (the hub's url, no screenOn): straight into its own queue
        var forwarded = RemoteRelay.PlanCommand("navigate", Args("{\"url\":\"http://hub:5099/studio?agent=r1&screen=projector\"}"), null, "http://peer:5099", "projector", _ => null, _ => null);
        Assert.Equal("self", forwarded.Queue); Assert.Equal("navigate", forwarded.Type);
        Assert.Equal("http://hub:5099/studio?agent=r1&screen=projector", forwarded.Args!.Value.GetProperty("url").GetString());
    }
}
