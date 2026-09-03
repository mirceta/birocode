using System.Net;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.IpFilter;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec lan-bypass-ip-gate: the configured LAN ranges admit a resolved
/// client IP past the IP gate — judged on the same resolved IP as the allowlist,
/// never on the socket peer when a forwarded hop exists, and failing closed
/// when a trusted-proxy peer forwards nothing. ClientIp/LanBypass are static
/// and configured per test, so the tests run serially.
/// </summary>
[Collection("static-ip-config")]
public sealed class LanBypassTests : IDisposable
{
    private const string Proxy = "192.168.0.122";

    public LanBypassTests()
    {
        ClientIp.Configure(new AppConfig { TrustedProxyIps = [Proxy] });
        LanBypass.ConfigureForTests("192.168.0.0/24");
    }

    public void Dispose()
    {
        ClientIp.Configure(new AppConfig());
        LanBypass.ConfigureForTests();
    }

    private static HttpContext Request(string peer, string? forwardedFor = null)
    {
        var ctx = new DefaultHttpContext();
        ctx.Connection.RemoteIpAddress = IPAddress.Parse(peer);
        if (forwardedFor != null) ctx.Request.Headers["X-Forwarded-For"] = forwardedFor;
        return ctx;
    }

    // --- parsing --------------------------------------------------------------

    [Fact]
    public void Parses_v4_v6_and_bare_addresses_and_skips_invalid_entries()
    {
        LanBypass.ConfigureForTests("10.0.0.0/8", "fd00::/8", "192.168.5.7", "::ffff:192.168.9.77/24",
            "not-a-cidr", "10.0.0.0/33", "192.168.0.0/-1", "", "  ");
        Assert.Equal(new[] { "10.0.0.0/8", "fd00::/8", "192.168.5.7/32", "192.168.9.0/24" }, LanBypass.Cidrs);

        Assert.Equal("10.0.0.0/8", LanBypass.MatchIp("10.255.1.2"));
        Assert.Equal("fd00::/8", LanBypass.MatchIp("fd12:3456::1"));
        Assert.Equal("192.168.5.7/32", LanBypass.MatchIp("192.168.5.7"));
        Assert.Null(LanBypass.MatchIp("192.168.5.8"));
        Assert.Equal("192.168.9.0/24", LanBypass.MatchIp("::ffff:192.168.9.200"));
        Assert.Null(LanBypass.MatchIp("11.0.0.1"));
        Assert.Null(LanBypass.MatchIp("garbage"));
    }

    [Fact]
    public void Prefix_boundaries_are_exact()
    {
        LanBypass.ConfigureForTests("192.168.0.0/25");
        Assert.NotNull(LanBypass.MatchIp("192.168.0.127"));
        Assert.Null(LanBypass.MatchIp("192.168.0.128"));
        LanBypass.ConfigureForTests("0.0.0.0/0");
        Assert.NotNull(LanBypass.MatchIp("203.0.113.9"));
        Assert.Null(LanBypass.MatchIp("2001:db8::1")); // family mismatch never matches
    }

    [Fact]
    public void Empty_config_never_matches()
    {
        LanBypass.ConfigureForTests();
        Assert.Empty(LanBypass.Cidrs);
        Assert.Null(LanBypass.MatchIp("192.168.0.5"));
        Assert.Null(LanBypass.Match(ClientIp.GetOrigin(Request("192.168.0.5"))));
    }

    // --- resolved-IP semantics ------------------------------------------------

    [Fact]
    public void Direct_lan_peer_is_admitted()
    {
        var origin = ClientIp.GetOrigin(Request("192.168.0.143"));
        Assert.Equal(new ClientOrigin("192.168.0.143", PeerIsTrustedProxy: false, Forwarded: false), origin);
        Assert.Equal("192.168.0.0/24", LanBypass.Match(origin));
    }

    [Fact]
    public void Direct_peer_cannot_forge_a_forwarded_address()
    {
        // Not a trusted proxy: the header is ignored, the socket peer is judged.
        var internet = ClientIp.GetOrigin(Request("203.0.113.9", forwardedFor: "192.168.0.5"));
        Assert.Equal("203.0.113.9", internet.Ip);
        Assert.False(internet.PeerIsTrustedProxy);
        Assert.Null(LanBypass.Match(internet));

        // ...and the other way round a LAN peer stays LAN whatever it claims.
        var lan = ClientIp.GetOrigin(Request("192.168.0.50", forwardedFor: "203.0.113.9"));
        Assert.Equal("192.168.0.50", lan.Ip);
        Assert.Equal("192.168.0.0/24", LanBypass.Match(lan));
    }

    [Fact]
    public void Internet_visitor_through_the_trusted_proxy_is_not_lan()
    {
        var origin = ClientIp.GetOrigin(Request(Proxy, forwardedFor: "203.0.113.9"));
        Assert.Equal(new ClientOrigin("203.0.113.9", PeerIsTrustedProxy: true, Forwarded: true), origin);
        Assert.Null(LanBypass.Match(origin));
    }

    [Fact]
    public void Forged_lan_first_hop_loses_to_the_real_last_hop()
    {
        var origin = ClientIp.GetOrigin(Request(Proxy, forwardedFor: "192.168.0.5, 203.0.113.9"));
        Assert.Equal("203.0.113.9", origin.Ip);
        Assert.Null(LanBypass.Match(origin));
    }

    [Fact]
    public void Lan_device_through_the_trusted_proxy_is_still_lan()
    {
        var origin = ClientIp.GetOrigin(Request(Proxy, forwardedFor: "192.168.0.77"));
        Assert.Equal("192.168.0.77", origin.Ip);
        Assert.Equal("192.168.0.0/24", LanBypass.Match(origin));
    }

    // --- fail closed ------------------------------------------------------------

    [Fact]
    public void Trusted_proxy_without_forwarded_header_is_not_eligible()
    {
        // .122 is inside 192.168.0.0/24, but a proxy peer that forwarded nothing
        // may be carrying anyone: never LAN.
        var origin = ClientIp.GetOrigin(Request(Proxy));
        Assert.Equal(new ClientOrigin(Proxy, PeerIsTrustedProxy: true, Forwarded: false), origin);
        Assert.NotNull(LanBypass.MatchIp(Proxy));
        Assert.Null(LanBypass.Match(origin));
    }

    [Fact]
    public void Trusted_proxy_with_blank_forwarded_header_is_not_eligible()
    {
        Assert.Null(LanBypass.Match(ClientIp.GetOrigin(Request(Proxy, forwardedFor: "   "))));
        Assert.Null(LanBypass.Match(ClientIp.GetOrigin(Request(Proxy, forwardedFor: "192.168.0.5, "))));
    }

    [Fact]
    public void Loopback_without_forwarded_header_is_not_eligible()
    {
        LanBypass.ConfigureForTests("127.0.0.0/8");
        var v4 = ClientIp.GetOrigin(Request("127.0.0.1"));
        Assert.True(v4.PeerIsTrustedProxy);
        Assert.Null(LanBypass.Match(v4));
        var v6 = ClientIp.GetOrigin(Request("::1"));
        Assert.Equal("127.0.0.1", v6.Ip);
        Assert.Null(LanBypass.Match(v6));

        // With a forwarded loopback hop it IS eligible (the isolated e2e path).
        Assert.Equal("127.0.0.0/8", LanBypass.Match(ClientIp.GetOrigin(Request("127.0.0.1", forwardedFor: "127.0.0.1"))));
    }

    [Fact]
    public void Get_and_GetOrigin_never_disagree()
    {
        foreach (var ctx in new[]
                 {
                     Request("192.168.0.143"),
                     Request("203.0.113.9", "192.168.0.5"),
                     Request(Proxy, "192.168.0.5, 203.0.113.9"),
                     Request(Proxy),
                     Request("::ffff:192.168.0.9"),
                 })
            Assert.Equal(ClientIp.Get(ctx), ClientIp.GetOrigin(ctx).Ip);
    }
}
