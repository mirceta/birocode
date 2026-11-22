using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.StructuredAsk;

namespace ClaudeWeb.Services.LocalApps;

/// <summary>
/// Autostart + sentry for THIS machine's registered local apps (fleet task f88f97fe, openspec
/// local-apps-autostart-sentry). Only apps flagged in the <see cref="AutostartStore"/> are ever started or probed;
/// every other registered app is listed with its live port state and left alone.
///
/// <list type="bullet">
/// <item><b>Apply</b> (boot, "apply now"): flagged apps in order (order, then name); one that does not answer is
/// launched detached with its start command (the entry's own, else the discovery cache's) in its folder, then the
/// entry's delay is waited before the next. A manual apply clears "failing".</item>
/// <item><b>Check</b> (every N minutes): probe = the health URL (expected status, else 2xx/3xx), else the TCP port.
/// A failure gets ONE restart attempt (stop the listener if any, launch), unless the last automatic restart was
/// within the cooldown; a failure after that attempt marks the app <c>failing</c> — no further automatic restarts
/// until it answers again or the Operator applies. No loops.</item>
/// </list>
/// The runtime (port, launch, HTTP, clock) comes in through <see cref="Env"/>, so the state machine is unit-tested.
/// </summary>
public sealed class LocalAppSentry
{
    public sealed record RepoEntry(RepoFacts Repo, IReadOnlyList<RepositoryRegistry.LocalAppInfo> Apps);

    public sealed class Env
    {
        public required Func<IReadOnlyList<RepoEntry>> Repos { get; init; }
        public required Func<string, CachedDiscovery?> Discovery { get; init; }
        public required ILocalAppOps Ops { get; init; }
        /// <summary>GET the URL; null when it answered with the expected status (null = any 2xx/3xx), else the error.</summary>
        public required Func<string, int?, CancellationToken, Task<string?>> ProbeHttp { get; init; }
        public required Func<long> Now { get; init; }
        public required Func<TimeSpan, CancellationToken, Task> Delay { get; init; }
        public required Action<string> Log { get; init; }
        public string Machine { get; init; } = System.Environment.MachineName;
        /// <summary>When set, an apply that launched something is followed by one sentry pass this much later (so the
        /// tab shows up / failing without waiting for the next interval). Null in tests.</summary>
        public TimeSpan? FollowUpCheck { get; init; }
        public int HarnessPort { get; init; } = 5099;
    }

    /// <summary>The sentry's memory of one flagged app (in memory: a harness restart starts from "unknown").</summary>
    public sealed class AppState
    {
        public string State { get; set; } = "unknown";   // unknown | up | starting | down | failing
        public long? LastCheckAt { get; set; }
        public string? LastError { get; set; }
        public long? LastStartAt { get; set; }
        public string? LastStartResult { get; set; }
        public string? LastStartTrigger { get; set; }
        public long? LastRestartAt { get; set; }
        public int RestartsSinceUp { get; set; }
        /// <summary>Answered at least once since the last launch: from then on a failure is a crash, not a slow start.</summary>
        public bool SeenUpSinceStart { get; set; }
    }

    public sealed record Row(
        string RepoId, string Repo, string AppId, string Name, string Kind, int Port, string? Url,
        string? StartCommand, string? StartSource, string? Folder, bool Listening,
        AutostartFlag? Flag, string State, long? LastCheckAt, string? LastError,
        long? LastStartAt, string? LastStartResult, string? LastStartTrigger, int RestartsSinceUp);

    public sealed record Overview(string Machine, long Version, string? From, SentrySettings Settings,
        long? LastCheckAt, long? LastApplyAt, IReadOnlyList<Row> Rows)
    {
        public int Flagged => Rows.Count(r => r.Flag?.Autostart == true);
        public int Up => Rows.Count(r => r.Flag?.Autostart == true && r.State == "up");
        public int Down => Rows.Count(r => r.Flag?.Autostart == true && r.State == "down");
        public int Failing => Rows.Count(r => r.Flag?.Autostart == true && r.State == "failing");
        /// <summary>Flagged apps the Operator should look at: down or failing (the tab's red badge).</summary>
        public int Attention => Down + Failing;
    }

    /// <summary>How long a just-launched app may take to answer before the sentry judges it (a slow
    /// <c>dotnet run</c> must not be "restarted" into a second instance).</summary>
    public static readonly long StartGraceMs =
        (long.TryParse(System.Environment.GetEnvironmentVariable("CLAUDEWEB_AUTOSTART_GRACE_SEC"), out var g) && g >= 0 ? g : 120) * 1000;

    private readonly Env _env;
    private readonly AutostartStore _store;
    private readonly Dictionary<string, AppState> _states = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim _run = new(1, 1);
    private readonly object _gate = new();
    private long? _lastCheckAt, _lastApplyAt;

    public LocalAppSentry(Env env, AutostartStore store) { _env = env; _store = store; }

    public AutostartStore Store => _store;

    private sealed record Target(RepoFacts Repo, LocalAppCatalog.App App, AutostartFlag? Flag, string? Command, string? Source, string? Folder);

    private List<Target> Targets()
    {
        var slice = _store.Get();
        var flags = slice.Flags.ToDictionary(f => f.Key, StringComparer.OrdinalIgnoreCase);
        var list = new List<Target>();
        foreach (var r in _env.Repos())
        {
            var apps = LocalAppCatalog.Build(r.Repo, r.Apps, SafeDiscovery(r.Repo.Id), null, _env.HarnessPort);
            foreach (var a in apps.Where(a => a.Registered))
            {
                flags.TryGetValue(AutostartFlag.KeyOf(r.Repo.Id, a.Id), out var f);
                var own = !string.IsNullOrWhiteSpace(f?.StartCommand);
                var cmd = own ? f!.StartCommand : a.StartCommand;
                var folder = !string.IsNullOrWhiteSpace(f?.Folder) ? LocalAppCatalog.FolderOf(r.Repo, f!.Folder)
                    : own ? (a.Folder ?? LocalAppCatalog.FolderOf(r.Repo, null)) : a.Folder;
                list.Add(new Target(r.Repo, a, f, cmd, cmd is null ? null : own ? "entry" : "discovered", folder));
            }
        }
        return list;
    }

    private CachedDiscovery? SafeDiscovery(string repoId) { try { return _env.Discovery(repoId); } catch { return null; } }

    private AppState StateOf(string key) { lock (_gate) return _states.TryGetValue(key, out var s) ? s : _states[key] = new AppState(); }

    /// <summary>Every registered app of this machine with its entry and its sentry state.</summary>
    public Overview Snapshot()
    {
        var slice = _store.Get();
        var rows = Targets().Select(t =>
        {
            var key = AutostartFlag.KeyOf(t.Repo.Id, t.App.Id);
            var flagged = t.Flag?.Autostart == true;
            AppState? s; lock (_gate) _states.TryGetValue(key, out s);
            var listening = t.App.Kind == LocalAppCatalog.KindRepo && t.App.Port > 0 && SafeListening(t.App.Port);
            var state = t.App.Kind == LocalAppCatalog.KindHarness ? "always-on" : flagged ? (s?.State ?? "unknown") : (listening ? "running" : "stopped");
            return new Row(t.Repo.Id, t.Repo.Name, t.App.Id, t.App.Name, t.App.Kind, t.App.Port, t.App.Kind == LocalAppCatalog.KindRepo ? t.App.Url : t.App.ServedAt,
                t.Command, t.Source, t.Folder, listening, t.Flag, state, s?.LastCheckAt, s?.LastError, s?.LastStartAt, s?.LastStartResult, s?.LastStartTrigger, s?.RestartsSinceUp ?? 0);
        }).ToList();
        long? lc, la; lock (_gate) { lc = _lastCheckAt; la = _lastApplyAt; }
        return new Overview(_env.Machine, slice.Version, slice.From, slice.Settings, lc, la, rows);
    }

    private bool SafeListening(int port) { try { return _env.Ops.IsListening(port); } catch { return false; } }

    private List<Target> Flagged() => Targets()
        .Where(t => t.Flag?.Autostart == true && t.App.Kind == LocalAppCatalog.KindRepo)
        .OrderBy(t => t.Flag!.Order).ThenBy(t => t.App.Name, StringComparer.OrdinalIgnoreCase).ToList();

    private async Task<string?> Probe(Target t, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(t.Flag?.HealthUrl))
        {
            try { return await _env.ProbeHttp(t.Flag!.HealthUrl!, t.Flag.ExpectStatus, ct); }
            catch (Exception ex) { return ex.Message; }
        }
        if (t.App.Port > 0) return SafeListening(t.App.Port) ? null : $"nothing listening on :{t.App.Port}";
        return "no health URL and no port to probe";
    }

    /// <summary>Launch one app (stopping a hung listener first when <paramref name="replace"/>). Returns the result line.</summary>
    private string Start(Target t, AppState s, string trigger, bool replace)
    {
        var now = _env.Now();
        s.LastStartAt = now; s.LastStartTrigger = trigger; s.SeenUpSinceStart = false;
        string result;
        if (t.Command is null) result = "no-command: no start command (set one on the entry, or run Discover on the repo)";
        else if (t.Folder is null || !Directory.Exists(t.Folder)) result = $"no-folder: {t.Folder ?? "(outside the repo)"} does not exist";
        else
        {
            string? stopNote = null;
            if (replace && t.App.Port > 0 && SafeListening(t.App.Port))
            {
                var (spid, serr) = _env.Ops.Stop(t.App.Port);
                if (serr is not null) { s.LastStartResult = $"stop-failed: {serr}"; Log(t, trigger, s.LastStartResult); return s.LastStartResult; }
                stopNote = $"stopped hung PID {spid}; ";
                if (!_env.Ops.WaitForPortFree(t.App.Port, TimeSpan.FromSeconds(10))) { s.LastStartResult = $"port-busy: :{t.App.Port} did not free after stopping PID {spid}"; Log(t, trigger, s.LastStartResult); return s.LastStartResult; }
            }
            var (pid, err) = _env.Ops.Launch(t.Command, t.Folder);
            result = err is not null ? $"launch-failed: {err}" : $"{stopNote}launched pid {pid}: {t.Command}";
        }
        s.LastStartResult = result;
        Log(t, trigger, result);
        return result;
    }

    private void Log(Target t, string trigger, string what) => _env.Log($"[AUTOSTART] {trigger} {t.Repo.Name}/{t.App.Id} (:{t.App.Port}): {what}");

    /// <summary>Boot / "apply now": start every flagged app that does not answer, in order, with its delay.</summary>
    public async Task<Overview> ApplyAsync(string trigger, CancellationToken ct = default)
    {
        await _run.WaitAsync(ct);
        try
        {
            lock (_gate) _lastApplyAt = _env.Now();
            var targets = Flagged();
            var anyLaunched = false;
            _env.Log($"[AUTOSTART] {trigger}: {targets.Count} flagged app(s) on {_env.Machine}");
            foreach (var t in targets)
            {
                ct.ThrowIfCancellationRequested();
                var s = StateOf(AutostartFlag.KeyOf(t.Repo.Id, t.App.Id));
                var err = await Probe(t, ct);
                s.LastCheckAt = _env.Now();
                if (err is null) { s.State = "up"; s.LastError = null; s.RestartsSinceUp = 0; s.SeenUpSinceStart = true; continue; }
                s.LastError = err;
                // A manual apply is the Operator's word: "failing" is cleared and the app gets a fresh attempt.
                s.RestartsSinceUp = 0;
                var listening = t.App.Port > 0 && SafeListening(t.App.Port);
                if (listening)
                {
                    // The port answers but the health URL does not: apply never kills a running app; the sentry may.
                    s.State = "down";
                    s.LastStartResult = "not started: the port is taken (the health check failed — the sentry decides about a restart)";
                    continue;
                }
                var result = Start(t, s, trigger, replace: false);
                var launched = result.StartsWith("launched", StringComparison.Ordinal);
                s.State = launched ? "starting" : "down";
                if (launched) anyLaunched = true;
                if (launched && t.Flag!.DelaySec > 0)
                    await _env.Delay(TimeSpan.FromSeconds(t.Flag.DelaySec), ct);
            }
            if (anyLaunched && _env.FollowUpCheck is { } after)
                _ = Task.Run(async () => { try { await _env.Delay(after, CancellationToken.None); await CheckAsync(trigger + " follow-up"); } catch (Exception ex) { _env.Log($"[AUTOSTART] follow-up check failed: {ex.Message}"); } });
            return Snapshot();
        }
        finally { _run.Release(); }
    }

    /// <summary>One sentry pass over the flagged apps (see the class summary for the restart rule).</summary>
    public async Task<Overview> CheckAsync(string trigger, CancellationToken ct = default)
    {
        await _run.WaitAsync(ct);
        try
        {
            var now = _env.Now();
            lock (_gate) _lastCheckAt = now;
            var cooldownMs = _store.Get().Settings.CooldownMin * 60_000L;
            foreach (var t in Flagged())
            {
                ct.ThrowIfCancellationRequested();
                var s = StateOf(AutostartFlag.KeyOf(t.Repo.Id, t.App.Id));
                var err = await Probe(t, ct);
                s.LastCheckAt = _env.Now();
                if (err is null)
                {
                    if (s.State is "down" or "failing") _env.Log($"[AUTOSTART] {trigger} {t.Repo.Name}/{t.App.Id}: up again");
                    s.State = "up"; s.LastError = null; s.RestartsSinceUp = 0; s.SeenUpSinceStart = true;
                    continue;
                }
                s.LastError = err;
                if (s.State == "failing") continue;                    // already surfaced; never loop
                if (!s.SeenUpSinceStart && s.LastStartAt is { } started && now - started < StartGraceMs && (s.LastStartResult ?? "").Contains("launched", StringComparison.Ordinal))
                { s.State = "starting"; continue; }                     // launched moments ago: give it time
                var cooled = s.LastRestartAt is null || now - s.LastRestartAt.Value >= cooldownMs;
                if (s.RestartsSinceUp >= 1 || !cooled)
                {
                    s.State = "failing";
                    _env.Log($"[AUTOSTART] {trigger} {t.Repo.Name}/{t.App.Id}: FAILING — {err} ({(s.RestartsSinceUp >= 1 ? "the restart attempt did not bring it back" : "it went down again within the cooldown")}); no further automatic restarts");
                    continue;
                }
                s.State = "down";
                s.RestartsSinceUp = 1;
                s.LastRestartAt = now;
                _env.Log($"[AUTOSTART] {trigger} {t.Repo.Name}/{t.App.Id}: down ({err}) — one restart attempt");
                if (Start(t, s, trigger + " restart", replace: true).Contains("launched pid", StringComparison.Ordinal)) s.State = "starting";
            }
            return Snapshot();
        }
        finally { _run.Release(); }
    }
}
