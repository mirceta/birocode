using System.Net.NetworkInformation;
using ClaudeWeb.Services.Hosting;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Board task c97579f3: the browser tab title identifies the connected machine.
/// The address picker and the shell templating are pure and pinned here.</summary>
public class HostTitleTests
{
    [Fact]
    public void Pick_prefers_an_up_interface_with_a_gateway_and_skips_loopback_and_apipa()
    {
        var ip = HostAddress.Pick(new[]
        {
            new HostAddress.Candidate("127.0.0.1", false, NetworkInterfaceType.Loopback, true),
            new HostAddress.Candidate("169.254.26.85", false, NetworkInterfaceType.Ethernet, true),
            new HostAddress.Candidate("10.10.0.5", false, NetworkInterfaceType.Ethernet, true),      // virtual switch, no gateway
            new HostAddress.Candidate("192.168.0.215", true, NetworkInterfaceType.Ethernet, true),   // the real LAN adapter
            new HostAddress.Candidate("192.168.0.99", true, NetworkInterfaceType.Wireless80211, true),
            new HostAddress.Candidate("192.168.5.1", true, NetworkInterfaceType.Ethernet, false),    // down
        });
        Assert.Equal("192.168.0.215", ip);
    }

    [Fact]
    public void Pick_returns_null_when_nothing_usable()
    {
        Assert.Null(HostAddress.Pick(new[] { new HostAddress.Candidate("127.0.0.1", true, NetworkInterfaceType.Loopback, true) }));
        Assert.Null(HostAddress.Pick(Array.Empty<HostAddress.Candidate>()));
    }

    [Fact]
    public void TabTitle_falls_back_from_lan_ip_to_request_host_to_machine_name()
    {
        Assert.Equal("192.168.0.215", SpaShell.TabTitle("192.168.0.215", "spacex:5099", "WIN"));
        Assert.Equal("spacex", SpaShell.TabTitle(null, "spacex:5099", "WIN"));
        Assert.Equal("192.168.0.122", SpaShell.TabTitle("", "192.168.0.122:5099", "WIN"));
        Assert.Equal("[::1]", SpaShell.TabTitle(null, "[::1]:5099", "WIN"));
        Assert.Equal("WIN", SpaShell.TabTitle(null, "", "WIN"));
        Assert.Equal("Claude Web", SpaShell.TabTitle(null, null, null));
    }

    [Fact]
    public void Render_replaces_the_title_and_injects_the_meta_tags()
    {
        const string shell = "<!doctype html>\n<html><head>\n<meta charset=\"UTF-8\" />\n<title>Merhaba herseyim 😊</title>\n<script type=\"module\" src=\"/assets/index-abc.js\"></script></head><body><div id=\"root\"></div></body></html>";
        var rendered = SpaShell.Render(shell, "192.168.0.215", "spacex:5099", "WIN-QVH03HBBI3A");
        Assert.Contains("<title>192.168.0.215</title>", rendered);
        Assert.DoesNotContain("Merhaba", rendered);
        Assert.Contains("<meta name=\"claudeweb-host\" content=\"192.168.0.215\">", rendered);
        Assert.Contains("<meta name=\"claudeweb-machine\" content=\"WIN-QVH03HBBI3A\">", rendered);
        Assert.Contains("<meta name=\"claudeweb-title\" content=\"192.168.0.215\">", rendered);
        Assert.Contains("/assets/index-abc.js", rendered); // the rest of the shell is untouched
        Assert.True(rendered.IndexOf("<head>") < rendered.IndexOf("claudeweb-host")); // injected right after <head>
    }

    [Fact]
    public void Render_escapes_and_survives_a_shell_without_title_or_head()
    {
        var rendered = SpaShell.Render("<html><head><title>x</title></head></html>", null, "a<b>:5099", "M&M");
        Assert.Contains("<title>a&lt;b&gt;</title>", rendered);
        Assert.Contains("content=\"M&amp;M\"", rendered);
        Assert.Equal("<p>no shell</p>", SpaShell.Render("<p>no shell</p>", "1.2.3.4", "h", "m"));
    }
}
