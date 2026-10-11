using System.Net;
using ClaudeWeb.Services.FleetProxy;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec fleet-proxy: the proxy computer / proxies-through settings — what is accepted, what
/// counts as a business address, and the setup script each role hands out. Stores in a temp dir;
/// never touches the browser setting (CLAUDEWEB_PROXY_NO_BROWSER).
/// </summary>
public sealed class FleetProxyTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cw-proxy-tests-" + Guid.NewGuid().ToString("N"));

    public FleetProxyTests() => Environment.SetEnvironmentVariable("CLAUDEWEB_PROXY_NO_BROWSER", "1");

    public void Dispose() { try { Directory.Delete(_dir, true); } catch { } }

    private FleetProxyService Svc() => new(Path.Combine(_dir, "fleet-proxy.json"), 5099, new Logger());

    private static FleetProxySettings Proxy(params string[] clients) => new()
    { Role = "proxy", HomeSubnet = "192.168.1.0/24", AllowClients = clients.ToList(), Targets = new() { "192.168.0.0/24" } };

    [Fact]
    public void Cidr_contains_and_overlaps()
    {
        Assert.True(Cidr.TryParse("192.168.0.0/24", out var biz));
        Assert.True(biz.Contains(IPAddress.Parse("192.168.0.42")));
        Assert.False(biz.Contains(IPAddress.Parse("192.168.1.105")));
        Assert.True(Cidr.TryParse("192.168.0.77/24", out var normalised));
        Assert.Equal("192.168.0.0/24", normalised.ToString());
        Assert.True(Cidr.TryParse("192.168.0.0/16", out var wide));
        Assert.True(wide.Overlaps(biz));
        Assert.False(Cidr.TryParse("not-a-range", out _));
    }

    [Fact]
    public void Validation_speaks_the_operators_words()
    {
        Assert.Null(new FleetProxySettings().Validate());
        Assert.Null(Proxy("192.168.1.105").Validate());
        Assert.Contains("at least one computer", Proxy().Validate());
        Assert.Contains("IPv4", Proxy("living-room").Validate());
        Assert.Contains("overlaps", (Proxy("192.168.1.105") with { Targets = new() { "192.168.0.0/16" }, HomeSubnet = "192.168.1.0/24" }).Validate());
        Assert.Contains("ip:port", new FleetProxySettings { Role = "client", Via = "hub" }.Validate());
        Assert.Null(new FleetProxySettings { Role = "client", Via = "192.168.1.101:5099" }.Validate());
        Assert.Contains("unknown role", new FleetProxySettings { Role = "router" }.Validate());
    }

    [Fact]
    public void Only_ipv4_literals_in_the_business_range_are_targets()
    {
        var s = Proxy("192.168.1.105");
        Assert.True(s.IsTarget("192.168.0.42"));
        Assert.False(s.IsTarget("192.168.1.1"));
        Assert.False(s.IsTarget("example.com"));
        Assert.False(s.IsTarget("192.168.0.42.evil.com"));
    }

    [Fact]
    public void Save_rejects_bad_settings_and_keeps_the_old_ones()
    {
        var svc = Svc();
        Assert.Null(svc.Save(Proxy("192.168.1.105")));
        Assert.NotNull(svc.Save(Proxy()));
        Assert.Equal("proxy", svc.Settings.Role);
        Assert.Equal(new[] { "192.168.1.105" }, svc.Settings.AllowClients);
        // Persisted: a new service reads the same role.
        Assert.Equal("proxy", Svc().Settings.Role);
    }

    [Fact]
    public void Setup_script_sends_only_business_addresses_through()
    {
        var svc = Svc();
        Assert.Null(svc.Pac(null));
        svc.Save(new FleetProxySettings { Role = "client", Via = "192.168.1.101:5099", Targets = new() { "192.168.0.0/24" } });
        var pac = svc.Pac(null)!;
        Assert.Contains("PROXY 192.168.1.101:5099", pac);
        Assert.Contains("isInNet(host, \"192.168.0.0\", \"255.255.255.0\")", pac);
        Assert.Contains("return \"DIRECT\"", pac);
        // A proxy computer hands out itself, on the home-side address it was reached on.
        svc.Save(Proxy("192.168.1.105"));
        Assert.Contains("PROXY 192.168.1.101:5099", svc.Pac(IPAddress.Parse("192.168.1.101"))!);
        // Leaving the role: no script, and the client's outgoing proxy is gone.
        svc.Save(new FleetProxySettings());
        Assert.Null(svc.Pac(null));
    }

    [Fact]
    public void Client_role_routes_only_business_calls_through_the_proxy_computer()
    {
        var before = HttpClient.DefaultProxy;
        var svc = Svc();
        try
        {
            svc.Save(new FleetProxySettings { Role = "client", Via = "192.168.1.101:5099", Targets = new() { "192.168.0.0/24" } });
            var p = HttpClient.DefaultProxy;
            Assert.False(p.IsBypassed(new Uri("http://192.168.0.42:5099/api/health")));
            Assert.Equal(new Uri("http://192.168.1.101:5099"), p.GetProxy(new Uri("http://192.168.0.42:5099/")));
            Assert.True(p.IsBypassed(new Uri("https://api.github.com/")));
        }
        finally { svc.Save(new FleetProxySettings()); HttpClient.DefaultProxy = before; }
    }
}
