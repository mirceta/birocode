using System.Net;
using System.Net.Sockets;
using System.Text.Json.Serialization;

namespace ClaudeWeb.Services.FleetProxy;

/// <summary>
/// This harness's place in a proxy setup (openspec fleet-proxy). Two roles:
/// <list type="bullet">
/// <item><b>proxy</b> — "this computer is a proxy computer": it sits on two networks and lets the
/// listed computers on its <see cref="HomeSubnet"/> side open addresses in <see cref="Targets"/>
/// (the business side) through it. One way: it only answers on the home side, never forwards
/// the other way, and never turns on IP forwarding.</item>
/// <item><b>client</b> — "this computer proxies through a proxy computer": addresses in
/// <see cref="Targets"/> go through <see cref="Via"/> — this harness's own outgoing calls, and
/// (when <see cref="SetBrowserProxy"/>) this computer's browser, by a setup script this harness serves.</item>
/// </list>
/// </summary>
public sealed record FleetProxySettings
{
    public const string RoleNone = "none";
    public const string RoleProxy = "proxy";
    public const string RoleClient = "client";

    [JsonPropertyName("role")] public string Role { get; init; } = RoleNone;
    /// <summary>proxy: the network it serves (answers only on its own address there).</summary>
    [JsonPropertyName("homeSubnet")] public string HomeSubnet { get; init; } = "192.168.1.0/24";
    /// <summary>proxy: the computers allowed to use it (IPv4 addresses).</summary>
    [JsonPropertyName("allowClients")] public List<string> AllowClients { get; init; } = new();
    /// <summary>both: the business range(s) reached through the proxy (CIDR).</summary>
    [JsonPropertyName("targets")] public List<string> Targets { get; init; } = new() { "192.168.0.0/24" };
    /// <summary>client: the proxy computer's address on this side, "ip:port" (its harness port).</summary>
    [JsonPropertyName("via")] public string? Via { get; init; }
    /// <summary>client: point this computer's browser (current Windows user) at the setup script.</summary>
    [JsonPropertyName("setBrowserProxy")] public bool SetBrowserProxy { get; init; } = true;

    /// <summary>Null when valid, else what is wrong — in the Operator's words.</summary>
    public string? Validate()
    {
        if (Role is not (RoleNone or RoleProxy or RoleClient)) return $"unknown role '{Role}'";
        if (Role == RoleNone) return null;
        if (Targets.Count == 0) return "name at least one business range (for example 192.168.0.0/24)";
        foreach (var t in Targets) if (!Cidr.TryParse(t, out _)) return $"'{t}' is not a range like 192.168.0.0/24";
        if (Role == RoleProxy)
        {
            if (!Cidr.TryParse(HomeSubnet, out var home)) return $"'{HomeSubnet}' is not a range like 192.168.1.0/24";
            if (AllowClients.Count == 0) return "name at least one computer allowed to use this proxy";
            foreach (var c in AllowClients)
                if (!IPAddress.TryParse(c, out var ip) || ip.AddressFamily != AddressFamily.InterNetwork) return $"'{c}' is not an IPv4 address";
            foreach (var t in Targets)
                if (Cidr.TryParse(t, out var tc) && tc.Overlaps(home)) return $"the business range {t} overlaps the home side {HomeSubnet}";
        }
        if (Role == RoleClient)
        {
            if (string.IsNullOrWhiteSpace(Via) || !TryEndpoint(Via, out _)) return "name the proxy computer as ip:port, for example 192.168.1.101:5099";
        }
        return null;
    }

    public static bool TryEndpoint(string? s, out IPEndPoint ep)
    {
        ep = null!;
        if (string.IsNullOrWhiteSpace(s)) return false;
        var i = s.LastIndexOf(':');
        if (i <= 0 || !int.TryParse(s[(i + 1)..], out var port) || port is < 1 or > 65535) return false;
        if (!IPAddress.TryParse(s[..i], out var ip) || ip.AddressFamily != AddressFamily.InterNetwork) return false;
        ep = new IPEndPoint(ip, port);
        return true;
    }

    /// <summary>True when <paramref name="host"/> is an IPv4 literal inside one of the targets.</summary>
    public bool IsTarget(string host) =>
        IPAddress.TryParse(host, out var ip) && ip.AddressFamily == AddressFamily.InterNetwork
        && Targets.Any(t => Cidr.TryParse(t, out var c) && c.Contains(ip));
}

/// <summary>An IPv4 range "a.b.c.d/n".</summary>
public readonly record struct Cidr(uint Network, int Bits)
{
    private uint Mask => Bits == 0 ? 0u : uint.MaxValue << (32 - Bits);

    public static bool TryParse(string? s, out Cidr cidr)
    {
        cidr = default;
        if (string.IsNullOrWhiteSpace(s)) return false;
        var p = s.Trim().Split('/');
        if (!IPAddress.TryParse(p[0], out var ip) || ip.AddressFamily != AddressFamily.InterNetwork) return false;
        var bits = 32;
        if (p.Length > 1 && (!int.TryParse(p[1], out bits) || bits is < 0 or > 32)) return false;
        var c = new Cidr(ToUInt(ip), bits);
        cidr = c with { Network = c.Network & c.Mask };
        return true;
    }

    public bool Contains(IPAddress ip) => ip.MapToIPv4() is var v4 && (ToUInt(v4) & Mask) == Network;
    public bool Overlaps(Cidr other) { var m = Bits < other.Bits ? Mask : other.Mask; return (Network & m) == (other.Network & m); }
    public string NetworkAddress => FromUInt(Network).ToString();
    public string MaskAddress => FromUInt(Mask).ToString();
    public override string ToString() => $"{NetworkAddress}/{Bits}";

    public static uint ToUInt(IPAddress ip) { var b = ip.MapToIPv4().GetAddressBytes(); return (uint)(b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]); }
    public static IPAddress FromUInt(uint v) => new(new[] { (byte)(v >> 24), (byte)(v >> 16), (byte)(v >> 8), (byte)v });
}
