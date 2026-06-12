using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.IpFilter;

/// <summary>
/// Enriches IPs shown in the Guests tab with country / city / ISP / AS /
/// reverse-DNS and a datacenter-or-proxy flag (plans/ip-intel.md). The
/// datacenter/proxy flag is the strongest "this is a bot, not me" tell.
///
/// Rules from the plan:
///   - NEVER on the request path — the IP gate must not wait on an external
///     API. Enrichment is only triggered when the Guests tab is loaded.
///   - Looked up once per IP, cached forever in %APPDATA%\ClaudeWeb\
///     ipinfo-cache.json (an IP's geography is stable). Failed lookups are
///     NOT cached, so a later tab load retries them.
///   - Private / loopback IPs are never sent anywhere — labeled locally.
///
/// Source: ipwho.is (free, no key, HTTPS). Visitor IPs are sent there — the
/// privacy tradeoff the Operator accepted vs. a local MaxMind DB.
/// </summary>
public class IpInfoService
{
    private const int MaxConcurrentLookups = 4;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly HttpClient _http;
    private readonly string _path;
    private readonly object _gate = new();
    private readonly Dictionary<string, IpInfo> _cache = new();
    private readonly ConcurrentDictionary<string, bool> _inFlight = new();

    public IpInfoService(Logger logger)
    {
        _logger = logger;
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "ipinfo-cache.json");
        Load();
    }

    public class IpInfo
    {
        public string Ip { get; set; } = "";
        public bool Local { get; set; }             // private/loopback — never looked up
        public string? Country { get; set; }
        public string? CountryCode { get; set; }    // ISO-2, for the flag
        public string? City { get; set; }
        public string? Org { get; set; }            // ISP / org
        public string? Asn { get; set; }
        public string? Hostname { get; set; }       // reverse DNS
        public bool Datacenter { get; set; }        // hosting / proxy / not residential
    }

    /// <summary>Cache hits only (synchronous, safe for the request path): the
    /// info already known for these IPs. Unknown IPs are absent from the map
    /// and should be filled via <see cref="FillInBackground"/>.</summary>
    public Dictionary<string, IpInfo> Known(IEnumerable<string> ips)
    {
        var result = new Dictionary<string, IpInfo>();
        lock (_gate)
        {
            foreach (var ip in ips.Distinct())
            {
                if (_cache.TryGetValue(ip, out var info)) result[ip] = info;
                else if (IsLocal(ip)) result[ip] = new IpInfo { Ip = ip, Local = true };
            }
        }
        return result;
    }

    /// <summary>Fire-and-forget enrichment of any IPs not already cached or
    /// in flight. Returns immediately; results show on the next tab load.</summary>
    public void FillInBackground(IEnumerable<string> ips)
    {
        List<string> todo;
        lock (_gate)
        {
            todo = ips.Distinct()
                .Where(ip => !_cache.ContainsKey(ip) && !IsLocal(ip))
                .Where(ip => _inFlight.TryAdd(ip, true))
                .ToList();
        }
        if (todo.Count == 0) return;

        _ = Task.Run(async () =>
        {
            using var sem = new SemaphoreSlim(MaxConcurrentLookups);
            await Task.WhenAll(todo.Select(async ip =>
            {
                await sem.WaitAsync();
                try
                {
                    var info = await LookupAsync(ip);
                    if (info != null)
                        lock (_gate) { _cache[ip] = info; Save(); }
                }
                catch (Exception ex) { _logger.Info($"[IPINFO] lookup {ip} failed: {ex.Message}"); }
                finally { sem.Release(); _inFlight.TryRemove(ip, out _); }
            }));
        });
    }

    private async Task<IpInfo?> LookupAsync(string ip)
    {
        // ipwho.is: success=false on a bad/unroutable IP — treat as a failed
        // (uncached) lookup so it retries later, not a poisoned cache entry.
        var json = await _http.GetStringAsync($"https://ipwho.is/{Uri.EscapeDataString(ip)}");
        var r = JsonSerializer.Deserialize<WhoisResponse>(json);
        if (r is null || r.Success != true) return null;

        var org = r.Connection?.Org ?? r.Connection?.Isp;
        return new IpInfo
        {
            Ip = ip,
            Country = r.Country,
            CountryCode = r.CountryCode,
            City = r.City,
            Org = org,
            Asn = r.Connection?.Asn is int a and > 0 ? $"AS{a}" : null,
            Hostname = await ReverseDnsAsync(ip),
            // ipwho.is free tier has no hosting/proxy flag (paid). Infer
            // "non-residential" from the org/ISP name — a hosting rack is a
            // scanner, a home ISP is probably you. Heuristic, not authoritative.
            Datacenter = IsHostingOrg(org) || IsHostingOrg(r.Connection?.Domain),
        };
    }

    // Well-known hosting / cloud / CDN providers + generic infra words. Matched
    // case-insensitively against the org name and connection domain.
    private static readonly string[] HostingMarkers =
    {
        "amazon", "aws", "google", "microsoft", "azure", "cloudflare", "ovh",
        "hetzner", "digitalocean", "linode", "vultr", "contabo", "leaseweb",
        "m247", "choopa", "scaleway", "oracle", "alibaba", "tencent", "akamai",
        "fastly", "gcore", "datacamp", "hostinger", "godaddy", "namecheap",
        "colocation", "colo", "hosting", "datacenter", "data center", "vps",
        "dedicated server", "cloud",
    };

    private static bool IsHostingOrg(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return false;
        var lower = s.ToLowerInvariant();
        return HostingMarkers.Any(m => lower.Contains(m));
    }

    private static async Task<string?> ReverseDnsAsync(string ip)
    {
        try
        {
            var entry = await Dns.GetHostEntryAsync(ip);
            return string.IsNullOrWhiteSpace(entry.HostName) || entry.HostName == ip ? null : entry.HostName;
        }
        catch { return null; }
    }

    /// <summary>RFC 1918 / loopback / link-local — never sent to a third party.</summary>
    public static bool IsLocal(string ip)
    {
        if (!IPAddress.TryParse(ip, out var addr)) return false;
        if (IPAddress.IsLoopback(addr)) return true;
        if (addr.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = addr.GetAddressBytes();
            return b[0] == 10
                || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
                || (b[0] == 192 && b[1] == 168)
                || (b[0] == 169 && b[1] == 254);
        }
        return addr.IsIPv6LinkLocal || addr.IsIPv6SiteLocal;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var list = JsonSerializer.Deserialize<List<IpInfo>>(File.ReadAllText(_path));
            if (list != null) foreach (var i in list) _cache[i.Ip] = i;
            _logger.Info($"[IPINFO] Loaded {_cache.Count} cached IP record(s)");
        }
        catch (Exception ex) { _logger.Info($"[IPINFO] cache load failed: {ex.Message}"); }
    }

    // Caller holds _gate.
    private void Save()
    {
        try { File.WriteAllText(_path, JsonSerializer.Serialize(_cache.Values.ToList(), JsonOpts)); }
        catch (Exception ex) { _logger.Info($"[IPINFO] cache save failed: {ex.Message}"); }
    }

    private sealed class WhoisResponse
    {
        [JsonPropertyName("success")] public bool? Success { get; set; }
        [JsonPropertyName("country")] public string? Country { get; set; }
        [JsonPropertyName("country_code")] public string? CountryCode { get; set; }
        [JsonPropertyName("city")] public string? City { get; set; }
        [JsonPropertyName("connection")] public WhoisConnection? Connection { get; set; }
    }

    private sealed class WhoisConnection
    {
        [JsonPropertyName("asn")] public int? Asn { get; set; }
        [JsonPropertyName("org")] public string? Org { get; set; }
        [JsonPropertyName("isp")] public string? Isp { get; set; }
        [JsonPropertyName("domain")] public string? Domain { get; set; }
    }
}
