using System.Diagnostics;
using System.Text;
using System.Text.Json;
using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Logging;
using static ClaudeWeb.Services.Chat.ChromePreflightRules;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// Is this machine ready to use Claude for Chrome from the harness? (openspec
/// chrome-readiness-preflight). Gathers the facts of the chain and hands them to
/// <see cref="ChromePreflightRules"/>.
///
/// Two kinds of work, kept apart on purpose (PR #141: a polled request must never spawn a
/// process):
///  - the STATIC facts — registry, Chrome's profile files, the process list, the pipe list —
///    are read without starting any process, cached for <see cref="StaticTtl"/> and renewed by
///    one background pass at a time; the polled endpoint only ever returns the cached snapshot;
///  - the LIVE PROBE — one short real agent turn with <c>--chrome</c> — runs only when the
///    Operator presses Re-run, under the same single-holder gate as a browser turn.
/// </summary>
public class ChromePreflightService
{
    public static readonly TimeSpan StaticTtl = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(150);
    public const string ProbeHolder = "the Chrome readiness probe";

    private readonly ChromeGateService _gate;
    private readonly ClaudeAccountService _account;
    private readonly Logger _logger;
    private readonly object _lock = new();
    private StaticFacts? _static;
    private long _staticAt;
    private bool _refreshing;
    private ProbeResult? _probe;
    private bool _probeRunning;
    private string? _cliVersion;   // changes only on a CLI upgrade — read once per harness lifetime

    public ChromePreflightService(ChromeGateService gate, ClaudeAccountService account, Logger logger)
    {
        _gate = gate;
        _account = account;
        _logger = logger;
    }

    private sealed record StaticFacts(bool Windows, string? ChromePath, string? ChromeVersion, int ChromeProcesses, bool ProfilesReadable,
        IReadOnlyList<ProfileFact> Profiles, HostFact Host, bool? BridgePipe, string PipeName, string? CliPath, string? CliVersion,
        bool CliSupportsChrome, IReadOnlyList<string> AuthOverrides, bool ApiKeyHelper);

    public sealed record Snapshot(string Overall, IReadOnlyList<Check> Checks, long At, long StaticAt, bool ProbeRunning, ProbeResult? Probe);

    /// <summary>The current verdict from the cached facts — never a process spawn, never a
    /// wait beyond the very first read. A stale cache starts one background refresh.</summary>
    public Snapshot Current()
    {
        StaticFacts? cached; bool start;
        var now = Now();
        lock (_lock)
        {
            cached = _static;
            start = cached is not null && now - _staticAt > StaticTtl.TotalMilliseconds && !_refreshing;
            if (start) _refreshing = true;
        }
        if (cached is null)
        {
            // Never read yet: the first pass asks the CLI for --help and --version once (two
            // process spawns, a second or two). Not on the request thread — the section says
            // "checking" until the background pass lands.
            lock (_lock) { start = !_refreshing; if (start) _refreshing = true; }
        }
        if (start)
            _ = Task.Factory.StartNew(() => { try { RefreshStatic(); } catch (Exception ex) { _logger.Error($"[CHROME] preflight static pass failed: {ex.Message}"); } finally { lock (_lock) _refreshing = false; } },
                CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
        return cached is null ? new Snapshot("checking", Array.Empty<Check>(), now, 0, false, null) : Build(cached);
    }

    /// <summary>Re-read the static facts now and start the live probe (unless one is running or
    /// a real browser turn holds the browser). Returns at once; the probe's result appears in
    /// <see cref="Current"/> when it ends.</summary>
    public (Snapshot Snapshot, bool ProbeStarted, string? NotStartedWhy) Rerun()
    {
        var facts = RefreshStatic();   // an explicit act: re-read now, on this request
        string? why = null; var started = false;
        lock (_lock)
        {
            if (_probeRunning) why = "a probe is already running";
            else if (facts.CliPath is null) why = "the claude CLI is not installed";
        }
        if (why is null)
        {
            if (!_gate.TryAcquire(ProbeHolder, out var holder)) why = $"the browser is held by a browser turn of \"{holder}\" — the probe would collide with it";
            else
            {
                lock (_lock) _probeRunning = true;
                started = true;
                _ = Task.Factory.StartNew(RunProbe, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
            }
        }
        return (Build(facts), started, why);
    }

    private Snapshot Build(StaticFacts s)
    {
        var acct = _account.Get();
        var (busy, holder) = _gate.BusyState();
        ProbeResult? probe; bool running; long staticAt;
        lock (_lock) { probe = _probe; running = _probeRunning; staticAt = _staticAt; }
        var holdsForProbe = busy && holder == ProbeHolder;
        var facts = new Facts(s.Windows, s.ChromePath, s.ChromeVersion, s.ChromeProcesses, s.ProfilesReadable, s.Profiles, s.Host, s.BridgePipe, s.PipeName,
            s.CliPath, s.CliVersion, s.CliSupportsChrome, acct.ClaudeInstalled && acct.Authenticated, acct.Plan, acct.Account, s.AuthOverrides, s.ApiKeyHelper,
            busy && !holdsForProbe, holdsForProbe ? null : holder, ChromeTurnObserver.Current(), probe, running, Now());
        var checks = Evaluate(facts);
        return new Snapshot(Overall(checks), checks, facts.Now, staticAt, running, probe);
    }

    // ---- the static facts: no process is started here --------------------------------------

    private StaticFacts RefreshStatic()
    {
        var sw = Stopwatch.StartNew();
        var windows = OperatingSystem.IsWindows();
        string? chromePath = null, chromeVersion = null; var procs = 0; var readable = false;
        IReadOnlyList<ProfileFact> profiles = Array.Empty<ProfileFact>();
        var host = new HostFact(false, null, false, null, false, null, false, false, null);
        bool? pipe = null;
        var pipeName = BridgePipeName(Environment.UserName);
        if (windows)
        {
            try { (chromePath, chromeVersion) = FindChrome(); } catch { /* reported as not found */ }
            try { foreach (var p in Process.GetProcessesByName("chrome")) { procs++; p.Dispose(); } } catch { /* 0 */ }
            try { (readable, profiles) = ReadProfiles(); } catch (Exception ex) { _logger.Info($"[CHROME] preflight: profiles unreadable: {ex.GetType().Name}"); }
            try { host = ReadHost(); } catch (Exception ex) { host = host with { Error = "The native host registration could not be read: " + ex.Message }; }
            try { pipe = Directory.GetFiles(@"\\.\pipe\").Any(p => p.EndsWith("\\" + pipeName, StringComparison.OrdinalIgnoreCase)); } catch { pipe = null; }
        }
        var cli = ProcessProbe.ResolveOnPath("claude");
        var supports = cli is not null && _gate.CliSupported();                 // cached for the harness lifetime
        if (cli is not null && _cliVersion is null)
        {
            var v = ProcessProbe.Run(cli, new[] { "--version" }, timeoutMs: 15000);   // once per harness lifetime
            _cliVersion = v.TimedOut || v.ExitCode != 0 ? "" : v.StdOut.Trim().Split(' ')[0];
        }
        var overrides = AuthOverrideVars.Where(n => !string.IsNullOrEmpty(Environment.GetEnvironmentVariable(n))).ToList();
        var facts = new StaticFacts(windows, chromePath, chromeVersion, procs, readable, profiles, host, pipe, pipeName, cli,
            string.IsNullOrEmpty(_cliVersion) ? null : _cliVersion, supports, overrides, HasApiKeyHelper());
        lock (_lock) { _static = facts; _staticAt = Now(); }
        if (sw.ElapsedMilliseconds > 2000) _logger.Info($"[CHROME] preflight static pass took {sw.ElapsedMilliseconds} ms");
        return facts;
    }

    private static (string? Path, string? Version) FindChrome()
    {
        var roots = new[]
        {
            Environment.GetEnvironmentVariable("ProgramFiles"), Environment.GetEnvironmentVariable("ProgramFiles(x86)"),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        };
        foreach (var root in roots.Where(r => !string.IsNullOrEmpty(r)))
        {
            var exe = Path.Combine(root!, "Google", "Chrome", "Application", "chrome.exe");
            if (File.Exists(exe)) return (exe, FileVersionInfo.GetVersionInfo(exe).ProductVersion);
        }
        return (null, null);
    }

    // Chrome's own bookkeeping: "Local State" names the profiles and which were last open;
    // each profile's Extensions/<id>/<version>/ folder and its (Secure) Preferences entry say
    // whether the extension is there and enabled. Only that one extension's entry is read.
    private static (bool Readable, IReadOnlyList<ProfileFact> Profiles) ReadProfiles()
    {
        var userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "User Data");
        var localState = Path.Combine(userData, "Local State");
        if (!File.Exists(localState)) return (false, Array.Empty<ProfileFact>());
        var list = new List<ProfileFact>();
        using var doc = JsonDocument.Parse(ReadShared(localState));
        if (!doc.RootElement.TryGetProperty("profile", out var profile)) return (true, list);
        var active = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (profile.TryGetProperty("last_active_profiles", out var lap) && lap.ValueKind == JsonValueKind.Array)
            foreach (var a in lap.EnumerateArray()) if (a.GetString() is { } s) active.Add(s);
        if (active.Count == 0 && profile.TryGetProperty("last_used", out var lu) && lu.GetString() is { } used) active.Add(used);
        if (!profile.TryGetProperty("info_cache", out var cache) || cache.ValueKind != JsonValueKind.Object) return (true, list);
        foreach (var p in cache.EnumerateObject())
        {
            var dir = Path.Combine(userData, p.Name);
            var name = p.Value.TryGetProperty("name", out var n) ? n.GetString() ?? p.Name : p.Name;
            string? version = null;
            var extDir = Path.Combine(dir, "Extensions", ExtensionId);
            if (Directory.Exists(extDir))
                version = Directory.GetDirectories(extDir).Select(Path.GetFileName).Where(v => v is not null)
                    .OrderByDescending(v => VersionParts(v), Comparer<int[]>.Create(CompareParts)).FirstOrDefault();
            bool? enabled = null; string? why = null;
            if (version is not null)
                foreach (var file in new[] { "Secure Preferences", "Preferences" })
                {
                    var path = Path.Combine(dir, file);
                    if (!File.Exists(path)) continue;
                    try
                    {
                        using var prefs = JsonDocument.Parse(ReadShared(path));
                        if (ExtensionEntry(prefs.RootElement) is { } entry) { enabled = entry.Enabled; why = entry.Why; break; }
                    }
                    catch { /* a half-written file: try the other one, else unknown */ }
                }
            list.Add(new ProfileFact(p.Name, name, active.Contains(p.Name), version, enabled, why));
        }
        return (true, list);
    }

    private static int CompareParts(int[]? a, int[]? b)
    {
        a ??= Array.Empty<int>(); b ??= Array.Empty<int>();
        for (var i = 0; i < Math.Max(a.Length, b.Length); i++)
        {
            var x = i < a.Length ? a[i] : 0; var y = i < b.Length ? b[i] : 0;
            if (x != y) return x.CompareTo(y);
        }
        return 0;
    }

    // Chrome keeps these files open; read them without asking for an exclusive handle.
    private static byte[] ReadShared(string path)
    {
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var ms = new MemoryStream();
        fs.CopyTo(ms);
        return ms.ToArray();
    }

    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
    private static HostFact ReadHost()
    {
        string? manifestPath = null;
        foreach (var root in new[] { Microsoft.Win32.Registry.CurrentUser, Microsoft.Win32.Registry.LocalMachine })
        {
            using var key = root.OpenSubKey($@"Software\Google\Chrome\NativeMessagingHosts\{NativeHostName}");
            if (key?.GetValue(null) is string s && !string.IsNullOrWhiteSpace(s)) { manifestPath = s; break; }
        }
        if (manifestPath is null) return new HostFact(false, null, false, null, false, null, false, false, null);
        if (!File.Exists(manifestPath)) return new HostFact(true, manifestPath, false, null, false, null, false, false, null);
        if (ParseHostManifest(File.ReadAllText(manifestPath)) is not { } m)
            return new HostFact(true, manifestPath, true, null, false, null, false, false, $"The manifest {manifestPath} is not valid JSON.");
        var target = m.Path;
        var targetExists = target is not null && File.Exists(target);
        string? cli = null; var cliExists = targetExists;
        if (targetExists && (target!.EndsWith(".bat", StringComparison.OrdinalIgnoreCase) || target.EndsWith(".cmd", StringComparison.OrdinalIgnoreCase)))
        {
            cli = WrapperTarget(File.ReadAllText(target));
            cliExists = cli is null || File.Exists(cli);   // an unrecognised wrapper is not judged
        }
        return new HostFact(true, manifestPath, true, target, targetExists, cli, cliExists, m.AllowsExtension, null);
    }

    private static bool HasApiKeyHelper()
    {
        try
        {
            var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "settings.json");
            if (!File.Exists(path)) return false;
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            return doc.RootElement.TryGetProperty("apiKeyHelper", out var h) && h.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(h.GetString());
        }
        catch { return false; }
    }

    // ---- the live probe: one real agent turn ----------------------------------------------

    public const string ProbePrompt =
        "Call the tool mcp__claude-in-chrome__list_connected_browsers exactly once. Then call mcp__claude-in-chrome__tabs_context_mcp exactly once " +
        "with an empty input object. Then reply with the single word DONE. Call no other browser tool.";

    private void RunProbe()
    {
        var sw = Stopwatch.StartNew();
        ProbeResult result;
        try
        {
            // The same launch an agent's browser turn gets (ClaudeCliAdapter): the resolved CLI,
            // --chrome, ANTHROPIC_API_KEY removed, everything else inherited. Two read-only tools
            // are allowed — list the connected browsers, read this session's (empty) tab group —
            // so the probe opens no tab and touches no page. A scratch working directory and
            // --no-session-persistence keep it out of every repo and every transcript.
            var work = Path.Combine(Path.GetTempPath(), "claudeweb-chrome-preflight");
            Directory.CreateDirectory(work);
            var psi = new ProcessStartInfo
            {
                FileName = ClaudeCliAdapter.ClaudeExecutable,
                WorkingDirectory = work,
                RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = true,
                UseShellExecute = false, CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
            };
            foreach (var a in new[]
            {
                "-p", ProbePrompt, "--chrome", "--model", "haiku", "--max-turns", "5", "--output-format", "stream-json", "--verbose",
                "--no-session-persistence", "--allowedTools", $"{ToolPrefix}list_connected_browsers,{ToolPrefix}tabs_context_mcp",
            }) psi.ArgumentList.Add(a);
            psi.EnvironmentVariables.Remove(StrippedAtSpawn);
            using var process = new Process { StartInfo = psi };
            process.Start();
            process.StandardInput.Close();
            var outTask = process.StandardOutput.ReadToEndAsync();
            var errTask = process.StandardError.ReadToEndAsync();
            var timedOut = !process.WaitForExit((int)ProbeTimeout.TotalMilliseconds);
            if (timedOut) { try { process.Kill(entireProcessTree: true); } catch { /* already gone */ } }
            else process.WaitForExit();
            var lines = (timedOut ? "" : outTask.Result ?? "").Split('\n');
            result = ParseProbe(lines, Now(), sw.ElapsedMilliseconds, timedOut);
        }
        catch (Exception ex)
        {
            result = ParseProbe(Array.Empty<string>(), Now(), sw.ElapsedMilliseconds, launchError: ex.Message);
        }
        finally
        {
            _gate.Release();
        }
        lock (_lock) { _probe = result; _probeRunning = false; }
        _logger.Info($"[CHROME] preflight live probe: {result.Outcome} in {result.TookMs} ms — {result.Detail}");
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}

/// <summary>
/// What real agent turns saw (openspec chrome-readiness-preflight): the adapter reports every
/// claude-in-chrome tool call and its result as it streams past, and the preflight shows the
/// last answer and the last CONNECTION failure — evidence that costs nothing and is exactly
/// the "it is on but it does not work" moment. Page-level errors (a missing element, a frozen
/// tab) are not connection failures and are not recorded as such.
/// </summary>
public static class ChromeTurnObserver
{
    private static readonly object Gate = new();
    private static readonly Dictionary<string, string> Pending = new(StringComparer.Ordinal);
    private static long? _lastOkAt, _lastErrorAt;
    private static string? _lastError, _lastErrorTool;

    public static void ToolStarted(string id, string name)
    {
        if (string.IsNullOrEmpty(id) || !name.StartsWith(ToolPrefix, StringComparison.Ordinal)) return;
        lock (Gate)
        {
            if (Pending.Count > 500) Pending.Clear();   // results that never came back
            Pending[id] = name[ToolPrefix.Length..];
        }
    }

    public static void ToolFinished(string id, bool ok, string? text)
    {
        lock (Gate)
        {
            if (!Pending.Remove(id, out var tool)) return;
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (IsConnectionError(text))
            {
                _lastErrorAt = now; _lastErrorTool = tool;
                var t = (text ?? "").Replace("\r", " ").Replace("\n", " ").Trim();
                _lastError = t.Length > 200 ? t[..200] + "…" : t;
            }
            else if (ok) _lastOkAt = now;
        }
    }

    public static TurnFact Current() { lock (Gate) return new TurnFact(_lastOkAt, _lastErrorAt, _lastError, _lastErrorTool); }

    internal static void ResetForTests() { lock (Gate) { Pending.Clear(); _lastOkAt = _lastErrorAt = null; _lastError = _lastErrorTool = null; } }
}
