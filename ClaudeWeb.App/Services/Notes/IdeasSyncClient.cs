using System.Text;
using System.Text.Json;

namespace ClaudeWeb.Services.Notes;

/// <summary>
/// Transport for the shared ideas board (openspec ideas-drive-sync): plain
/// HttpClient against the configured Apps Script web-app URL — no Google SDK,
/// no OAuth. The endpoint contract lives in docs/ideas-sync-appscript.gs.
///
/// Apps Script quirks handled here:
///  - Responses arrive via a 302 redirect to script.googleusercontent.com; the
///    default handler follows it (the POST→GET downgrade on redirect is exactly
///    how Apps Script serves POST responses — expected, not a bug).
///  - The web app always answers HTTP 200, so failures are detected from the
///    body: an { ok:false, error } envelope, or a non-JSON HTML error page.
/// Exceptions thrown here never embed the URL (it is a bearer capability that
/// must stay out of logs).
/// </summary>
public class IdeasSyncClient
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(30) };
    private static readonly JsonSerializerOptions InOpts = new() { PropertyNameCaseInsensitive = true };
    private static readonly JsonSerializerOptions OutOpts = new();

    /// <summary>The shared board payload, PascalCase like the local notes.json.</summary>
    public sealed record SharedStore(List<NotesService.Note>? Ideas, List<NotesService.Tombstone>? Tombstones);

    /// <summary>One endpoint exchange. Ok=false + Conflict=true means the CAS
    /// baseRev was stale — Store carries the current remote board to re-merge.</summary>
    public sealed record EndpointResult(bool Ok, bool Conflict, long Rev, SharedStore? Store, string? Error);

    private sealed class Envelope
    {
        public bool Ok { get; set; }
        public bool Conflict { get; set; }
        public long Rev { get; set; }
        public JsonElement Store { get; set; }
        public string? Error { get; set; }
    }

    public virtual async Task<EndpointResult> GetAsync(string url, CancellationToken ct)
    {
        var body = await Http.GetStringAsync(WithQuery(url, "fn=get"), ct);
        return Parse(body);
    }

    public virtual async Task<EndpointResult> PostAsync(string url, long baseRev, SharedStore store, CancellationToken ct)
    {
        var payload = JsonSerializer.Serialize(new { baseRev, store }, OutOpts);
        using var content = new StringContent(payload, Encoding.UTF8, "application/json");
        using var resp = await Http.PostAsync(url, content, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        return Parse(body);
    }

    private static string WithQuery(string url, string query)
        => url + (url.Contains('?') ? "&" : "?") + query;

    private static EndpointResult Parse(string body)
    {
        Envelope? env;
        try
        {
            env = JsonSerializer.Deserialize<Envelope>(body, InOpts);
        }
        catch (JsonException)
        {
            // HTML error page (bad deployment, Google interstitial) — not JSON.
            return new EndpointResult(false, false, 0, null, "Endpoint returned a non-JSON response (check the deployment: web app, execute as me, anyone has access).");
        }
        if (env is null) return new EndpointResult(false, false, 0, null, "Empty endpoint response.");

        SharedStore? store = null;
        if (env.Store.ValueKind is JsonValueKind.Object)
        {
            try { store = JsonSerializer.Deserialize<SharedStore>(env.Store.GetRawText(), InOpts); }
            catch (JsonException) { return new EndpointResult(false, false, env.Rev, null, "Malformed shared store in endpoint response."); }
        }
        return new EndpointResult(env.Ok, env.Conflict, env.Rev, store, env.Error);
    }
}
