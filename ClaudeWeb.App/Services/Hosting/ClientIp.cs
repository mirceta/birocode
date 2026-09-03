using System.Net;
using ClaudeWeb.Models;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Hosting;

/// <summary>
/// The resolved caller identity: the IP every gate judges, plus the two facts
/// the LAN bypass needs to fail closed (openspec lan-bypass-ip-gate, D2/D4).
/// </summary>
/// <param name="Ip">Canonical client IP — the last trusted X-Forwarded-For hop, else the socket peer.</param>
/// <param name="PeerIsTrustedProxy">The socket peer was loopback or a configured trusted proxy.</param>
/// <param name="Forwarded">A non-empty last hop was taken from X-Forwarded-For (so <see cref="Ip"/> is not the peer).</param>
public sealed record ClientOrigin(string Ip, bool PeerIsTrustedProxy, bool Forwarded);

/// <summary>
/// The ONE definition of "the caller's IP", shared by the brute-force
/// throttle, the IP allowlist, and login logging (plans/auth-ip-filter.md §1).
///
/// Deployment: End Users arrive via an IIS/ARR reverse proxy
/// (https://domain -> :5099). The proxy may run on this machine (peer =
/// loopback) or on a separate box (peer = the proxy's LAN IP, configured in
/// AppConfig.TrustedProxyIps) — discovered in production 2026-06-12, when the
/// proxy at 192.168.0.122 made every visitor look like 192.168.0.122.
///
/// Hardened rules (decided by the Operator, 2026-06-12):
///   - Trust X-Forwarded-For ONLY when the socket peer is loopback or a
///     configured trusted proxy. A direct hit on :5099 cannot spoof an
///     approved IP.
///   - When trusted, take the LAST hop — the value the proxy itself
///     appended. The first hop is client-controlled.
/// </summary>
public static class ClientIp
{
    // Set once at server startup (EmbeddedApi) from AppConfig.TrustedProxyIps,
    // before Kestrel accepts any request. Static so call sites stay
    // dependency-free; read-only afterwards.
    private static HashSet<string> _trustedProxies = new();

    public static void Configure(AppConfig config) =>
        _trustedProxies = config.TrustedProxyIps
            .Select(Normalize)
            .ToHashSet();

    public static string Get(HttpContext context) => GetOrigin(context).Ip;

    /// <summary>
    /// The resolved IP plus how it was resolved. <see cref="Get"/> is exactly
    /// <c>GetOrigin(ctx).Ip</c>, so the allowlist, the throttle and the LAN
    /// bypass can never disagree about who is calling.
    /// </summary>
    public static ClientOrigin GetOrigin(HttpContext context)
    {
        var remote = context.Connection.RemoteIpAddress;
        var trusted = remote != null && IsTrustedProxy(remote);
        if (trusted)
        {
            var fwd = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(fwd))
            {
                var hops = fwd.Split(',');
                var last = hops[^1].Trim();
                if (last.Length > 0)
                    return new ClientOrigin(Normalize(last), PeerIsTrustedProxy: true, Forwarded: true);
            }
        }
        var ip = remote != null ? Normalize(remote.ToString()) : "unknown";
        return new ClientOrigin(ip, trusted, Forwarded: false);
    }

    private static bool IsTrustedProxy(IPAddress remote) =>
        IPAddress.IsLoopback(remote) || _trustedProxies.Contains(Normalize(remote.ToString()));

    /// <summary>
    /// Canonical form so the same machine always matches the same allowlist
    /// entry: strips an IPv4 port suffix ("1.2.3.4:567"), unwraps bracketed
    /// IPv6, and maps IPv4-in-IPv6 ("::ffff:1.2.3.4") back to plain IPv4.
    /// </summary>
    public static string Normalize(string raw)
    {
        var s = raw.Trim();

        // [::1]:port or [::1]
        if (s.StartsWith('['))
        {
            var end = s.IndexOf(']');
            if (end > 0) s = s[1..end];
        }
        // IPv4 with port — exactly one colon and a dot before it.
        else if (s.Count(c => c == ':') == 1 && s.Contains('.'))
        {
            s = s[..s.IndexOf(':')];
        }

        if (IPAddress.TryParse(s, out var ip))
        {
            if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
            // Collapse ::1 and 127.x onto one canonical loopback so the seeded
            // "localhost" allowlist entry matches whichever stack the OS picks.
            if (IPAddress.IsLoopback(ip)) return "127.0.0.1";
            return ip.ToString();
        }
        return s;
    }
}
