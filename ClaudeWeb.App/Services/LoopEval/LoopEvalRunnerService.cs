using System.ComponentModel;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.LoopEval;

/// <summary>
/// Starts and tracks live-mode loop-eval runs from the harness UI (openspec:
/// add-loop-eval-ui-runner). Spawns the COMMITTED suite's own scenario scripts
/// (<c>node tests/loop-eval/&lt;scenario&gt;.mjs --live</c>) from the harness's
/// self repo checkout — the scripts, fixtures, and assertions stay the single
/// source of truth; there is no reimplementation of scenario logic here (design
/// D1).
///
/// AUTH (design D2): each run gets a one-shot session minted straight into the
/// existing session store (tagged, revoked when the run ends — see
/// <see cref="LoopEvalRun"/>), handed to the child via LOOPEVAL_LIVE_TOKEN. The
/// operator password is never read, stored, or passed, and no credential ever
/// reaches the browser. Stale tagged sessions are swept at construction, so an
/// orphaned token dies with the next boot.
///
/// ONE RUN AT A TIME (design D3): the box has one <c>claude</c> CLI; a second
/// start while a run is active is refused (the controller maps that to 409).
///
/// NO ENABLE PATH (design D4): <see cref="Preflight"/> is read-only reporting
/// of the gate / kill switch / leftover-fixture state so the Tests tab can show
/// actionable instructions; the authoritative enforcement stays in the suite's
/// own live preflight. Nothing here flips the gate or the kill switch, ever.
/// </summary>
public sealed class LoopEvalRunnerService : IDisposable
{
    /// <summary>A startable scenario: fixed script + the cost copy the UI must
    /// show before starting (runs spend real agent turns and real minutes).</summary>
    public sealed record ScenarioDef(string Id, string Script, string Title, string Turns, string Minutes, int TimeoutMinutes);

    // Only the atomic scenarios are startable from the UI (openspec:
    // loop-eval-tests-tab-declutter) — the combined run-all.mjs sweep stays a
    // terminal/agent entry point of the committed suite, never a runner row.
    public static readonly IReadOnlyList<ScenarioDef> Scenarios = new[]
    {
        new ScenarioDef("goal", "goal.mjs", "Goal loop — implement a feature for real",
            "~2–4 real agent turns", "~2–15 min", 25),
        new ScenarioDef("queue", "queue.mjs", "Queue loop — drain 6 prompts correctly",
            "~12 real agent turns", "~10–25 min", 35),
        new ScenarioDef("briefing", "briefing.mjs", "Briefing rule — steer a real driven agent",
            "~2–4 real agent turns", "~2–15 min", 25),
    };

    private const string SuiteDir = "tests/loop-eval";
    private static readonly Regex LeftoverName = new("^loopeval-.*-live$", RegexOptions.Compiled);

    private readonly RepositoryRegistry _repos;
    private readonly AuthService _auth;
    private readonly AutopilotGate _operatorGate;
    private readonly AutopilotConfigStore _autopilotConfig;
    private readonly AppConfig _appConfig;
    private readonly Logger _logger;
    private readonly object _gate = new();
    private readonly ScenarioManifestCache _manifests = new();
    private LoopEvalRun? _run;
    private Process? _proc;

    public LoopEvalRunnerService(
        RepositoryRegistry repos, AuthService auth, AutopilotGate operatorGate,
        AutopilotConfigStore autopilotConfig, AppConfig appConfig, Logger logger)
    {
        _repos = repos;
        _auth = auth;
        _operatorGate = operatorGate;
        _autopilotConfig = autopilotConfig;
        _appConfig = appConfig;
        _logger = logger;

        // Stale-run sweep: a crashed/killed harness can leave tagged sessions
        // behind in sessions.json — revoke them all before any new run mints one.
        var swept = _auth.RevokeSessionsByTag(LoopEvalRun.SessionTag);
        if (swept > 0) _logger.Info($"[LOOPEVAL] boot sweep revoked {swept} stale runner session(s)");
    }

    /// <summary>The single-run rule: a new run may start only when there is no
    /// run yet or the last one reached a terminal state.</summary>
    public static bool CanStart(LoopEvalRun? current) => current is null || current.IsTerminal;

    private RepositoryConfig? SelfRepo() =>
        _repos.GetAll().FirstOrDefault(r => r.IsSelf) is { } info ? _repos.TryGet(info.Id) : null;

    private List<object> LeftoverRepos() =>
        _repos.GetAll().Where(r => LeftoverName.IsMatch(r.Name ?? ""))
            .Select(r => (object)new { id = r.Id, name = r.Name }).ToList();

    private List<string> LeftoverRepoNames() =>
        _repos.GetAll().Select(r => r.Name ?? "").Where(n => LeftoverName.IsMatch(n)).ToList();

    /// <summary>The manifest's own title, when it has one — the served title
    /// prefers the suite's self-description over the ScenarioDef fallback.</summary>
    private static string? TitleOf(JsonElement? manifest) =>
        manifest is { ValueKind: JsonValueKind.Object } m
        && m.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String
            ? t.GetString()
            : null;

    /// <summary>Read-only precondition report for the Tests tab (design D4):
    /// what is unmet and where the operator enables/cleans it. Never mutates.</summary>
    public object Preflight()
    {
        var self = SelfRepo();
        var suitePath = self is null ? null : Path.GetFullPath(Path.Combine(self.Path, SuiteDir));
        var suitePresent = suitePath is not null && File.Exists(Path.Combine(suitePath, "run-all.mjs"));
        LoopEvalRun? run;
        lock (_gate) run = _run;

        // Scenario self-descriptions (openspec: loop-eval-scenario-transparency):
        // the suite's own --describe output, cached per script mtime — the
        // harness never maintains its own copy of scenario knowledge. On a
        // describe failure the scenario still lists (manifestError instead).
        var manifests = suitePresent
            ? _manifests.Get(suitePath!, Scenarios.Select(s => (s.Id, s.Script)).ToList())
            : null;

        return new
        {
            gateOpen = _operatorGate.Enabled,
            killSwitchEnabled = _autopilotConfig.Get().Enabled,
            suitePresent,
            suitePath = suitePath ?? $"<self repo not registered>/{SuiteDir}",
            leftoverRepos = LeftoverRepos(),
            activeScenario = run is { IsTerminal: false } ? run.Scenario : null,
            scenarios = Scenarios.Select(s =>
            {
                var m = manifests is not null && manifests.TryGetValue(s.Id, out var e) ? e : null;
                return new
                {
                    id = s.Id,
                    title = TitleOf(m?.Manifest) ?? s.Title,
                    turns = s.Turns,
                    minutes = s.Minutes,
                    script = $"{SuiteDir}/{s.Script}",
                    manifest = m?.Manifest,
                    manifestError = m?.Error,
                };
            }),
        };
    }

    /// <summary>Current (or last) run's snapshot, null when none ever ran.</summary>
    public object Current()
    {
        LoopEvalRun? run;
        lock (_gate) run = _run;
        return new { run = run?.Snapshot() };
    }

    /// <summary>Change key + snapshot for the SSE stream: a new snapshot is sent
    /// whenever the key moves (new run, or any mutation of the current one).</summary>
    public (string Key, object Snapshot) StreamState()
    {
        LoopEvalRun? run;
        lock (_gate) run = _run;
        return (run is null ? "none" : $"{run.RunId}:{run.Rev}", new { run = run?.Snapshot() });
    }

    /// <summary>Starts a scenario. Returns the HTTP status + body the controller
    /// relays: 200 with the new run, 409 with the active run, 400 for an unknown
    /// scenario or a checkout without the suite, 500 when node can't launch.</summary>
    public (int Status, object Body) Start(string? scenarioId)
    {
        var def = Scenarios.FirstOrDefault(s => string.Equals(s.Id, scenarioId, StringComparison.OrdinalIgnoreCase));
        if (def is null)
            return (400, new { error = $"unknown scenario '{scenarioId}' — expected one of: {string.Join(", ", Scenarios.Select(s => s.Id))}" });

        var self = SelfRepo();
        if (self is null)
            return (400, new { error = "the harness's own repo is not registered, so the eval suite can't be located — E2E evals are a Self-Development feature (the opened repo must be the harness's checkout)" });

        var scriptPath = Path.GetFullPath(Path.Combine(self.Path, SuiteDir, def.Script));
        if (!File.Exists(scriptPath))
            return (400, new { error = $"eval suite not found: expected {scriptPath} — this checkout has no {SuiteDir}/, nothing was started" });

        LoopEvalRun run;
        lock (_gate)
        {
            if (!CanStart(_run))
                return (409, new
                {
                    error = $"an eval run is already active ({_run!.Scenario}) — this box has one claude CLI, one run at a time",
                    run = _run.Snapshot(),
                });
            run = new LoopEvalRun(def.Id, def.Title, _auth, _logger);
            _run = run;
        }

        var psi = new ProcessStartInfo
        {
            FileName = "node",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = self.Path,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        psi.ArgumentList.Add(scriptPath);
        psi.ArgumentList.Add("--live");
        // The child targets THIS harness, authenticated by the minted one-shot
        // session only — never a password. Clear any inherited password var so
        // the suite's exactly-one-credential guard can't trip on stray env.
        psi.Environment["LOOPEVAL_LIVE_TOKEN"] = run.Token;
        psi.Environment["LOOPEVAL_LIVE_PORT"] = _appConfig.Port.ToString();
        psi.Environment.Remove("LOOPEVAL_LIVE_PW");

        Process proc;
        try
        {
            proc = new Process { StartInfo = psi };
            proc.OutputDataReceived += (_, e) => run.FeedLine(e.Data);
            proc.ErrorDataReceived += (_, e) => run.FeedLine(e.Data);
            proc.Start();
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
        }
        catch (Win32Exception)
        {
            run.MarkError("Could not launch `node`. Node.js must be on the host PATH to run the eval suite.");
            return (500, new { error = "could not launch node — is Node.js on the host PATH?", run = run.Snapshot() });
        }
        catch (Exception ex)
        {
            run.MarkError($"Failed to start the eval run: {ex.Message}");
            return (500, new { error = $"failed to start the eval run: {ex.Message}", run = run.Snapshot() });
        }

        lock (_gate) _proc = proc;
        _logger.Info($"[LOOPEVAL] started {def.Id} (pid {proc.Id}, timeout {def.TimeoutMinutes} min)");

        // Waiter: resolves the run on exit or timeout, then reports leftovers.
        Task.Run(() =>
        {
            try
            {
                if (!proc.WaitForExit(def.TimeoutMinutes * 60_000))
                {
                    try { proc.Kill(entireProcessTree: true); } catch { /* best effort */ }
                    run.FeedLine($"[timed out after {def.TimeoutMinutes} min — process tree killed]");
                    run.MarkError($"Run timed out after {def.TimeoutMinutes} min.");
                    proc.WaitForExit();
                }
                else
                {
                    proc.WaitForExit(); // flush the async output readers
                    run.MarkExited(proc.ExitCode);
                    _logger.Info($"[LOOPEVAL] {def.Id} exited {proc.ExitCode}");
                }
            }
            catch (Exception ex)
            {
                run.MarkError($"Eval run watcher failed: {ex.Message}");
            }
            finally
            {
                // The suite's own teardown normally unregisters the fixture; after
                // a stop/kill it never ran — detect and NAME the leftover, don't
                // silently ignore it (the next preflight blocks on it anyway).
                run.SetLeftoverRepos(LeftoverRepoNames());
                lock (_gate) if (ReferenceEquals(_proc, proc)) _proc = null;
                proc.Dispose();
            }
        });

        return (200, new { run = run.Snapshot() });
    }

    /// <summary>Stops the active run: kills the whole process tree (node →
    /// scenario child → claude), resolves the run as stopped immediately, and
    /// lets the waiter report any leftover fixture repo. 404 when idle.</summary>
    public (int Status, object Body) Stop()
    {
        LoopEvalRun? run;
        Process? proc;
        lock (_gate)
        {
            run = _run;
            proc = _proc;
        }
        if (run is null || run.IsTerminal)
            return (404, new { error = "no active eval run to stop" });

        run.FeedLine("[stop requested by the operator — killing the run process tree]");
        run.MarkStopped();
        try { proc?.Kill(entireProcessTree: true); } catch { /* already gone */ }
        _logger.Info($"[LOOPEVAL] {run.Scenario} stopped by the operator");
        return (200, new { run = run.Snapshot() });
    }

    /// <summary>Harness shutdown: never orphan a running eval (task 2.6) — the
    /// child tree dies with us and the run's session is revoked.</summary>
    public void Dispose()
    {
        LoopEvalRun? run;
        Process? proc;
        lock (_gate)
        {
            run = _run;
            proc = _proc;
            _proc = null;
        }
        if (run is { IsTerminal: false })
        {
            run.MarkError("Harness shut down while the run was active — process tree killed.");
            _logger.Info("[LOOPEVAL] harness shutdown killed the active eval run");
        }
        try { proc?.Kill(entireProcessTree: true); } catch { /* best effort */ }
    }
}
