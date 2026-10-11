using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Remote;

/// <summary>
/// The sofa remote's relay to a fleet peer (openspec remote-fleet-agents): the phone is paired with
/// THIS harness only, so writing to a peer's agent, reading its transcript, or steering a big screen
/// that is showing the peer's harness all go through here — this harness forwards the call to the
/// peer's own API with the credential the collector already stores for that peer (the same one the
/// fleet client uses). Allow-listed: exactly the handful of routes the remote needs, nothing else is
/// proxied. The hub-side "allow sends" switch of a source gates the two calls that make a peer's
/// agent DO something (a chat send, a stop); reads, remote commands and a pairing PIN are not sends.
/// </summary>
public class RemoteRelay
{
    public sealed record Allowed(string Method, Regex Path, bool IsSend);

    /// <summary>What the remote may ask of a peer. <c>{**path}</c> arrives without the /api prefix.</summary>
    public static readonly Allowed[] AllowList =
    {
        new("GET", new Regex("^dock$"), false),
        new("GET", new Regex("^sessions/[^/]+/messages$"), false),
        new("GET", new Regex("^sessions/[^/]+/tools$"), false),
        new("GET", new Regex("^remote/screens$"), false),
        new("POST", new Regex("^remote/commands$"), false),
        new("POST", new Regex("^remote/pair/new$"), false),
        new("POST", new Regex("^chat$"), true),
        new("POST", new Regex("^chat/stop$"), true),
    };

    public static Allowed? Match(string method, string path)
    {
        var p = (path ?? "").Trim('/');
        return AllowList.FirstOrDefault(a => a.Method.Equals(method, StringComparison.OrdinalIgnoreCase) && a.Path.IsMatch(p));
    }

    public sealed record RelayResult(int Status, string ContentType, string Body);

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly CollectorService _collector;
    private readonly Logger _logger;

    public RemoteRelay(CollectorService collector, Logger logger)
    {
        _collector = collector;
        _logger = logger;
    }

    /// <summary>The peer's address as the collector dials it (the registry address, scheme-qualified,
    /// no trailing slash); null for self or an unknown source.</summary>
    public string? AddressOf(string? sourceId)
    {
        if (string.IsNullOrWhiteSpace(sourceId) || sourceId == CollectorService.SelfId) return null;
        var s = _collector.ListSources().FirstOrDefault(x => x.Id == sourceId && x.Kind == "remote");
        return s?.Address;
    }

    public bool SendsAllowed(string sourceId) => _collector.ListSources().FirstOrDefault(x => x.Id == sourceId)?.AllowSends ?? false;

    /// <summary>Forward one allow-listed call. <paramref name="path"/> is the peer route without
    /// <c>/api/</c>; <paramref name="query"/> is the raw query string ("" or "?…"). For <c>chat</c> — which
    /// answers with the run's SSE stream — only the status line is read; the run is detached on the peer.</summary>
    public async Task<RelayResult> ForwardAsync(string sourceId, string method, string path, string query, string? repoId, string? body, CancellationToken ct)
    {
        var req = _collector.BuildPeerRequest(sourceId, new HttpMethod(method.ToUpperInvariant()), $"/api/{path.Trim('/')}{query}");
        if (req is null) return new RelayResult(404, "application/json", "{\"error\":\"not a subscribed remote harness\"}");
        if (!string.IsNullOrWhiteSpace(repoId)) req.Headers.TryAddWithoutValidation("X-Repo-Id", repoId);
        if (body is not null) req.Content = new StringContent(body, Encoding.UTF8, "application/json");
        var headersOnly = path.Trim('/') == "chat";
        try
        {
            using var resp = await Http.SendAsync(req, headersOnly ? HttpCompletionOption.ResponseHeadersRead : HttpCompletionOption.ResponseContentRead, ct).ConfigureAwait(false);
            var type = resp.Content.Headers.ContentType?.MediaType ?? "application/json";
            if (headersOnly)
            {
                // 2xx = the run started on the peer; a 409 (busy) or 4xx comes with a small JSON body worth relaying.
                var text = (int)resp.StatusCode is >= 200 and < 300 ? "{\"ok\":true}" : await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
                return new RelayResult((int)resp.StatusCode, (int)resp.StatusCode is >= 200 and < 300 ? "application/json" : type, _collector.ScrubBody(sourceId, text));
            }
            // ScrubBody, not ScrubFor: the latter caps at 200 chars (it is for one-line reasons) and would cut a dock in half.
            var content = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            return new RelayResult((int)resp.StatusCode, type, _collector.ScrubBody(sourceId, content));
        }
        catch (Exception ex)
        {
            var reason = ex is TaskCanceledException or OperationCanceledException ? "timed out" : (ex.InnerException ?? ex).Message;
            _logger.Info($"[REMOTE] relay {method} {path} to source {sourceId}: {reason}");
            return new RelayResult(502, "application/json", JsonSerializer.Serialize(new { error = "peer unreachable", detail = _collector.ScrubFor(sourceId, reason) }));
        }
    }

    /// <summary>Mint a one-shot pairing PIN on the peer (its <c>POST /api/remote/pair/new</c>) so the
    /// projector browser can log itself in there; null when the peer refused or is unreachable.</summary>
    public async Task<string?> MintPeerPinAsync(string sourceId, CancellationToken ct)
    {
        var r = await ForwardAsync(sourceId, "POST", "remote/pair/new", "", null, null, ct).ConfigureAwait(false);
        if (r.Status is < 200 or >= 300) return null;
        try
        {
            using var doc = JsonDocument.Parse(r.Body);
            return doc.RootElement.TryGetProperty("pin", out var pin) && pin.ValueKind == JsonValueKind.String ? pin.GetString() : null;
        }
        catch { return null; }
    }

    // ---- the hop, pure ----------------------------------------------------------------------

    /// <summary>The URL the big screen is sent to for a PEER's agent: the peer's /remote redeems the
    /// one-shot PIN (minting the projector browser's session there) and continues to the studio with
    /// the agent and the screen name — exactly the deep link a Kanban chip opens, plus the listener's flag.</summary>
    public static string HopUrl(string peerAddress, string? pin, string repoId, string screenName)
    {
        var then = $"/studio?agent={Uri.EscapeDataString(repoId)}&screen={Uri.EscapeDataString(screenName)}";
        if (string.IsNullOrWhiteSpace(pin)) return $"{peerAddress.TrimEnd('/')}{then}"; // no credential: the peer's login page, honestly
        return $"{peerAddress.TrimEnd('/')}/remote?pin={Uri.EscapeDataString(pin)}&then={Uri.EscapeDataString(then)}";
    }

    /// <summary>The URL that brings the big screen BACK to this harness's own agent (it is already
    /// logged in here — it paired with this harness).</summary>
    public static string SelfUrl(string selfBase, string repoId, string screenName) =>
        $"{selfBase.TrimEnd('/')}/studio?agent={Uri.EscapeDataString(repoId)}&screen={Uri.EscapeDataString(screenName)}";

    /// <summary>Home: this harness's studio, listening — where a view tapped while the screen shows a
    /// peer brings it first (the views are the hub's: kanban, status, the arch).</summary>
    public static string HomeUrl(string selfBase, string screenName) =>
        $"{selfBase.TrimEnd('/')}/studio?screen={Uri.EscapeDataString(screenName)}";

    /// <summary>Where a command goes and what it becomes (pure): the phone posts every command to the
    /// harness it is paired with and names where the big screen currently is (<paramref name="screenOn"/>:
    /// null / "self" = a page of this harness, else the peer whose page it shows). An <c>open-agent</c>
    /// that crosses machines becomes a <c>navigate</c> to the right URL; everything else is enqueued where
    /// the screen listens.</summary>
    public sealed record Plan(string Queue, string Type, JsonElement? Args, string? Note);

    public static Plan PlanCommand(string type, JsonElement? args, string? screenOn, string selfBase, string screenName,
        Func<string, string?> addressOf, Func<string, string?> pinFor)
    {
        var queue = string.IsNullOrWhiteSpace(screenOn) || screenOn == CollectorService.SelfId ? "self" : screenOn!;
        // A navigate WITH a url is one a hub already planned and forwarded to us (the screen listens
        // here): enqueue it as it is. A navigate WITHOUT one is the phone's — it always means HOME (the
        // phone never names a URL itself): it goes to the peer's queue and brings the screen back here.
        if (type == "navigate" && Str(args, "url") is not null) return new Plan(queue, type, args, null);
        if (type == "navigate") return queue == "self" ? new Plan("self", "navigate", null, "already home") : new Plan(queue, "navigate", Json(new { url = HomeUrl(selfBase, screenName) }), "home");
        if (type != "open-agent") return new Plan(queue, type, args, null);

        var sourceId = Str(args, "sourceId");
        var repoId = Str(args, "repoId") ?? Str(args, "agent") ?? Str(args, "handle") ?? "";
        var targetIsSelf = string.IsNullOrWhiteSpace(sourceId) || sourceId == CollectorService.SelfId;
        if (targetIsSelf && queue == "self") return new Plan("self", type, args, null);            // the local case, untouched
        if (targetIsSelf) return new Plan(queue, "navigate", Json(new { url = SelfUrl(selfBase, repoId, screenName), agent = repoId }), "back to this harness");
        var address = addressOf(sourceId!);
        if (address is null) return new Plan(queue, "navigate", null, "unknown machine");
        var pin = pinFor(sourceId!);
        return new Plan(queue, "navigate", Json(new { url = HopUrl(address, pin, repoId, screenName), agent = repoId, sourceId }), pin is null ? "no credential for the peer — its login page" : null);
    }

    private static string? Str(JsonElement? args, string name) =>
        args is { ValueKind: JsonValueKind.Object } a && a.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString()) ? v.GetString() : null;

    private static JsonElement Json(object o) => JsonSerializer.SerializeToElement(o);
}
