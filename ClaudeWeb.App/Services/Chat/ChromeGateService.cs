using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// Claude-in-Chrome integration state (openspec claude-in-chrome).
///
/// Two jobs:
///  1. The GLOBAL single-holder gate for browser-enabled runs. The extension's
///     native-messaging pipe has one holder per Chrome, so at most one
///     browser-enabled CLI run may exist at a time — across ALL repos and lanes,
///     on top of the per-(repo,lane) single-flight in RunSessionService. A
///     conflicting request is rejected immediately (never queued silently).
///  2. Cheap host readiness checks for GET /api/chrome/status: is the extension's
///     native-messaging host registered, and does the installed CLI know
///     <c>--chrome</c>? Both are host-side signals only — we deliberately never
///     spawn a probe session, because probing would hold the very pipe we are
///     reporting on.
/// </summary>
public class ChromeGateService
{
    /// <summary>Registry key name the Claude Code CLI registers for Chrome
    /// native messaging (verified on this host, CLI 2.1.235).</summary>
    private const string NativeHostName = "com.anthropic.claude_code_browser_extension";

    private readonly Logger _logger;
    private readonly object _lock = new();
    private string? _holderRepo;
    private string? _holderRepoId;

    // claude --help is slow-ish (node startup) and its answer only changes on a
    // CLI upgrade — check once per harness lifetime.
    private bool? _cliSupported;

    public ChromeGateService(Logger logger)
    {
        _logger = logger;
    }

    /// <summary>Whether a chat turn is a browser turn (openspec chrome-per-agent-mode):
    /// the agent's OWN request, on the builder lane, on the Claude engine. A turn that
    /// does not ask for the browser is never one — whatever other agents hold — so it
    /// must never be put through the gate.</summary>
    public static bool IsBrowserTurn(bool? requested, string? lane, string? provider) =>
        requested == true
        && string.Equals(lane, "builder", StringComparison.Ordinal)
        && string.Equals(provider, AgentProviders.Claude, StringComparison.Ordinal);

    public bool TryAcquire(string repoName, out string? holderRepo) => TryAcquire(repoName, null, out holderRepo);

    /// <summary>Claims the browser for one run. On refusal <paramref name="holderRepo"/>
    /// names the repo whose run currently holds it.</summary>
    public bool TryAcquire(string repoName, string? repoId, out string? holderRepo)
    {
        lock (_lock)
        {
            if (_holderRepo is not null)
            {
                holderRepo = _holderRepo;
                return false;
            }
            _holderRepo = string.IsNullOrWhiteSpace(repoName) ? "(unknown repo)" : repoName;
            _holderRepoId = repoId;
            holderRepo = null;
            _logger.Info($"[CHROME] Browser acquired by \"{_holderRepo}\"");
            return true;
        }
    }

    /// <summary>Releases the browser after a run ends (success, error, or stop).
    /// Safe to call when nothing is held.</summary>
    public void Release()
    {
        lock (_lock)
        {
            if (_holderRepo is null) return;
            _logger.Info($"[CHROME] Browser released by \"{_holderRepo}\"");
            _holderRepo = null;
            _holderRepoId = null;
        }
    }

    public (bool Busy, string? Repo) BusyState()
    {
        lock (_lock) return (_holderRepo is not null, _holderRepo);
    }

    /// <summary>The holder with its repo id, so a UI can tell "held by me" from "held
    /// by another agent" (openspec chrome-per-agent-mode).</summary>
    public (bool Busy, string? Repo, string? RepoId) HolderState()
    {
        lock (_lock) return (_holderRepo is not null, _holderRepo, _holderRepoId);
    }

    /// <summary>The Claude in Chrome extension registers a native-messaging host in
    /// the registry on install — its presence is the cheapest honest signal that the
    /// extension side of the bridge exists on this host.</summary>
    public bool HostRegistered()
    {
        if (!OperatingSystem.IsWindows()) return false;
        try
        {
            foreach (var root in new[] { Microsoft.Win32.Registry.CurrentUser, Microsoft.Win32.Registry.LocalMachine })
            {
                using var key = root.OpenSubKey($@"Software\Google\Chrome\NativeMessagingHosts\{NativeHostName}");
                if (key is not null) return true;
            }
        }
        catch { /* registry unavailable — report not registered */ }
        return false;
    }

    /// <summary>True when the installed CLI's help lists <c>--chrome</c>. Cached
    /// for the harness lifetime (changes only on a CLI upgrade).</summary>
    public bool CliSupported()
    {
        if (_cliSupported is bool cached) return cached;

        var cli = Accounts.ProcessProbe.ResolveOnPath("claude");
        var supported = false;
        if (cli is not null)
        {
            var result = Accounts.ProcessProbe.Run(cli, new[] { "--help" }, timeoutMs: 15000);
            supported = !result.TimedOut && result.StdOut.Contains("--chrome");
        }
        _cliSupported = supported;
        _logger.Info($"[CHROME] CLI --chrome support: {supported}");
        return supported;
    }
}
