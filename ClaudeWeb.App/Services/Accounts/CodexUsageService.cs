using System.Text.Json;
using ClaudeWeb.Services.Logging;
using static ClaudeWeb.Services.Accounts.ClaudeUsageService;

namespace ClaudeWeb.Services.Accounts;

/// <summary>
/// Live Codex plan-usage probe (openspec codex-account-and-models) — the Codex twin of
/// <see cref="ClaudeUsageService"/>. The Codex CLI's own <c>/status</c> panel reads the
/// ChatGPT backend's usage endpoint; nothing on disk holds these numbers, so this probe
/// reads the stored OAuth access token and account id from <c>auth.json</c> under the
/// same hard boundary: read into locals, sent as headers to chatgpt.com, discarded —
/// never a field, never logged, never in an error string.
///
/// Verified shape (2026-09-07, ChatGPT plan "prolite"): <c>rate_limit.primary_window</c>
/// / <c>secondary_window</c> with <c>used_percent</c>, <c>limit_window_seconds</c>,
/// <c>reset_at</c> (unix seconds); <c>additional_rate_limits[]</c> per model family
/// (<c>limit_name</c> + its own windows); <c>credits</c>; <c>plan_type</c>. Windows are
/// mapped by length: 5 h → session, 7 d → weekly, anything else → a labelled scoped
/// row. Parsing is tolerant and every failure degrades to Available=false; results are
/// memoised for minutes with a single-flight refresh and a stale last-good fallback.
/// </summary>
public class CodexUsageService
{
    private const string UsageUrl = "https://chatgpt.com/backend-api/wham/usage";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };

    private readonly Logger _logger;
    private readonly object _gate = new();
    private CodexUsageStatus? _cached;
    private CodexUsageStatus? _lastGood;
    private DateTime _cachedAtUtc = DateTime.MinValue;
    private Task<CodexUsageStatus>? _inflight;

    public CodexUsageService(Logger logger)
    {
        _logger = logger;
    }

    public sealed record Credits(bool HasCredits, bool Unlimited, string? Balance);

    /// <summary>Same window shape as the Claude probe so the dashboard chip renders
    /// both with one helper (<c>session</c> / <c>weekly</c> / <c>scopedWeekly</c>).</summary>
    public sealed record CodexUsageStatus(
        bool Available, bool Stale, string? FetchedAt,
        UsageLimit? Session, UsageLimit? Weekly, IReadOnlyList<UsageLimit> ScopedWeekly,
        string? Plan, Credits? Credits, bool LimitReached, IReadOnlyList<string> Models, string? Error);

    public Task<CodexUsageStatus> GetAsync()
    {
        lock (_gate)
        {
            if (_cached is not null && DateTime.UtcNow - _cachedAtUtc < CacheTtl)
                return Task.FromResult(_cached);
            _inflight ??= RefreshAsync();
            return _inflight;
        }
    }

    private async Task<CodexUsageStatus> RefreshAsync()
    {
        CodexUsageStatus result;
        try
        {
            result = await FetchAsync().ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.Info($"[CODEX-USAGE] fetch failed (fail-soft): {ex.GetType().Name}");
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

    private async Task<CodexUsageStatus> FetchAsync()
    {
        var (token, accountId) = ReadCredential();
        if (string.IsNullOrEmpty(token))
            return Unavailable("no ChatGPT session");
        using var req = new HttpRequestMessage(HttpMethod.Get, UsageUrl);
        req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + token);
        if (!string.IsNullOrEmpty(accountId)) req.Headers.TryAddWithoutValidation("chatgpt-account-id", accountId);
        req.Headers.TryAddWithoutValidation("User-Agent", "codex-cli");
        using var resp = await Http.SendAsync(req).ConfigureAwait(false);
        if (!resp.IsSuccessStatusCode)
        {
            _logger.Info($"[CODEX-USAGE] upstream returned {(int)resp.StatusCode}");
            return Unavailable(resp.StatusCode == System.Net.HttpStatusCode.Unauthorized
                ? "ChatGPT session rejected"
                : $"upstream error {(int)resp.StatusCode}");
        }
        var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
        return Parse(body);
    }

    /// <summary>The ONLY place the token value exists: read from auth.json, handed to
    /// <see cref="FetchAsync"/> for the bearer header, then gone. An API-key login
    /// (<c>auth_mode</c> without ChatGPT tokens) has no usage endpoint → null.</summary>
    private static (string? Token, string? AccountId) ReadCredential()
    {
        var path = Path.Combine(CodexAccountService.CodexHome(), "auth.json");
        if (!File.Exists(path)) return (null, null);
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            if (!doc.RootElement.TryGetProperty("tokens", out var tokens) || tokens.ValueKind != JsonValueKind.Object)
                return (null, null);
            return (ReadString(tokens, "access_token"), ReadString(tokens, "account_id"));
        }
        catch
        {
            return (null, null);
        }
    }

    /// <summary>Pure mapping of the wham/usage body (pinned by tests to the real shape).</summary>
    public static CodexUsageStatus Parse(string body)
    {
        UsageLimit? session = null, weekly = null;
        var scoped = new List<UsageLimit>();
        string? plan = null;
        Credits? credits = null;
        var limitReached = false;
        var models = new List<string>();
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            plan = ReadString(root, "plan_type");
            if (root.TryGetProperty("rate_limit", out var rl) && rl.ValueKind == JsonValueKind.Object)
            {
                limitReached = rl.TryGetProperty("limit_reached", out var lr) && lr.ValueKind == JsonValueKind.True;
                foreach (var w in Windows(rl, limitReached))
                {
                    if (w.Kind == "session" && session is null) session = w.Limit;
                    else if (w.Kind == "weekly" && weekly is null) weekly = w.Limit;
                    else scoped.Add(w.Limit with { Label = w.Limit.Label ?? w.Kind });
                }
            }
            if (root.TryGetProperty("additional_rate_limits", out var extra) && extra.ValueKind == JsonValueKind.Array)
            {
                foreach (var entry in extra.EnumerateArray())
                {
                    if (entry.ValueKind != JsonValueKind.Object) continue;
                    var name = ReadString(entry, "limit_name") ?? "Model";
                    if (!entry.TryGetProperty("rate_limit", out var erl) || erl.ValueKind != JsonValueKind.Object) continue;
                    var reached = erl.TryGetProperty("limit_reached", out var elr) && elr.ValueKind == JsonValueKind.True;
                    foreach (var w in Windows(erl, reached))
                        scoped.Add(w.Limit with { Label = $"{name} · {(w.Kind == "session" ? "5h" : w.Kind == "weekly" ? "week" : w.Kind)}" });
                }
            }
            // The models this account may actually run — the ONLY reliable source of
            // valid codex model slugs (a guessed list offers models that 401). Keys of
            // model_usage whose `available` is true (openspec codex-account-and-models).
            if (root.TryGetProperty("model_usage", out var mu) && mu.ValueKind == JsonValueKind.Object)
                foreach (var m in mu.EnumerateObject())
                    if (m.Value.ValueKind == JsonValueKind.Object && m.Value.TryGetProperty("available", out var av) && av.ValueKind == JsonValueKind.True)
                        models.Add(m.Name);
            if (root.TryGetProperty("credits", out var cr) && cr.ValueKind == JsonValueKind.Object)
            {
                credits = new Credits(
                    cr.TryGetProperty("has_credits", out var hc) && hc.ValueKind == JsonValueKind.True,
                    cr.TryGetProperty("unlimited", out var un) && un.ValueKind == JsonValueKind.True,
                    ReadString(cr, "balance"));
            }
        }
        catch (JsonException)
        {
            return Unavailable("unrecognised usage response");
        }
        if (session is null && weekly is null && scoped.Count == 0)
            return Unavailable("no usage data in response");
        return new CodexUsageStatus(true, false, DateTime.UtcNow.ToString("o"),
            session, weekly, scoped, plan, credits, limitReached, models, null);
    }

    private sealed record Window(string Kind, UsageLimit Limit);

    /// <summary>primary_window / secondary_window → typed windows keyed by length.</summary>
    private static IEnumerable<Window> Windows(JsonElement rateLimit, bool limitReached)
    {
        foreach (var key in new[] { "primary_window", "secondary_window" })
        {
            if (!rateLimit.TryGetProperty(key, out var w) || w.ValueKind != JsonValueKind.Object) continue;
            var used = ReadNumber(w, "used_percent");
            var seconds = ReadNumber(w, "limit_window_seconds");
            var resetAt = ReadNumber(w, "reset_at");
            var resetsAt = resetAt.HasValue
                ? DateTimeOffset.FromUnixTimeSeconds((long)resetAt.Value).ToString("o")
                : null;
            var severity = limitReached ? "critical" : used >= 80 ? "warn" : "normal";
            var kind = seconds switch
            {
                >= 17000 and <= 19000 => "session",
                >= 600000 and <= 610000 => "weekly",
                { } s => $"{Math.Round(s / 3600)}h",
                _ => "window",
            };
            yield return new Window(kind, new UsageLimit(null, used, resetsAt, severity));
        }
    }

    private static CodexUsageStatus Unavailable(string reason) =>
        new(false, false, null, null, null, Array.Empty<UsageLimit>(), null, null, false, Array.Empty<string>(), reason);

    private static string? ReadString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    private static double? ReadNumber(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number ? p.GetDouble() : null;
}
