using System.Text;
using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Accounts;

/// <summary>
/// Read-only probe of the Codex CLI login the <c>codex</c> provider runs as
/// (openspec codex-real-run). Codex owns its own secret store
/// (<c>%USERPROFILE%\.codex\auth.json</c>, or <c>%CODEX_HOME%\auth.json</c>), so the
/// harness asks the CLI itself: <c>codex login status</c> exits 0 when a login
/// exists and prints how it was made ("Logged in using ChatGPT" / "... an API
/// key"); it exits 1 with "Not logged in" otherwise (codex-cli 0.153.4). The
/// key/token is never read out — only the CLI's verdict. Memoised for a minute
/// like the other account probes; <see cref="Refresh"/> busts the cache after a
/// credential change.
/// </summary>
public class CodexAccountService
{
    private readonly Logger _logger;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(1);
    private const int TimeoutMs = 8000;

    private readonly object _gate = new();
    private CodexAccountStatus? _cached;
    private DateTime _cachedAtUtc = DateTime.MinValue;

    public CodexAccountService(Logger logger)
    {
        _logger = logger;
    }

    /// <summary>Typed status (camelCase on the wire: <c>codexInstalled</c>, …).
    /// <c>Home</c> is where Codex keeps its auth — the exact place the Operator
    /// must put a credential (or run <c>codex login</c> as the harness user).</summary>
    public sealed record CodexAccountStatus(
        bool CodexInstalled, bool Authenticated, string? Method, string? Version, string? Home, string? Error,
        string? Account = null, string? Name = null, string? Plan = null, string? PlanType = null,
        string? SubscriptionUntil = null, string? AuthProvider = null);

    /// <summary>Who the login is (openspec codex-account-and-models): read from the
    /// claims of the id token Codex stores in auth.json — email, display name, ChatGPT
    /// plan type, subscription end, identity provider. Claims only: the token VALUES
    /// are never returned, logged or kept. Missing/odd shapes yield nulls, never throw.</summary>
    public sealed record CodexIdentity(string? Account, string? Name, string? PlanType, string? SubscriptionUntil, string? AuthProvider, string? AuthMode);

    public CodexAccountStatus Get()
    {
        lock (_gate)
        {
            if (_cached is not null && DateTime.UtcNow - _cachedAtUtc < CacheTtl)
                return _cached;
        }
        return Refresh();
    }

    /// <summary>Re-probe now (after a credential change) and cache the result.</summary>
    public CodexAccountStatus Refresh()
    {
        var status = Probe();
        lock (_gate)
        {
            _cached = status;
            _cachedAtUtc = DateTime.UtcNow;
        }
        return status;
    }

    /// <summary>Where Codex looks for auth.json — the Operator-facing answer to
    /// "where does the credential go" for THIS harness process.</summary>
    public static string CodexHome()
    {
        var env = Environment.GetEnvironmentVariable("CODEX_HOME");
        if (!string.IsNullOrWhiteSpace(env)) return env;
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrEmpty(home)) home = Environment.GetEnvironmentVariable("HOME") ?? string.Empty;
        return Path.Combine(home, ".codex");
    }

    private CodexAccountStatus Probe()
    {
        var codex = ProcessProbe.ResolveOnPath("codex");
        var home = CodexHome();
        if (codex is null)
            return new CodexAccountStatus(false, false, null, null, home, "codex not found on PATH");

        var version = ProcessProbe.Run(codex, new[] { "--version" }, TimeoutMs);
        var versionText = version.ExitCode == 0 ? FirstLine(version.StdOut) : null;

        var status = ProcessProbe.Run(codex, new[] { "login", "status" }, TimeoutMs);
        var parsed = Parse(status.ExitCode, status.StdOut, status.StdErr, status.TimedOut);
        if (!parsed.Authenticated)
            return parsed with { Version = versionText, Home = home };

        var id = ReadIdentity(Path.Combine(home, "auth.json"));
        _logger.Info($"[CODEX-ACCT] {parsed.Method} as {id.Account ?? "(unknown)"} ({PlanLabel(id.PlanType) ?? "?"}, {versionText ?? "?"})");
        return parsed with
        {
            Version = versionText, Home = home,
            Account = id.Account, Name = id.Name, Plan = PlanLabel(id.PlanType), PlanType = id.PlanType,
            SubscriptionUntil = id.SubscriptionUntil, AuthProvider = id.AuthProvider,
        };
    }

    /// <summary>auth.json → identity claims. Fail-soft file read around <see cref="ParseIdentity"/>.</summary>
    private CodexIdentity ReadIdentity(string authJsonPath)
    {
        try
        {
            if (!File.Exists(authJsonPath)) return new CodexIdentity(null, null, null, null, null, null);
            return ParseIdentity(File.ReadAllText(authJsonPath));
        }
        catch (Exception ex)
        {
            _logger.Info($"[CODEX-ACCT] identity read failed (fail-soft): {ex.GetType().Name}");
            return new CodexIdentity(null, null, null, null, null, null);
        }
    }

    /// <summary>Pure: the auth.json text → claims of <c>tokens.id_token</c> (email, name,
    /// <c>https://api.openai.com/auth</c>.chatgpt_plan_type / chatgpt_subscription_active_until,
    /// auth_provider) plus the top-level <c>auth_mode</c>. Only the payload segment of the
    /// JWT is base64url-decoded; the signature and the token string itself are not retained.</summary>
    public static CodexIdentity ParseIdentity(string authJson)
    {
        string? account = null, name = null, planType = null, until = null, provider = null, mode = null;
        try
        {
            using var doc = JsonDocument.Parse(authJson);
            var root = doc.RootElement;
            mode = root.TryGetProperty("auth_mode", out var am) && am.ValueKind == JsonValueKind.String ? am.GetString() : null;
            if (root.TryGetProperty("tokens", out var tokens) && tokens.ValueKind == JsonValueKind.Object &&
                tokens.TryGetProperty("id_token", out var idt) && idt.ValueKind == JsonValueKind.String)
            {
                var parts = (idt.GetString() ?? "").Split('.');
                if (parts.Length >= 2)
                {
                    var payload = parts[1].Replace('-', '+').Replace('_', '/');
                    payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
                    using var claims = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(payload)));
                    var c = claims.RootElement;
                    account = Str(c, "email");
                    name = Str(c, "name");
                    provider = Str(c, "auth_provider");
                    if (c.TryGetProperty("https://api.openai.com/auth", out var auth) && auth.ValueKind == JsonValueKind.Object)
                    {
                        planType = Str(auth, "chatgpt_plan_type");
                        until = Str(auth, "chatgpt_subscription_active_until");
                    }
                }
            }
        }
        catch
        {
            // odd file / non-JWT id_token → identity unknown, status still valid
        }
        return new CodexIdentity(account, name, planType, until, provider, mode);
    }

    /// <summary>ChatGPT plan slug → label. Known slugs are spelled out; unknown ones are
    /// shown title-cased rather than hidden, so a new tier is still visible.</summary>
    public static string? PlanLabel(string? planType) => planType?.ToLowerInvariant() switch
    {
        null or "" => null,
        "free" => "Free",
        "go" => "Go",
        "plus" => "Plus",
        "pro" => "Pro",
        "prolite" => "Pro (lite)",
        "team" or "business" => "Business",
        "enterprise" => "Enterprise",
        "edu" => "Edu",
        var other => char.ToUpperInvariant(other[0]) + other[1..],
    };

    private static string? Str(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    /// <summary>Pure mapping of the <c>codex login status</c> outcome (pinned by
    /// tests to the real 0.153.4 shapes): exit 0 = logged in, the first stdout
    /// line names the method; exit 1 / "Not logged in" = not authenticated.</summary>
    public static CodexAccountStatus Parse(int exitCode, string stdout, string stderr, bool timedOut)
    {
        if (timedOut)
            return new CodexAccountStatus(true, false, null, null, null, "codex login status timed out");
        var line = FirstLine(stdout) ?? FirstLine(stderr);
        if (exitCode == 0 && line is not null && !line.Contains("Not logged in", StringComparison.OrdinalIgnoreCase))
            return new CodexAccountStatus(true, true, line, null, null, null);
        return new CodexAccountStatus(true, false, null, null, null, line ?? "Not logged in");
    }

    private static string? FirstLine(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var line = s.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                    .Select(l => l.Trim())
                    .FirstOrDefault(l => l.Length > 0);
        if (line is null) return null;
        return line.Length > 200 ? line[..200] : line;
    }
}
