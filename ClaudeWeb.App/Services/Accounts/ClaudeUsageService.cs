using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Accounts;

/// <summary>
/// Live plan-usage probe (openspec add-claude-usage): the 5-hour session window
/// and weekly quota the CLI's <c>/usage</c> panel shows, fetched from Anthropic's
/// OAuth usage endpoint. These numbers exist nowhere on disk — the endpoint is the
/// only source — so unlike <see cref="ClaudeAccountService"/> this probe DOES read
/// the stored OAuth access token, under a hard boundary (spec requirement "The
/// token is used as a credential only"): the token is read into a local, sent as
/// the bearer header to api.anthropic.com, and discarded. It must never be
/// assigned to a field, logged, put in an error string, or surfaced through any
/// harness response — log status codes and exception TYPES only.
///
/// The endpoint is CLI-internal and undocumented, so parsing is tolerant
/// (limits[] primary, legacy five_hour/seven_day fallback, unknown shapes
/// ignored) and every failure degrades to Available=false — never an exception.
/// Results are memoised for minutes (quota moves slowly) with a single-flight
/// refresh; a failed refresh after a prior success serves the last good result
/// marked Stale.
/// </summary>
public class ClaudeUsageService
{
    private const string UsageUrl = "https://api.anthropic.com/api/oauth/usage";
    private const string AnthropicBeta = "oauth-2025-04-20";

    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };

    private readonly Logger _logger;

    private readonly object _gate = new();
    private ClaudeUsageStatus? _cached;
    private ClaudeUsageStatus? _lastGood;
    private DateTime _cachedAtUtc = DateTime.MinValue;
    private Task<ClaudeUsageStatus>? _inflight;

    public ClaudeUsageService(Logger logger)
    {
        _logger = logger;
    }

    /// <summary>One usage window. PascalCase props serialise to the documented
    /// camelCase contract; Label is null for session/weekly, set for scoped rows.</summary>
    public sealed record UsageLimit(string? Label, double? Percent, string? ResetsAt, string? Severity);

    public sealed record ClaudeUsageStatus(
        bool Available, bool Stale, string? FetchedAt,
        UsageLimit? Session, UsageLimit? Weekly, IReadOnlyList<UsageLimit> ScopedWeekly,
        string? Error);

    public Task<ClaudeUsageStatus> GetAsync()
    {
        lock (_gate)
        {
            if (_cached is not null && DateTime.UtcNow - _cachedAtUtc < CacheTtl)
                return Task.FromResult(_cached);
            _inflight ??= RefreshAsync();
            return _inflight;
        }
    }

    private async Task<ClaudeUsageStatus> RefreshAsync()
    {
        ClaudeUsageStatus result;
        try
        {
            result = await FetchAsync().ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.Info($"[CLAUDE-USAGE] fetch failed (fail-soft): {ex.GetType().Name}");
            result = Unavailable("usage fetch failed");
        }

        lock (_gate)
        {
            if (result.Available)
                _lastGood = result;
            else if (_lastGood is not null)
                result = _lastGood with { Stale = true };
            _cached = result;
            _cachedAtUtc = DateTime.UtcNow;
            _inflight = null;
        }
        return result;
    }

    private async Task<ClaudeUsageStatus> FetchAsync()
    {
        var token = ReadAccessToken();
        if (string.IsNullOrEmpty(token))
            return Unavailable("no subscription session");

        using var req = new HttpRequestMessage(HttpMethod.Get, UsageUrl);
        req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + token);
        req.Headers.TryAddWithoutValidation("anthropic-beta", AnthropicBeta);

        using var resp = await Http.SendAsync(req).ConfigureAwait(false);
        if (!resp.IsSuccessStatusCode)
        {
            _logger.Info($"[CLAUDE-USAGE] upstream returned {(int)resp.StatusCode}");
            return Unavailable(resp.StatusCode == System.Net.HttpStatusCode.Unauthorized
                ? "subscription session rejected"
                : $"upstream error {(int)resp.StatusCode}");
        }

        var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
        return Parse(body);
    }

    /// <summary>The ONLY place the token value exists: read, returned to
    /// <see cref="FetchAsync"/> for the bearer header, then gone.</summary>
    private static string? ReadAccessToken()
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrEmpty(home))
            home = Environment.GetEnvironmentVariable("HOME") ?? string.Empty;

        var credPath = Path.Combine(home, ".claude", ".credentials.json");
        if (!File.Exists(credPath)) return null;

        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(credPath));
            return doc.RootElement.TryGetProperty("claudeAiOauth", out var oauth) &&
                   oauth.ValueKind == JsonValueKind.Object
                ? ReadString(oauth, "accessToken")
                : null;
        }
        catch
        {
            return null; // unreadable/odd shape → "no session", never an exception
        }
    }

    private ClaudeUsageStatus Parse(string body)
    {
        UsageLimit? session = null, weekly = null;
        var scoped = new List<UsageLimit>();

        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            if (root.TryGetProperty("limits", out var limits) && limits.ValueKind == JsonValueKind.Array)
            {
                foreach (var entry in limits.EnumerateArray())
                {
                    if (entry.ValueKind != JsonValueKind.Object) continue;
                    var limit = new UsageLimit(null, ReadNumber(entry, "percent"),
                        ReadString(entry, "resets_at"), ReadString(entry, "severity") ?? "normal");
                    switch (ReadString(entry, "kind"))
                    {
                        case "session":
                            session = limit;
                            break;
                        case "weekly_all":
                            weekly = limit;
                            break;
                        case "weekly_scoped":
                            scoped.Add(limit with { Label = ScopeLabel(entry) });
                            break;
                        // unknown kinds: ignored, per spec (schema drifts)
                    }
                }
            }

            // Legacy convenience fields — only if limits[] didn't provide the window.
            session ??= LegacyWindow(root, "five_hour");
            weekly ??= LegacyWindow(root, "seven_day");
        }
        catch (JsonException)
        {
            return Unavailable("unrecognised usage response");
        }

        if (session is null && weekly is null && scoped.Count == 0)
            return Unavailable("no usage data in response");

        return new ClaudeUsageStatus(true, false, DateTime.UtcNow.ToString("o"),
            session, weekly, scoped, null);
    }

    private static string ScopeLabel(JsonElement entry)
    {
        if (entry.TryGetProperty("scope", out var scope) && scope.ValueKind == JsonValueKind.Object &&
            scope.TryGetProperty("model", out var model) && model.ValueKind == JsonValueKind.Object)
        {
            var name = ReadString(model, "display_name");
            if (!string.IsNullOrEmpty(name)) return name;
        }
        return "Model";
    }

    private static UsageLimit? LegacyWindow(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var w) || w.ValueKind != JsonValueKind.Object)
            return null;
        return new UsageLimit(null, ReadNumber(w, "utilization"), ReadString(w, "resets_at"), "normal");
    }

    private static ClaudeUsageStatus Unavailable(string reason) =>
        new(false, false, null, null, null, Array.Empty<UsageLimit>(), reason);

    private static string? ReadString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String
            ? p.GetString()
            : null;

    private static double? ReadNumber(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number
            ? p.GetDouble()
            : null;
}
