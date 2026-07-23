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
    private readonly HostEventSound _hostSound;
    private readonly HttpClient _http;
    private readonly string _storePath;

    private readonly object _lock = new();
    private readonly List<Source> _sources = new();
    private readonly List<CollectorEvent> _events = new();
    private int _seq;

    public CollectorService(HarnessEventFeed selfFeed, IDataProtectionProvider dp, Logger logger, HostEventSound hostSound)
    {
        _selfFeed = selfFeed;
        _protector = dp.CreateProtector("collector.source.credential");
        _logger = logger;
        _hostSound = hostSound;
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
        // Status:  idle | connecting | active | ip-blocked | needs-credential | bad-credential
        //          | throttled | unreachable | error | stopped
        //   active           = pulling events
        //   ip-blocked       = 403: the host's IP gate refused us — a credential will NOT fix it
        //   needs-credential = 401 with no credential stored (alive, genuinely needs one)
        //   bad-credential   = 401 with a credential stored (alive, credential rejected — re-enter it)
        //   throttled        = 429: the host's brute-force throttle engaged
        //   unreachable      = no HTTP answer (DNS / refused / timed out)
        //   error            = answered with an unexpected HTTP status / body
        public string Status = "idle";
        public string? LastError;
        public long LastPolledAtMs;
        public bool Alive;                      // did the host answer an HTTP request at all
        public int Watermark = -1;              // into THIS source's own seq space
    }

    /// <summary>What the API exposes for a source — never the credential. <see cref="Alive"/>
    /// is true whenever the host answered (even with a 401), so the UI can say "alive but
    /// needs a credential" rather than treating it as dead.</summary>
    public sealed record SourceView(
        string Id, string Label, string Address, string Kind, bool Active,
        string Status, int LastSeq, string? LastError, long LastPolledAt, bool Alive);

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

    /// <summary>Register a remote source, start it, and immediately probe it so the
    /// returned view already reflects reality (active / needs-credential / unreachable)
    /// instead of a bare "connecting". Returns the new source view (never the credential).
    /// Throws ArgumentException on a blank address.</summary>
    public async Task<SourceView> AddSourceAsync(string? address, string? label, string? credential, CancellationToken ct = default)
    {
        var addr = NormalizeAddress(address);
        if (addr.Length == 0) throw new ArgumentException("Address is required.");
        var lbl = label?.Trim();
        if (string.IsNullOrWhiteSpace(lbl)) throw new ArgumentException("Label is required.");

        var src = new Source
        {
            Id = Guid.NewGuid().ToString("n"),
            Label = lbl!,
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

        // Status-only probe (no event append, watermark untouched) so the operator gets
        // an instant verdict. Bounded by the HttpClient timeout; never throws into the add.
        try { await ProbeRemoteAsync(src, ct); } catch { /* the background loop will refine */ }
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
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                SetState(s, alive: s.Alive, status: "error", detail: ex.Message);
            }
        }
    }

    private void PollSelf(Source s)
    {
        var (events, last) = _selfFeed.Read(s.Watermark);
        foreach (var e in events)
            Append(s, e.At, e.Type, e.Source, e.Data);
        SetState(s, alive: true, status: "active", detail: null, watermark: last);
    }

    // Real pull: GET the source feed from its watermark, append new events, classify status.
    private async Task PollRemoteAsync(Source s, CancellationToken ct)
    {
        HttpResponseMessage resp;
        try
        {
            using var req = BuildEventsRequest(s, s.Watermark);
            resp = await _http.SendAsync(req, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            SetState(s, alive: false, status: "unreachable", detail: ReachReason(ex));
            return;
        }

        using (resp)
        {
            if (await ClassifyRejectionAsync(resp, s, ct) is { } rej)
            {
                SetState(s, alive: true, status: rej.Status, detail: rej.Detail);
                return;
            }
            if (!resp.IsSuccessStatusCode)
            {
                SetState(s, alive: true, status: "error", detail: $"HTTP {(int)resp.StatusCode}");
                return;
            }

            RemoteFeed? feed;
            try { feed = await resp.Content.ReadFromJsonAsync<RemoteFeed>(JsonOpts, ct); }
            catch { SetState(s, alive: true, status: "error", detail: "unexpected response (not an event feed)"); return; }
            if (feed is null) { SetState(s, alive: true, status: "error", detail: "empty response"); return; }

            foreach (var e in feed.Events ?? new())
                Append(s, e.At, e.Type ?? "unknown", e.Source, e.Data);

            SetState(s, alive: true, status: "active", detail: null, watermark: feed.LastSeq);
        }
    }

    // Status-only probe (no append, watermark untouched): asks for events past the end of the
    // remote feed so the host answers with its auth/status but no backlog. Used on add.
    private async Task ProbeRemoteAsync(Source s, CancellationToken ct)
    {
        HttpResponseMessage resp;
        try
        {
            using var req = BuildEventsRequest(s, int.MaxValue);
            resp = await _http.SendAsync(req, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            SetState(s, alive: false, status: "unreachable", detail: ReachReason(ex));
            return;
        }

        using (resp)
        {
            if (await ClassifyRejectionAsync(resp, s, ct) is { } rej)
                SetState(s, alive: true, status: rej.Status, detail: rej.Detail);
            else if (!resp.IsSuccessStatusCode)
                SetState(s, alive: true, status: "error", detail: $"HTTP {(int)resp.StatusCode}");
            else
                SetState(s, alive: true, status: "active", detail: null);
        }
    }

    private HttpRequestMessage BuildEventsRequest(Source s, int after)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"{s.Address}/api/events?after={after}");
        req.Headers.TryAddWithoutValidation("Accept", "application/json");
        var cred = Unprotect(s.ProtectedCredential);
        if (cred is not null) req.Headers.TryAddWithoutValidation("X-Auth-Password", cred);
        return req;
    }

    // Classifies a refusal (401/403/429) into a distinct status + detail, or null when the
    // response is not a refusal (openspec distinguish-source-auth-failures). 403 = the
    // harness's IP gate — no credential will fix it, so it must not read as one; the body is
    // best-effort parsed for the rejected IP. 401 splits on whether a credential is STORED
    // (an undecryptable one also lands in bad-credential: "re-enter it" is the right cue).
    // 429 = the harness's brute-force throttle. All are alive states: the host answered.
    private static async Task<(string Status, string Detail)?> ClassifyRejectionAsync(HttpResponseMessage resp, Source s, CancellationToken ct)
    {
        switch ((int)resp.StatusCode)
        {
            case 403:
                var ip = await TryReadRejectedIpAsync(resp, ct);
                return ("ip-blocked", ip is null
                    ? "alive — refused by an access gate (HTTP 403)"
                    : $"alive — blocked by the harness's IP gate (your IP {ip} is not approved)");
            case 401:
                return s.ProtectedCredential is null
                    ? ("needs-credential", "alive — requires a credential")
                    : ("bad-credential", "alive — credential rejected");
            case 429:
                var retry = resp.Headers.RetryAfter?.ToString();
                return ("throttled", "alive — throttled by the harness" + (string.IsNullOrEmpty(retry) ? "" : $" (retry after {retry})"));
            default:
                return null;
        }
    }

    // The ClaudeWeb IP gate's 403 JSON body carries { ip } naming the rejected IP. Bounded
    // and best-effort: a bare/foreign 403 (empty, huge, or non-JSON body) just returns null —
    // the ip-blocked status never depends on the body.
    private static async Task<string?> TryReadRejectedIpAsync(HttpResponseMessage resp, CancellationToken ct)
    {
        try
        {
            var text = await resp.Content.ReadAsStringAsync(ct);
            if (text.Length is 0 or > 4096) return null;
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                doc.RootElement.TryGetProperty("ip", out var ip) &&
                ip.ValueKind == JsonValueKind.String)
                return ip.GetString();
        }
        catch { /* enrichment only */ }
        return null;
    }

    // Append one event to the aggregate under a fresh collector seq, tagged with its source.
    private void Append(Source s, long at, string type, object? source, object? data)
    {
        lock (_lock)
        {
            _events.Add(new CollectorEvent(++_seq, at, type, source, data, s.Id, s.Label));
            if (_events.Count > Cap) _events.RemoveRange(0, TrimChunk);
        }
        // Best-effort host cue (debounced, non-blocking; no-op unless the operator enabled it).
        // Pass the source label and event type so the cue is event-determined — voice can say
        // "agent {label} started" vs "has finished", beep picks a per-type sound. Outside the
        // lock so audio scheduling never holds up polling.
        _hostSound.Notify(s.Label, type);
    }

    // Unified state update: status + scrubbed detail + alive + lastPolled, optional watermark.
    // The refusal states (ip-blocked / needs-credential / bad-credential / throttled) are normal,
    // expected states (alive but not authorized) — not logged as errors.
    private void SetState(Source s, bool alive, string status, string? detail, int? watermark = null)
    {
        var scrubbed = detail is null ? null : Scrub(detail, s);
        lock (_lock)
        {
            s.Alive = alive;
            s.Status = status;
            s.LastError = scrubbed;
            s.LastPolledAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (watermark.HasValue) s.Watermark = watermark.Value;
        }
        if (status is "error" or "unreachable")
            _logger.Info($"[COLLECTOR] source {s.Label}: {status}{(scrubbed is null ? "" : " — " + scrubbed)}");
    }

    private static string ReachReason(Exception ex)
    {
        if (ex is TaskCanceledException or OperationCanceledException) return "timed out";
        var msg = (ex.InnerException ?? ex).Message;
        var oic = StringComparison.OrdinalIgnoreCase;
        if (msg.Contains("host", oic) && (msg.Contains("known", oic) || msg.Contains("no such", oic) || msg.Contains("resolve", oic)))
            return "host not found";
        if (msg.Contains("refused", oic)) return "connection refused";
        if (msg.Contains("timed out", oic) || msg.Contains("timeout", oic)) return "timed out";
        return msg.Length > 120 ? msg[..120] : msg;
    }

    // ---- helpers -----------------------------------------------------------

    private SourceView ToView(Source s) =>
        new(s.Id, s.Label, s.Address, s.Kind, s.Active, s.Status, s.Watermark, s.LastError, s.LastPolledAtMs, s.Alive);

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
        // Default a bare hostname to https: named harnesses are https-only (plain
        // http 301-redirects), so this sends the credentialed pull straight to the
        // secure endpoint with no redirect in between. A LAN/plain harness can still
        // be added by typing an explicit http:// scheme.
        if (!a.Contains("://")) a = "https://" + a;
        return a.TrimEnd('/');
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
