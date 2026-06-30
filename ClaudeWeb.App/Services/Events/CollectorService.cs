using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.DataProtection;

namespace ClaudeWeb.Services.Events;

/// <summary>
/// The backend event-feed COLLECTOR (openspec change add-event-feed-collector).
/// Where <see cref="HarnessEventFeed"/> is this harness's own read-only producer feed,
/// the collector is the aggregation layer: it owns a set of <b>sources</b> (this harness
/// itself, read in-process, plus any number of remote harnesses entered by address),
/// pulls each active source's read-only <c>GET /api/events</c> on a background loop, and
/// merges everything into one source-tagged stream paged by a single collector-assigned
/// sequence number.
///
/// The listening state lives HERE, not in the browser: the source list is persisted, so a
/// frontend reload simply re-observes and a harness restart resumes listening. The
/// collector is strictly READ-ONLY toward every observed harness — it only ever GETs their
/// feed; the only writes are to its own source list. Remote credentials are a secret:
/// supplied write-only, encrypted at rest via Data Protection, never returned or logged.
/// </summary>
public class CollectorService
{
    public const string SelfId = "self";

    // Same soft-cap shape as HarnessEventFeed: seq keeps climbing past a trim so a client
    // watermark beyond the trimmed range still advances.
    private const int Cap = 1000;
    private const int TrimChunk = 200;

    private static readonly TimeSpan HttpTimeout = TimeSpan.FromSeconds(6);
    private static readonly JsonSerializerOptions JsonOpts =
        new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly HarnessEventFeed _selfFeed;
    private readonly IDataProtector _protector;
    private readonly Logger _logger;
    private readonly HttpClient _http;
    private readonly string _storePath;

    private readonly object _lock = new();
    private readonly List<Source> _sources = new();
    private readonly List<CollectorEvent> _events = new();
    private int _seq;

    public CollectorService(HarnessEventFeed selfFeed, IDataProtectionProvider dp, Logger logger)
    {
        _selfFeed = selfFeed;
        _protector = dp.CreateProtector("collector.source.credential");
        _logger = logger;
        _http = new HttpClient { Timeout = HttpTimeout };
        _storePath = System.IO.Path.Combine(AppPaths.DataDir, "collector-sources.json");
        Load();
        EnsureSelf();
    }

    // ---- types -------------------------------------------------------------

    /// <summary>A registered source: persisted config + live runtime state. The
    /// credential is held as an encrypted blob and never leaves this class.</summary>
    private sealed class Source
    {
        public string Id = "";
        public string Label = "";
        public string Address = "";            // "" for self
        public string Kind = "remote";          // "self" | "remote"
        public bool Active = true;
        public string? ProtectedCredential;     // encrypted at rest; null = none

        // runtime (not persisted)
        public string Status = "idle";          // idle | connecting | active | stopped | error
        public string? LastError;
        public long LastPolledAtMs;
        public int Watermark = -1;              // into THIS source's own seq space
    }

    /// <summary>What the API exposes for a source — never the credential.</summary>
    public sealed record SourceView(
        string Id, string Label, string Address, string Kind, bool Active,
        string Status, int LastSeq, string? LastError, long LastPolledAt);

    /// <summary>An aggregated event: the producer envelope (<see cref="Type"/>,
    /// <see cref="Source"/>, <see cref="At"/>, <see cref="Data"/>) plus which registered
    /// source it arrived through. <see cref="Seq"/> is the collector-assigned cursor.</summary>
    public sealed record CollectorEvent(
        int Seq, long At, string Type, object? Source, object? Data, string SourceId, string SourceLabel);

    private sealed record PersistedSource(
        string Id, string Label, string Address, string Kind, bool Active, string? Cred);

    // Shape of a remote /api/events response we pull.
    private sealed record RemoteFeed(
        [property: JsonPropertyName("events")] List<RemoteEvent>? Events,
        [property: JsonPropertyName("lastSeq")] int LastSeq);
    private sealed record RemoteEvent(
        [property: JsonPropertyName("seq")] int Seq,
        [property: JsonPropertyName("at")] long At,
        [property: JsonPropertyName("type")] string? Type,
        [property: JsonPropertyName("source")] JsonElement Source,
        [property: JsonPropertyName("data")] JsonElement Data);

    // ---- queries -----------------------------------------------------------

    public IReadOnlyList<SourceView> ListSources()
    {
        lock (_lock)
            return _sources.Select(ToView).ToList();
    }

    /// <summary>Aggregated events with seq &gt; <paramref name="after"/>, plus the highest
    /// collector seq. <paramref name="after"/> ≤ 0 returns the full retained aggregate.</summary>
    public (IReadOnlyList<CollectorEvent> Events, int LastSeq) ReadEvents(int after)
    {
        lock (_lock)
        {
            var fresh = after <= 0
                ? _events.ToList()
                : _events.Where(e => e.Seq > after).ToList();
            return (fresh, _seq);
        }
    }

    // ---- mutations (the collector's OWN subscription list only) -------------

    /// <summary>Register a remote source and start it. Returns the new source view
    /// (never the credential). Throws ArgumentException on a blank address.</summary>
    public SourceView AddSource(string? address, string? label, string? credential)
    {
        var addr = NormalizeAddress(address);
        if (addr.Length == 0) throw new ArgumentException("Address is required.");

        var src = new Source
        {
            Id = Guid.NewGuid().ToString("n"),
            Label = string.IsNullOrWhiteSpace(label) ? DeriveLabel(addr) : label!.Trim(),
            Address = addr,
            Kind = "remote",
            Active = true,
            ProtectedCredential = Protect(credential),
            Status = "connecting",
            Watermark = -1,
        };
        lock (_lock)
        {
            _sources.Add(src);
            Save();
        }
        _logger.Info($"[COLLECTOR] added source {src.Label} ({src.Address})");
        return ToView(src);
    }

    public bool SetActive(string id, bool active)
    {
        lock (_lock)
        {
            var s = _sources.FirstOrDefault(x => x.Id == id);
            if (s is null) return false;
            s.Active = active;
            s.Status = active ? "connecting" : "stopped";
            if (active) s.LastError = null;
            Save();
            return true;
        }
    }

    /// <summary>Remove a source. The built-in self source cannot be removed.</summary>
    public bool Remove(string id)
    {
        lock (_lock)
        {
            var s = _sources.FirstOrDefault(x => x.Id == id);
            if (s is null || s.Kind == "self") return false;
            _sources.Remove(s);
            Save();
            return true;
        }
    }

    // ---- polling (called by the hosted loop) -------------------------------

    public async Task PollActiveSourcesAsync(CancellationToken ct)
    {
        // Snapshot the active sources so we never hold the lock across IO.
        List<Source> active;
        lock (_lock) active = _sources.Where(s => s.Active).ToList();

        foreach (var s in active)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                if (s.Kind == "self") PollSelf(s);
                else await PollRemoteAsync(s, ct);
            }
            catch (Exception ex)
            {
                SetError(s, ex.Message);
            }
        }
    }

    private void PollSelf(Source s)
    {
        var (events, last) = _selfFeed.Read(s.Watermark);
        foreach (var e in events)
            Append(s, e.At, e.Type, e.Source, e.Data);
        lock (_lock)
        {
            s.Watermark = last;
            s.Status = "active";
            s.LastError = null;
            s.LastPolledAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }
    }

    private async Task PollRemoteAsync(Source s, CancellationToken ct)
    {
        var url = $"{s.Address}/api/events?after={s.Watermark}";
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.TryAddWithoutValidation("Accept", "application/json");
        var cred = Unprotect(s.ProtectedCredential);
        if (cred is not null) req.Headers.TryAddWithoutValidation("X-Auth-Password", cred);

        using var resp = await _http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode)
        {
            SetError(s, $"HTTP {(int)resp.StatusCode}");
            return;
        }

        var feed = await resp.Content.ReadFromJsonAsync<RemoteFeed>(JsonOpts, ct);
        if (feed is null) { SetError(s, "empty response"); return; }

        foreach (var e in feed.Events ?? new())
            Append(s, e.At, e.Type ?? "unknown", e.Source, e.Data);

        lock (_lock)
        {
            s.Watermark = feed.LastSeq;
            s.Status = "active";
            s.LastError = null;
            s.LastPolledAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }
    }

    // Append one event to the aggregate under a fresh collector seq, tagged with its source.
    private void Append(Source s, long at, string type, object? source, object? data)
    {
        lock (_lock)
        {
            _events.Add(new CollectorEvent(++_seq, at, type, source, data, s.Id, s.Label));
            if (_events.Count > Cap) _events.RemoveRange(0, TrimChunk);
        }
    }

    private void SetError(Source s, string reason)
    {
        var scrubbed = Scrub(reason, s);
        lock (_lock)
        {
            s.Status = "error";
            s.LastError = scrubbed;
            s.LastPolledAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }
        _logger.Info($"[COLLECTOR] source {s.Label} error: {scrubbed}");
    }

    // ---- helpers -----------------------------------------------------------

    private SourceView ToView(Source s) =>
        new(s.Id, s.Label, s.Address, s.Kind, s.Active, s.Status, s.Watermark, s.LastError, s.LastPolledAtMs);

    private string? Protect(string? plaintext)
    {
        plaintext = plaintext?.Trim();
        if (string.IsNullOrEmpty(plaintext)) return null;
        try { return _protector.Protect(plaintext); }
        catch (Exception ex) { _logger.Error($"[COLLECTOR] credential protect failed: {ex.Message}"); return null; }
    }

    private string? Unprotect(string? blob)
    {
        if (string.IsNullOrEmpty(blob)) return null;
        try { return _protector.Unprotect(blob); }
        catch { return null; } // key rotated / corrupt → treat as no credential
    }

    // Never let a credential substring survive into a status/log line.
    private string Scrub(string text, Source s)
    {
        var cred = Unprotect(s.ProtectedCredential);
        if (!string.IsNullOrEmpty(cred) && !string.IsNullOrEmpty(text))
            text = text.Replace(cred, "***");
        return text.Length > 200 ? text[..200] : text;
    }

    private static string NormalizeAddress(string? address)
    {
        var a = (address ?? "").Trim();
        if (a.Length == 0) return "";
        if (!a.Contains("://")) a = "http://" + a;
        return a.TrimEnd('/');
    }

    private static string DeriveLabel(string addr)
    {
        try { return new Uri(addr).Host; } catch { return addr; }
    }

    private void EnsureSelf()
    {
        lock (_lock)
        {
            if (_sources.Any(s => s.Kind == "self")) return;
            _sources.Insert(0, new Source
            {
                Id = SelfId,
                Label = Environment.MachineName,
                Address = "",
                Kind = "self",
                Active = true,
                Status = "active",
                Watermark = -1,
            });
            Save();
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_storePath)) return;
            var list = JsonSerializer.Deserialize<List<PersistedSource>>(File.ReadAllText(_storePath), JsonOpts);
            if (list is null) return;
            lock (_lock)
            {
                _sources.Clear();
                foreach (var p in list)
                    _sources.Add(new Source
                    {
                        Id = p.Id, Label = p.Label, Address = p.Address, Kind = p.Kind,
                        Active = p.Active, ProtectedCredential = p.Cred,
                        Status = p.Kind == "self" ? "active" : (p.Active ? "connecting" : "stopped"),
                        Watermark = -1,
                    });
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[COLLECTOR] failed to load {_storePath}: {ex.Message}");
        }
    }

    // Caller holds _lock.
    private void Save()
    {
        try
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(_storePath)!);
            var list = _sources.Select(s => new PersistedSource(
                s.Id, s.Label, s.Address, s.Kind, s.Active, s.ProtectedCredential)).ToList();
            File.WriteAllText(_storePath, JsonSerializer.Serialize(list, JsonOpts));
        }
        catch (Exception ex)
        {
            _logger.Error($"[COLLECTOR] failed to persist {_storePath}: {ex.Message}");
        }
    }
}
