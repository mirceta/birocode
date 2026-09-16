using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Accounts;

/// <summary>
/// Write-only path to establish the box's Codex CLI login from a pasted OpenAI
/// API key (openspec codex-real-run) — the Codex twin of
/// <see cref="GitHubCredentialsService"/>.
///
/// Pipes the key to <c>codex login --with-api-key</c> over the child's STDIN —
/// never on argv, never in an env var — so Codex writes it into its own store
/// (<c>%CODEX_HOME%\auth.json</c>, default <c>%USERPROFILE%\.codex\auth.json</c>,
/// the same home the codex provider's turns read). The key is never echoed, never
/// logged and never persisted by the harness; the result is RE-DERIVED by
/// re-probing <c>codex login status</c>, never reflected from the input.
/// </summary>
public sealed class CodexCredentialsService
{
    private readonly CodexAccountService _account;
    private readonly Logger _logger;
    private const int TimeoutMs = 15000;

    public CodexCredentialsService(CodexAccountService account, Logger logger)
    {
        _account = account;
        _logger = logger;
    }

    /// <summary>Typed outcome. The key never appears here.</summary>
    public sealed record SetKeyResult(bool Ok, string? Method, string? Home, string? Error);

    public SetKeyResult SetApiKey(string? apiKey)
    {
        apiKey = apiKey?.Trim();
        if (string.IsNullOrEmpty(apiKey))
            return new SetKeyResult(false, null, CodexAccountService.CodexHome(), "No API key provided");

        var codex = ProcessProbe.ResolveOnPath("codex");
        if (codex is null)
        {
            _logger.Error("[CODEX-CRED] codex not found on PATH");
            return new SetKeyResult(false, null, CodexAccountService.CodexHome(), "codex not found on PATH");
        }

        // The key is the stdin payload only (codex-cli 0.153.4: "Read the API key
        // from stdin"). A trailing newline mirrors `printenv KEY | codex login ...`.
        var login = ProcessProbe.Run(codex, new[] { "login", "--with-api-key" }, TimeoutMs, stdin: apiKey + "\n");
        if (login.ExitCode != 0)
        {
            var reason = Scrub(
                login.TimedOut ? "codex login timed out" : FirstLine(login.StdErr) ?? FirstLine(login.StdOut) ?? "codex rejected the key", apiKey);
            _logger.Error($"[CODEX-CRED] login failed: {reason}");
            return new SetKeyResult(false, null, CodexAccountService.CodexHome(), reason);
        }

        var status = _account.Refresh();
        if (!status.Authenticated)
        {
            _logger.Error("[CODEX-CRED] login exited 0 but `codex login status` still reports not logged in");
            return new SetKeyResult(false, null, status.Home, status.Error ?? "codex still reports not logged in");
        }
        _logger.Info($"[CODEX-CRED] credential established ({status.Method})");
        return new SetKeyResult(true, status.Method, status.Home, null);
    }

    private static string Scrub(string text, string secret)
        => string.IsNullOrEmpty(secret) ? text : text.Replace(secret, "***");

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
