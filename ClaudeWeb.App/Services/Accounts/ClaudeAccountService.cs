using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Accounts;

/// <summary>
/// Read-only probe of the CURRENT Claude subscription login the <c>claude</c> CLI
/// runs as (openspec add-account-status). The harness forces subscription auth —
/// <c>CliRunnerService</c> strips <c>ANTHROPIC_API_KEY</c> from every run — so the
/// identity that matters is the CLI's logged-in account, not any API key.
///
/// The CLI has no stable <c>whoami</c>, so rather than run a (billable) command we
/// READ the login state the CLI itself persists under the harness user's home:
///   - <c>~/.claude/.credentials.json</c> → <c>claudeAiOauth</c>: the token's
///     <c>expiresAt</c> (live-session check) and <c>subscriptionType</c> (the plan),
///   - <c>~/.claude.json</c> → <c>oauthAccount</c>: <c>emailAddress</c> / <c>displayName</c>.
/// The access/refresh tokens are NEVER read out — only the metadata above. Every
/// read is fail-soft: a missing or unexpected file shape yields "not authenticated"
/// rather than an exception, so a future format drift degrades gracefully.
///
/// Results are memoised for a few seconds to match the GitHub probe and keep the
/// dashboard poll cheap.
/// </summary>
public class ClaudeAccountService
{
    private readonly Logger _logger;

    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(5);

    private readonly object _gate = new();
    private ClaudeAccountStatus? _cached;
    private DateTime _cachedAtUtc = DateTime.MinValue;

    public ClaudeAccountService(Logger logger)
    {
        _logger = logger;
    }

    /// <summary>Typed status. PascalCase props serialise to the documented
    /// camelCase contract (<c>claudeInstalled</c>, …).</summary>
    public sealed record ClaudeAccountStatus(
        bool ClaudeInstalled, bool Authenticated, string? Account, string? Plan, string? Error);

    public ClaudeAccountStatus Get()
    {
        lock (_gate)
        {
            if (_cached is not null && DateTime.UtcNow - _cachedAtUtc < CacheTtl)
                return _cached;
        }

        var status = Probe();

        lock (_gate)
        {
            _cached = status;
            _cachedAtUtc = DateTime.UtcNow;
        }
        return status;
    }

    private ClaudeAccountStatus Probe()
    {
        var claude = ProcessProbe.ResolveOnPath("claude");
        if (claude is null)
            return new ClaudeAccountStatus(false, false, null, null, "claude not found on PATH");

        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrEmpty(home))
            home = Environment.GetEnvironmentVariable("HOME") ?? string.Empty;

        // --- subscription session: token validity + plan ---------------------
        bool hasToken = false;
        bool expired = false;
        string? plan = null;
        try
        {
            var credPath = Path.Combine(home, ".claude", ".credentials.json");
            if (File.Exists(credPath))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(credPath));
                if (doc.RootElement.TryGetProperty("claudeAiOauth", out var oauth) &&
                    oauth.ValueKind == JsonValueKind.Object)
                {
                    // Presence only — we never read the token VALUE out.
                    hasToken = oauth.TryGetProperty("accessToken", out var tok) &&
                               tok.ValueKind == JsonValueKind.String &&
                               !string.IsNullOrEmpty(tok.GetString());

                    if (oauth.TryGetProperty("expiresAt", out var exp) &&
                        exp.ValueKind == JsonValueKind.Number &&
                        exp.TryGetInt64(out var expMs))
                    {
                        expired = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() >= expMs;
                    }

                    if (oauth.TryGetProperty("subscriptionType", out var sub) &&
                        sub.ValueKind == JsonValueKind.String)
                    {
                        plan = TitleCase(sub.GetString());
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Info($"[CLAUDE-ACCT] credentials read failed (fail-soft): {ex.Message}");
        }

        // --- account identity ------------------------------------------------
        string? account = null;
        try
        {
            var cfgPath = Path.Combine(home, ".claude.json");
            if (File.Exists(cfgPath))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(cfgPath));
                if (doc.RootElement.TryGetProperty("oauthAccount", out var acct) &&
                    acct.ValueKind == JsonValueKind.Object)
                {
                    account = ReadString(acct, "emailAddress") ?? ReadString(acct, "displayName");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Info($"[CLAUDE-ACCT] config read failed (fail-soft): {ex.Message}");
        }

        var authenticated = hasToken && !expired;
        if (!authenticated)
        {
            var reason = !hasToken ? "no valid subscription session" : "subscription session expired";
            return new ClaudeAccountStatus(true, false, null, null, reason);
        }

        _logger.Info($"[CLAUDE-ACCT] authenticated as {account ?? "(unknown)"} ({plan ?? "?"})");
        return new ClaudeAccountStatus(true, true, account, plan, null);
    }

    private static string? ReadString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String
            ? p.GetString()
            : null;

    private static string? TitleCase(string? s)
    {
        if (string.IsNullOrEmpty(s)) return null;
        return char.ToUpperInvariant(s[0]) + s[1..];
    }
}
