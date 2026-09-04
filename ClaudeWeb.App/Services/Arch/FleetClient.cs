using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The fleet arch agent's OUTBOUND channel (openspec: add-fleet-arch-agent, D1):
/// the one thing in the harness that ever POSTs to another harness. It borrows a
/// source's address and stored credential from the <see cref="CollectorService"/>
/// (which itself stays strictly read-only toward its sources) and talks to the
/// peer's <c>/api/arch/peer</c> surface: describe (posture + repos), send (a task
/// into a repo agent's own conversation) and transcript. Every remote outcome is
/// data with a named status; a dark peer is an answer, not an exception.
///
/// Describe results are cached per source (D6) so the engine tick never blocks on
/// a dead machine: tool calls and the Arch tab refresh a stale snapshot (bounded by
/// the HTTP timeout); wake composition reads the cache only.
/// </summary>
public class FleetClient
{
    /// <summary>Peer protocol this build speaks; the describe carries the peer's.</summary>
    public const int Protocol = 1;
    public const string PeerPath = "/api/arch/peer";

    public const string StatusOk = "ok";
    public const string StatusNever = "never";          // not asked yet
    public const string StatusUnreachable = "unreachable";
    public const string StatusUnauthorized = "unauthorized";
    public const string StatusNoPeerApi = "no-peer-api"; // 404: a build without the peer surface
    public const string StatusError = "error";

    private static readonly TimeSpan HttpTimeout = TimeSpan.FromSeconds(8);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly CollectorService _collector;
    private readonly Logger _logger;
    private readonly HttpClient _http;
    private readonly object _lock = new();
    private readonly Dictionary<string, PeerSnapshot> _snapshots = new(StringComparer.Ordinal);

    public FleetClient(CollectorService collector, Logger logger)
    {
        _collector = collector;
        _logger = logger;
        _http = new HttpClient { Timeout = HttpTimeout };
    }

    // ---- wire shapes (the peer's describe) -------------------------------------

    public sealed record PeerRepo(
        [property: JsonPropertyName("repoId")] string RepoId,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("remoteUrl")] string? RemoteUrl,
        [property: JsonPropertyName("branch")] string? Branch,
        [property: JsonPropertyName("defaultBranch")] string? DefaultBranch,
        [property: JsonPropertyName("dirty")] bool Dirty,
        [property: JsonPropertyName("availability")] string? Availability,
        [property: JsonPropertyName("lastActor")] string? LastActor,
        [property: JsonPropertyName("runningSince")] long? RunningSince,
        [property: JsonPropertyName("exists")] bool Exists,
        [property: JsonPropertyName("isSelf")] bool IsSelf,
        // Whether the PEER's own arch agent manages this repo (D8). Null = the peer
        // runs a build that predates scope reporting; treated as not sendable.
        [property: JsonPropertyName("managed")] bool? Managed = null);

    public sealed record PeerInfo(
        [property: JsonPropertyName("protocol")] int Protocol,
        [property: JsonPropertyName("version")] string? Version,
        [property: JsonPropertyName("machine")] string? Machine,
        [property: JsonPropertyName("acceptsSends")] bool AcceptsSends,
        [property: JsonPropertyName("gateOpen")] bool GateOpen,
        [property: JsonPropertyName("repos")] List<PeerRepo>? Repos,
        [property: JsonPropertyName("managedRepoIds")] List<string>? ManagedRepoIds = null);

    /// <summary>What we last learned about a peer: transport status + the describe
    /// when it answered. <see cref="At"/> is when it was taken (unix ms).</summary>
    public sealed record PeerSnapshot(string SourceId, string Label, string Status, string? Detail, PeerInfo? Info, long At)
    {
        public bool Reachable => Status == StatusOk;
        public IReadOnlyList<PeerRepo> Repos => Info?.Repos ?? (IReadOnlyList<PeerRepo>)Array.Empty<PeerRepo>();
    }

    // The peer's send / transcript reply: the same outcome vocabulary as a local tool.
    private sealed record PeerReply(
        [property: JsonPropertyName("ok")] bool Ok,
        [property: JsonPropertyName("status")] string? Status,
        [property: JsonPropertyName("detail")] string? Detail,
        [property: JsonPropertyName("data")] JsonElement? Data);

    // ---- describe (cached) ------------------------------------------------------------

    /// <summary>The cached snapshot for a source, refreshed synchronously when older
    /// than <paramref name="maxAgeMs"/> and <paramref name="refresh"/> is set. With
    /// <paramref name="refresh"/> false this never touches the network (the engine
    /// tick's contract, D6).</summary>
    public PeerSnapshot Snapshot(string sourceId, int maxAgeMs = 5000, bool refresh = true)
    {
        PeerSnapshot? cached;
        lock (_lock) _snapshots.TryGetValue(sourceId, out cached);
        var now = Now();
        if (cached is not null && (!refresh || now - cached.At <= maxAgeMs)) return cached;
        if (!refresh)
        {
            var label = _collector.ResolveSource(sourceId)?.Label ?? sourceId;
            return new PeerSnapshot(sourceId, label, StatusNever, "not probed yet", null, 0);
        }
        return Refresh(sourceId);
    }

    /// <summary>Blocking describe (bounded by the HTTP timeout).</summary>
    public PeerSnapshot Refresh(string sourceId)
    {
        try { return RefreshAsync(sourceId, CancellationToken.None).GetAwaiter().GetResult(); }
        catch (Exception ex)
        {
            var label = _collector.ResolveSource(sourceId)?.Label ?? sourceId;
            return Store(new PeerSnapshot(sourceId, label, StatusError, Trim(ex.Message), null, Now()));
        }
    }

    public async Task<PeerSnapshot> RefreshAsync(string sourceId, CancellationToken ct)
    {
        var src = _collector.ResolveSource(sourceId);
        var label = src?.Label ?? sourceId;
        var req = _collector.BuildPeerRequest(sourceId, HttpMethod.Get, PeerPath);
        if (req is null)
            return Store(new PeerSnapshot(sourceId, label, StatusError, "not a subscribed remote harness", null, Now()));

        HttpResponseMessage resp;
        try { resp = await _http.SendAsync(req, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            return Store(new PeerSnapshot(sourceId, label, StatusUnreachable, ReachReason(ex), null, Now()));
        }
        using (resp)
        {
            var (status, detail) = Classify(resp);
            if (status != StatusOk) return Store(new PeerSnapshot(sourceId, label, status, detail, null, Now()));
            PeerInfo? info;
            try { info = await resp.Content.ReadFromJsonSafeAsync<PeerInfo>(Json, ct); }
            catch { info = null; }
            if (info is null || info.Protocol <= 0)
                return Store(new PeerSnapshot(sourceId, label, StatusError, "unexpected describe body (not a peer API)", null, Now()));
            return Store(new PeerSnapshot(sourceId, label, StatusOk,
                info.Protocol == Protocol ? null : $"peer protocol {info.Protocol}, ours {Protocol}", info, Now()));
        }
    }

    private PeerSnapshot Store(PeerSnapshot s)
    {
        lock (_lock) _snapshots[s.SourceId] = s;
        return s;
    }

    // ---- send + transcript ------------------------------------------------------------

    /// <summary>Deliver a task to a repo agent on a peer. The caller has already
    /// applied this harness's own checks (armed, managed, allow-sends);
    /// the peer applies its own and answers with the shared outcome vocabulary.</summary>
    public ArchAgentService.ToolOutcome Send(string sourceId, string repoId, string text, string? branch, string from)
    {
        var body = new { repoId, text, branch = string.IsNullOrWhiteSpace(branch) ? null : branch.Trim(), from };
        return Post(sourceId, PeerPath + "/send", body);
    }

    public ArchAgentService.ToolOutcome ReadTranscript(string sourceId, string repoId, int tail)
    {
        var path = $"{PeerPath}/transcript?repoId={Uri.EscapeDataString(repoId)}&tail={tail}";
        return Get(sourceId, path);
    }

    private ArchAgentService.ToolOutcome Post(string sourceId, string path, object body)
    {
        var req = _collector.BuildPeerRequest(sourceId, HttpMethod.Post, path);
        if (req is null) return new ArchAgentService.ToolOutcome(false, StatusError, "not a subscribed remote harness");
        req.Content = new StringContent(JsonSerializer.Serialize(body, Json), Encoding.UTF8, "application/json");
        return Exchange(sourceId, req);
    }

    private ArchAgentService.ToolOutcome Get(string sourceId, string path)
    {
        var req = _collector.BuildPeerRequest(sourceId, HttpMethod.Get, path);
        if (req is null) return new ArchAgentService.ToolOutcome(false, StatusError, "not a subscribed remote harness");
        return Exchange(sourceId, req);
    }

    private ArchAgentService.ToolOutcome Exchange(string sourceId, HttpRequestMessage req)
    {
        try
        {
            using var resp = _http.SendAsync(req).GetAwaiter().GetResult();
            var (status, detail) = Classify(resp);
            if (status != StatusOk) return new ArchAgentService.ToolOutcome(false, status, detail ?? status);
            var reply = resp.Content.ReadFromJsonSafeAsync<PeerReply>(Json, CancellationToken.None).GetAwaiter().GetResult();
            if (reply is null) return new ArchAgentService.ToolOutcome(false, StatusError, "unexpected reply body from the peer");
            return new ArchAgentService.ToolOutcome(reply.Ok, reply.Status ?? StatusError,
                _collector.ScrubFor(sourceId, reply.Detail ?? ""), reply.Data);
        }
        catch (Exception ex)
        {
            var reason = ReachReason(ex);
            _logger.Info($"[FLEET] {req.Method} {req.RequestUri?.AbsolutePath} to source {sourceId}: {reason}");
            return new ArchAgentService.ToolOutcome(false, StatusUnreachable, _collector.ScrubFor(sourceId, reason));
        }
    }

    // ---- helpers ------------------------------------------------------------------------

    private static (string Status, string? Detail) Classify(HttpResponseMessage resp) => (int)resp.StatusCode switch
    {
        >= 200 and < 300 => (StatusOk, null),
        401 => (StatusUnauthorized, "alive — credential rejected (HTTP 401)"),
        403 => (StatusUnauthorized, "alive — refused by an access gate (HTTP 403)"),
        404 => (StatusNoPeerApi, "alive — no peer API on that build (HTTP 404); upgrade it"),
        429 => (StatusUnauthorized, "alive — throttled (HTTP 429)"),
        var code => (StatusError, $"HTTP {code}"),
    };

    private static string ReachReason(Exception ex)
    {
        if (ex is TaskCanceledException or OperationCanceledException) return "timed out";
        var msg = (ex.InnerException ?? ex).Message;
        var oic = StringComparison.OrdinalIgnoreCase;
        if (msg.Contains("refused", oic)) return "connection refused";
        if (msg.Contains("host", oic) && (msg.Contains("known", oic) || msg.Contains("resolve", oic))) return "host not found";
        if (msg.Contains("timed out", oic) || msg.Contains("timeout", oic)) return "timed out";
        return Trim(msg);
    }

    private static string Trim(string s) => s.Length > 160 ? s[..160] : s;

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}

file static class HttpContentJson
{
    /// <summary>Reads JSON leniently: an empty body is null, never an exception.</summary>
    public static async Task<T?> ReadFromJsonSafeAsync<T>(this HttpContent content, JsonSerializerOptions opts, CancellationToken ct)
    {
        var text = await content.ReadAsStringAsync(ct);
        if (string.IsNullOrWhiteSpace(text)) return default;
        return JsonSerializer.Deserialize<T>(text, opts);
    }
}
