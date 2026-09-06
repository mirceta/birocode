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
        bool CodexInstalled, bool Authenticated, string? Method, string? Version, string? Home, string? Error);

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
        if (parsed.Authenticated)
            _logger.Info($"[CODEX-ACCT] {parsed.Method} ({versionText ?? "?"})");
        return parsed with { Version = versionText, Home = home };
    }

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
