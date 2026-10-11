using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.FleetProxy;

/// <summary>
/// Holds and applies this harness's proxy settings (openspec fleet-proxy), stored in
/// <c>&lt;datadir&gt;/fleet-proxy.json</c>.
/// <list type="bullet">
/// <item>proxy role: <see cref="FleetProxyMiddleware"/> forwards for the allowed clients; nothing else to apply.</item>
/// <item>client role: this harness's own HTTP calls to the business range go through the proxy
/// computer (<see cref="HttpClient.DefaultProxy"/>), and — when chosen — this computer's browser
/// gets the setup script <c>http://127.0.0.1:&lt;port&gt;/proxy.pac</c>.</item>
/// </list>
/// <see cref="Current"/> is static so the peer describe (ArchAgentService) can report the role
/// without a new constructor dependency.
/// </summary>
public sealed class FleetProxyService
{
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true, PropertyNameCaseInsensitive = true };
    private static FleetProxySettings _current = new();
    public static FleetProxySettings Current => _current;

    private readonly string _path;
    private readonly int _port;
    private readonly Logger _logger;
    private readonly object _lock = new();
    private readonly IWebProxy _originalDefault = HttpClient.DefaultProxy;
    private readonly LinkedList<string> _recent = new();
    private (long At, bool Ok, string Detail) _probe;

    public FleetProxyService(AppConfig config, Logger logger) : this(Path.Combine(AppPaths.DataDir, "fleet-proxy.json"), config.Port, logger) { }

    public FleetProxyService(string path, int port, Logger logger)
    {
        _path = path;
        _port = port;
        _logger = logger;
        _current = Load();
    }

    public FleetProxySettings Settings => _current;
    public int Port => _port;
    /// <summary>The setup script a client's browser follows: served by THIS harness.</summary>
    public string LocalPacUrl => $"http://127.0.0.1:{_port}/proxy.pac";

    private FleetProxySettings Load()
    {
        try { if (File.Exists(_path)) return JsonSerializer.Deserialize<FleetProxySettings>(File.ReadAllText(_path), Json) ?? new(); }
        catch (Exception ex) { _logger.Error($"[PROXY] cannot read {_path}: {ex.Message} — proxy off"); }
        return new();
    }

    /// <summary>Validates, saves and applies. Returns the error in the Operator's words, or null.</summary>
    public string? Save(FleetProxySettings next)
    {
        var clean = next with
        {
            Role = (next.Role ?? FleetProxySettings.RoleNone).Trim().ToLowerInvariant(),
            HomeSubnet = (next.HomeSubnet ?? "").Trim(),
            AllowClients = (next.AllowClients ?? new()).Select(s => s.Trim()).Where(s => s.Length > 0).Distinct().ToList(),
            Targets = (next.Targets ?? new()).Select(s => s.Trim()).Where(s => s.Length > 0).Distinct().ToList(),
            Via = string.IsNullOrWhiteSpace(next.Via) ? null : next.Via.Trim(),
        };
        if (clean.Validate() is { } err) return err;
        lock (_lock)
        {
            var dir = Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.WriteAllText(_path, JsonSerializer.Serialize(clean, Json));
            _current = clean;
            _probe = default;
        }
        _logger.Log($"[PROXY] role {clean.Role}{(clean.Role == FleetProxySettings.RoleProxy ? $" · home {clean.HomeSubnet} · clients {string.Join(",", clean.AllowClients)} · targets {string.Join(",", clean.Targets)}" : clean.Role == FleetProxySettings.RoleClient ? $" · via {clean.Via} · targets {string.Join(",", clean.Targets)}" : "")}");
        Apply();
        return null;
    }

    /// <summary>Applies the stored role to this process and this computer's browser.</summary>
    public void Apply()
    {
        var s = _current;
        if (s.Role == FleetProxySettings.RoleClient && FleetProxySettings.TryEndpoint(s.Via, out var via))
        {
            HttpClient.DefaultProxy = new TargetsProxy(new Uri($"http://{via}"), s);
            if (s.SetBrowserProxy) BrowserProxy.Ensure(LocalPacUrl); else BrowserProxy.Remove(LocalPacUrl);
        }
        else
        {
            HttpClient.DefaultProxy = _originalDefault;
            BrowserProxy.Remove(LocalPacUrl);
        }
    }

    /// <summary>The setup script: target addresses through the proxy, everything else direct.
    /// Null when this harness has no role (nothing to hand out).</summary>
    public string? Pac(IPAddress? servedOn)
    {
        var s = _current;
        string? proxy = s.Role switch
        {
            FleetProxySettings.RoleClient => s.Via,
            // A proxy computer hands out itself, on the address the asker reached it on.
            FleetProxySettings.RoleProxy => servedOn is { } a && Cidr.TryParse(s.HomeSubnet, out var home) && home.Contains(a) ? $"{a.MapToIPv4()}:{_port}"
                : HomeAddresses().FirstOrDefault() is { } h ? $"{h}:{_port}" : null,
            _ => null,
        };
        if (proxy is null) return null;
        var conds = string.Join(" || ", s.Targets.Select(t => Cidr.TryParse(t, out var c) ? $"isInNet(host, \"{c.NetworkAddress}\", \"{c.MaskAddress}\")" : "false"));
        return "// Claude Web proxy setup script (openspec fleet-proxy): business addresses through the proxy computer, everything else direct.\n"
             + "function FindProxyForURL(url, host) {\n"
             + $"  if (/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(host) && ({conds})) return \"PROXY {proxy}\";\n"
             + "  return \"DIRECT\";\n}\n";
    }

    /// <summary>This computer's IPv4 addresses (up interfaces), with prefix and adapter name.</summary>
    public static List<(IPAddress Ip, int Prefix, string Adapter)> LocalAddresses()
    {
        var list = new List<(IPAddress, int, string)>();
        try
        {
            foreach (var n in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (n.OperationalStatus != OperationalStatus.Up || n.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                foreach (var u in n.GetIPProperties().UnicastAddresses)
                {
                    if (u.Address.AddressFamily != AddressFamily.InterNetwork || u.Address.ToString().StartsWith("169.254.")) continue;
                    list.Add((u.Address, u.PrefixLength, n.Name));
                }
            }
        }
        catch { /* no interfaces readable: an empty list */ }
        return list;
    }

    /// <summary>This computer's addresses on the proxy's home side.</summary>
    public IEnumerable<IPAddress> HomeAddresses() =>
        Cidr.TryParse(_current.HomeSubnet, out var home) ? LocalAddresses().Select(a => a.Ip).Where(home.Contains) : Enumerable.Empty<IPAddress>();

    public void Record(string line)
    {
        lock (_recent)
        {
            _recent.AddFirst($"{DateTime.Now:HH:mm:ss} {line}");
            while (_recent.Count > 30) _recent.RemoveLast();
        }
    }

    public List<string> Recent() { lock (_recent) return _recent.ToList(); }

    /// <summary>client role: can this computer reach the proxy computer? (TCP connect, cached 20 s)</summary>
    public (bool Ok, string Detail) ProbeVia()
    {
        var s = _current;
        if (s.Role != FleetProxySettings.RoleClient || !FleetProxySettings.TryEndpoint(s.Via, out var ep)) return (false, "no proxy computer set");
        var now = Environment.TickCount64;
        if (_probe.At != 0 && now - _probe.At < 20_000) return (_probe.Ok, _probe.Detail);
        bool ok; string detail;
        try
        {
            using var c = new TcpClient(AddressFamily.InterNetwork);
            ok = c.ConnectAsync(ep.Address, ep.Port).Wait(TimeSpan.FromSeconds(2));
            detail = ok ? $"{ep} answers" : $"{ep} does not answer";
        }
        catch (Exception ex) { ok = false; detail = $"{ep}: {ex.GetBaseException().Message}"; }
        _probe = (now, ok, detail);
        return (ok, detail);
    }

    /// <summary>What the Settings card shows.</summary>
    public object Status()
    {
        var s = _current;
        var addresses = LocalAddresses().Select(a => new { ip = a.Ip.ToString(), prefix = a.Prefix, adapter = a.Adapter, subnet = Cidr.TryParse($"{a.Ip}/{a.Prefix}", out var c) ? c.ToString() : null }).ToList();
        object? proxy = null, client = null;
        if (s.Role == FleetProxySettings.RoleProxy)
        {
            var home = HomeAddresses().Select(a => $"{a}:{_port}").ToList();
            proxy = new { listening = home, ready = home.Count > 0, pacUrl = home.Count > 0 ? $"http://{home[0]}/proxy.pac" : null, recent = Recent() };
        }
        if (s.Role == FleetProxySettings.RoleClient)
        {
            var (ok, detail) = ProbeVia();
            client = new { reachable = ok, detail, pacUrl = LocalPacUrl, browser = BrowserProxy.Disabled ? "disabled" : BrowserProxy.State(LocalPacUrl), browserCurrent = BrowserProxy.Current() };
        }
        return new { settings = s, port = _port, addresses, proxy, client };
    }

    /// <summary>HttpClient.DefaultProxy for the client role: only target addresses go through the proxy.</summary>
    private sealed class TargetsProxy(Uri via, FleetProxySettings settings) : IWebProxy
    {
        public ICredentials? Credentials { get; set; }
        public Uri? GetProxy(Uri destination) => IsBypassed(destination) ? destination : via;
        public bool IsBypassed(Uri host) => !settings.IsTarget(host.Host);
    }
}
