using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace ClaudeWeb.Services.Hosting;

/// <summary>
/// The address that identifies THIS machine to a person: its LAN IPv4 (board task
/// c97579f3 — the browser tab title). Chosen from the up, non-loopback, non-tunnel
/// interfaces' unicast IPv4 addresses, skipping APIPA (169.254.x.x); an interface with
/// a default gateway wins over one without (the real LAN adapter over virtual switches
/// and VPN stubs), and a wired adapter over wireless on a tie. Null when the box has no
/// usable IPv4 — callers fall back to the request's Host. Memoised for a minute: NICs
/// do not change often and the shell is served on every page load.
/// </summary>
public static class HostAddress
{
    private static readonly object Gate = new();
    private static string? _cached;
    private static DateTime _cachedAtUtc = DateTime.MinValue;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(1);

    /// <summary>One candidate address with the facts the picker ranks on.</summary>
    public sealed record Candidate(string Ip, bool HasGateway, NetworkInterfaceType Type, bool IsUp);

    public static string? LanIpv4()
    {
        lock (Gate)
        {
            if (_cachedAtUtc != DateTime.MinValue && DateTime.UtcNow - _cachedAtUtc < CacheTtl) return _cached;
        }
        var picked = Pick(Enumerate());
        lock (Gate) { _cached = picked; _cachedAtUtc = DateTime.UtcNow; }
        return picked;
    }

    /// <summary>Pure ranking (pinned by tests): up, non-APIPA, gateway first, wired
    /// before wireless, then the first seen. Null when nothing qualifies.</summary>
    public static string? Pick(IEnumerable<Candidate> candidates) =>
        candidates
            .Where(c => c.IsUp && IsUsable(c.Ip))
            .OrderByDescending(c => c.HasGateway)
            .ThenByDescending(c => c.Type == NetworkInterfaceType.Ethernet || c.Type == NetworkInterfaceType.GigabitEthernet)
            .ThenBy(c => c.Type == NetworkInterfaceType.Wireless80211 ? 1 : 0)
            .Select(c => c.Ip)
            .FirstOrDefault();

    /// <summary>A routable-looking IPv4: not loopback, not APIPA, not unspecified.</summary>
    public static bool IsUsable(string ip)
    {
        if (!IPAddress.TryParse(ip, out var addr) || addr.AddressFamily != AddressFamily.InterNetwork) return false;
        if (IPAddress.IsLoopback(addr) || addr.Equals(IPAddress.Any)) return false;
        var b = addr.GetAddressBytes();
        return !(b[0] == 169 && b[1] == 254);
    }

    private static IEnumerable<Candidate> Enumerate()
    {
        var result = new List<Candidate>();
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel or NetworkInterfaceType.Ppp) continue;
                var up = nic.OperationalStatus == OperationalStatus.Up;
                IPInterfaceProperties props;
                try { props = nic.GetIPProperties(); } catch { continue; }
                var hasGateway = props.GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any));
                foreach (var ua in props.UnicastAddresses)
                {
                    if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    result.Add(new Candidate(ua.Address.ToString(), hasGateway, nic.NetworkInterfaceType, up));
                }
            }
        }
        catch
        {
            // fall through to DNS below
        }
        if (result.Count == 0)
        {
            try
            {
                foreach (var a in Dns.GetHostAddresses(Environment.MachineName))
                    if (a.AddressFamily == AddressFamily.InterNetwork)
                        result.Add(new Candidate(a.ToString(), false, NetworkInterfaceType.Unknown, true));
            }
            catch { /* no address at all */ }
        }
        return result;
    }
}
