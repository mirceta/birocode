using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Accounts;

/// <summary>
/// Write-only path to establish the box's GLOBAL GitHub credential from a
/// user-supplied Personal Access Token (openspec add-git-identity-surface).
///
/// Pipes the token to <c>gh auth login --with-token</c> via the child's STDIN —
/// never on argv (visible in process listings) and never in an env var — then runs
/// <c>gh auth setup-git</c> so the same token serves both the GitHub API and
/// <c>git push</c> over HTTPS. The token is never echoed in a response, never
/// logged, and never persisted by us; <c>gh</c> owns the secret store. The returned
/// account is RE-DERIVED by re-probing, never reflected back from the submitted token.
/// </summary>
public sealed class GitHubCredentialsService
{
    private readonly GitHubAccountService _account;
    private readonly Logger _logger;

    // gh --with-token does a network validation round-trip; allow a little more than
    // the read-only probes' 5s.
    private const int TimeoutMs = 15000;

    public GitHubCredentialsService(GitHubAccountService account, Logger logger)
    {
        _account = account;
        _logger = logger;
    }

    /// <summary>Typed outcome. The token never appears here.</summary>
    public sealed record SetTokenResult(bool Ok, string? Host, string? Account, string? Error);

    public SetTokenResult SetToken(string? token)
    {
        token = token?.Trim();
        if (string.IsNullOrEmpty(token))
            return new SetTokenResult(false, null, null, "No token provided");

        var gh = ProcessProbe.ResolveOnPath("gh");
        if (gh is null)
        {
            _logger.Error("[GH-CRED] gh not found on PATH");
            return new SetTokenResult(false, null, null, "gh not found on PATH");
        }

        // 1. Log the token into gh via STDIN. The token is the stdin payload only —
        //    it is never an argument and never an environment variable.
        var login = ProcessProbe.Run(
            gh, new[] { "auth", "login", "--hostname", "github.com", "--with-token" }, TimeoutMs, stdin: token);
        if (login.ExitCode != 0)
        {
            var reason = Scrub(
                login.TimedOut ? "gh login timed out" : FirstLine(login.StdErr) ?? "gh rejected the token", token);
            _logger.Error($"[GH-CRED] login failed: {reason}");
            return new SetTokenResult(false, null, null, reason);
        }

        // 2. Wire gh as git's credential helper so `git push` uses the same token.
        var setup = ProcessProbe.Run(gh, new[] { "auth", "setup-git", "--hostname", "github.com" }, TimeoutMs);
        if (setup.ExitCode != 0)
        {
            var reason = Scrub(FirstLine(setup.StdErr) ?? "gh auth setup-git failed", token);
            _logger.Error($"[GH-CRED] setup-git failed: {reason}");
            return new SetTokenResult(false, null, null, reason);
        }

        // 3. Re-derive the account by re-probing (busts the cache so the chip flips on
        //    its next poll). Never reflect the submitted token back.
        var status = _account.Refresh();
        _logger.Info($"[GH-CRED] credential established for {status.Account ?? "github.com"}");
        return new SetTokenResult(true, status.Host ?? "github.com", status.Account, null);
    }

    /// <summary>Defensively strip the token from any text we log or return, so a
    /// gh error that echoes the token can never leak it.</summary>
    private static string Scrub(string text, string token)
        => string.IsNullOrEmpty(token) ? text : text.Replace(token, "***");

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
