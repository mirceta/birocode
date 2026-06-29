using System.Text.RegularExpressions;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Accounts;

/// <summary>
/// Read-only probe of the box's CURRENT GLOBAL GitHub identity — the account the
/// harness would push and open PRs as (openspec add-account-status). Shells the
/// <c>gh</c> CLI; never logs in/out or switches accounts.
///
/// Three facts, in one typed status:
///   - <c>GhInstalled</c>  — is <c>gh</c> on PATH at all,
///   - <c>Authenticated</c>— can it actually reach GitHub right now
///                           (<c>gh api user</c> succeeds — a real API round-trip,
///                           so this also covers "upstream reachable"),
///   - <c>Account</c>/<c>Host</c> — the login + active host when authenticated.
///
/// Results are memoised for a few seconds so the dashboard's ~5s poll (plus any
/// concurrent callers) collapses to ~one <c>gh</c> invocation per window.
/// </summary>
public partial class GitHubAccountService
{
    private readonly Logger _logger;

    private const int TimeoutMs = 5000;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(5);

    private readonly object _gate = new();
    private GitHubAccountStatus? _cached;
    private DateTime _cachedAtUtc = DateTime.MinValue;

    public GitHubAccountService(Logger logger)
    {
        _logger = logger;
    }

    /// <summary>Typed status. PascalCase props serialise to the documented
    /// camelCase contract (<c>ghInstalled</c>, …).</summary>
    public sealed record GitHubAccountStatus(
        bool GhInstalled, bool Authenticated, string? Account, string? Host, string? Error);

    // "✓ Logged in to github.com account octocat (...)" — host token only; the
    // login itself comes from `gh api user`, which is authoritative and not localised.
    [GeneratedRegex(@"Logged in to (\S+)", RegexOptions.IgnoreCase)]
    private static partial Regex HostRegex();

    public GitHubAccountStatus Get()
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

    private GitHubAccountStatus Probe()
    {
        var gh = ProcessProbe.ResolveOnPath("gh");
        if (gh is null)
            return new GitHubAccountStatus(false, false, null, null, "gh not found on PATH");

        // Authoritative login + a real reachability check in one call.
        var user = ProcessProbe.Run(gh, new[] { "api", "user", "--jq", ".login" }, TimeoutMs);
        var login = user.StdOut.Trim();

        if (user.ExitCode != 0 || login.Length == 0)
        {
            var reason = user.TimedOut
                ? "GitHub unreachable (timed out)"
                : FirstLine(user.StdErr) ?? "not authenticated";
            _logger.Info($"[GH-ACCT] installed, not authenticated: {reason}");
            return new GitHubAccountStatus(true, false, null, null, reason);
        }

        // Authenticated — fetch the active host (best-effort; default to github.com).
        string? host = null;
        var auth = ProcessProbe.Run(gh, new[] { "auth", "status" }, TimeoutMs);
        var authText = auth.StdOut + "\n" + auth.StdErr;
        var m = HostRegex().Match(authText);
        if (m.Success) host = m.Groups[1].Value;
        host ??= "github.com";

        _logger.Info($"[GH-ACCT] authenticated as {login} @ {host}");
        return new GitHubAccountStatus(true, true, login, host, null);
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
