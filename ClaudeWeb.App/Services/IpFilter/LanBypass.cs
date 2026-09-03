using System.Net;
using System.Net.Sockets;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.IpFilter;

/// <summary>
/// The configured LAN bypass of the IP allowlist gate (openspec lan-bypass-ip-gate).
///
/// A request whose RESOLVED client IP (<see cref="ClientIp"/> — last trusted
/// X-Forwarded-For hop, else the socket peer) falls inside one of
/// <see cref="AppConfig.LanBypassCidrs"/> passes the gate without an allowlist
/// entry or a device cookie. Default: no ranges, so nothing changes until the
/// Operator writes a range down in the host's config. The password layer is
/// untouched — this only decides who may see the login page.
///
/// Fail-closed rule (design D4): when the socket peer is a trusted proxy
/// (configured proxy or loopback) and NO forwarded hop arrived, the resolved
/// IP is the proxy's own LAN address; such a request is never eligible, so a
/// proxy that stops forwarding the client address cannot silently switch the
/// gate off for the whole internet.
///
/// Same shape as <see cref="ClientIp"/>: static, configured once from
/// EmbeddedApi before Kestrel accepts a request, read-only afterwards, pure.
/// </summary>
public static class LanBypass
{
    private sealed record Range(string Text, IPAddress Network, int PrefixBits);

    private static IReadOnlyList<Range> _ranges = Array.Empty<Range>();

    /// <summary>The configured ranges, normalised text, in config order (bad entries dropped).</summary>
    public static IReadOnlyList<string> Cidrs => _ranges.Select(r => r.Text).ToList();

    public static void Configure(AppConfig config, Logger? logger = null)
    {
        var parsed = new List<Range>();
        foreach (var raw in config.LanBypassCidrs ?? Array.Empty<string>())
        {
            if (TryParse(raw, out var range)) parsed.Add(range);
            else logger?.Error($"[IPFILTER] LanBypassCidrs: ignoring invalid entry \"{raw}\" (expected a.b.c.d/n, x::/n or a bare address)");
        }
        _ranges = parsed;
        if (parsed.Count > 0)
            logger?.Info($"[IPFILTER] LAN bypass on for {string.Join(", ", parsed.Select(r => r.Text))} — resolved client IPs in these ranges skip the guest list (password still required)");
    }

    /// <summary>Test-only: replace the configured ranges without an AppConfig.</summary>
    internal static void ConfigureForTests(params string[] cidrs) =>
        Configure(new AppConfig { LanBypassCidrs = cidrs });

    /// <summary>
    /// The matching range's text when <paramref name="origin"/> is eligible and
    /// inside a configured range; null otherwise. Eligibility = not
    /// (trusted-proxy peer without a forwarded hop).
    /// </summary>
    public static string? Match(ClientOrigin origin)
    {
        if (origin.PeerIsTrustedProxy && !origin.Forwarded) return null;
        return MatchIp(origin.Ip);
    }

    /// <summary>Range test only — no eligibility rule. For controllers that report on an already-resolved IP.</summary>
    public static string? MatchIp(string ip)
    {
        if (_ranges.Count == 0) return null;
        if (!IPAddress.TryParse(ClientIp.Normalize(ip), out var addr)) return null;
        if (addr.IsIPv4MappedToIPv6) addr = addr.MapToIPv4();
        foreach (var r in _ranges)
            if (Contains(r, addr)) return r.Text;
        return null;
    }

    private static bool Contains(Range r, IPAddress addr)
    {
        if (r.Network.AddressFamily != addr.AddressFamily) return false;
        var net = r.Network.GetAddressBytes();
        var a = addr.GetAddressBytes();
        var bits = r.PrefixBits;
        for (var i = 0; i < net.Length; i++)
        {
            if (bits <= 0) return true;
            var mask = bits >= 8 ? 0xFF : (byte)(0xFF << (8 - bits));
            if ((net[i] & mask) != (a[i] & mask)) return false;
            bits -= 8;
        }
        return true;
    }

    private static bool TryParse(string? raw, out Range range)
    {
        range = null!;
        if (string.IsNullOrWhiteSpace(raw)) return false;
        var s = raw.Trim();
        var slash = s.IndexOf('/');
        var addrText = slash >= 0 ? s[..slash] : s;
        var prefixText = slash >= 0 ? s[(slash + 1)..] : null;

        if (!IPAddress.TryParse(addrText.Trim(), out var addr)) return false;
        if (addr.IsIPv4MappedToIPv6) addr = addr.MapToIPv4();
        var max = addr.AddressFamily == AddressFamily.InterNetwork ? 32
                : addr.AddressFamily == AddressFamily.InterNetworkV6 ? 128
                : -1;
        if (max < 0) return false;

        var bits = max;
        if (prefixText != null && (!int.TryParse(prefixText, out bits) || bits < 0 || bits > max)) return false;

        var network = MaskToPrefix(addr, bits);
        range = new Range($"{network}/{bits}", network, bits);
        return true;
    }

    /// <summary>Zero the host bits so "192.168.0.7/24" is stored and shown as 192.168.0.0/24.</summary>
    private static IPAddress MaskToPrefix(IPAddress addr, int bits)
    {
        var b = addr.GetAddressBytes();
        var remaining = bits;
        for (var i = 0; i < b.Length; i++)
        {
            if (remaining >= 8) { remaining -= 8; continue; }
            b[i] = remaining <= 0 ? (byte)0 : (byte)(b[i] & (0xFF << (8 - remaining)));
            remaining = 0;
        }
        return new IPAddress(b);
    }
}
