using System.Collections.Concurrent;
using System.ComponentModel;
using System.Diagnostics;
using System.Text;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// Runs the loop-mode system tests from inside the harness (the real-runner
/// design in understanding.md). Each test is one of the fixed Node/Playwright
/// scripts under <c>.claudeweb-preview/playwright/</c> in the harness's own
/// (self) repo; this service spawns <c>node &lt;script&gt;</c>, captures its
/// output, and remembers the last result so the System Tests tab can show it.
///
/// SAFETY / SCOPE:
///   - Only the <see cref="Tests"/> ids below can be run — there is no
///     arbitrary-path execution. The id maps to a hard-coded filename inside the
///     self repo's playwright folder.
///   - The whole surface is gated by <see cref="AutopilotGate"/> at the
///     controller, like every other autopilot endpoint.
///   - Scripts are pointed at the LIVE harness via <c>TEST_BASE</c> (the api
///     test uses a fake repoId and self-cleans; the browser tests stub or only
///     read), so they are genuinely one-click against the running app. node must
///     be on PATH; the three browser tests also need Playwright installed —
///     absent either, the run reports an honest error, never a fake pass.
/// </summary>
public sealed class SystemTestsService
{
    /// <summary>A runnable test: id → fixed script + metadata for the UI.
    /// <c>Checks</c> = what the test verifies, in plain language; <c>Why</c> =
    /// why it matters / what breaks for you if it fails.</summary>
    public sealed record TestDef(
        string Id, string Title, string Checks, string Why, string Script, bool Browser, string? Artifact);

    // The four loop-mode tests, one per sub-tab. Paths are relative to the self
    // repo root; Artifact is the screenshot a browser test writes (null = none).
    // Descriptions are written for a reader who does NOT know the code — say what
    // each test proves and why you'd care, not which endpoints it pokes.
    private static readonly IReadOnlyList<TestDef> Tests = new[]
    {
        new TestDef("api", "Loop controls work (server side)",
            "Exercises the commands behind the Loops tab — arm a loop, change its prompt/cap, and stop it — then confirms an armed loop shows up in the autopilot status. It runs against a pretend agent, so no real Claude session is driven.",
            "If this fails, the Arm / Stop buttons on the Loops tab can't reliably talk to the server, so loops might not start, update, or stop when you ask.",
            "verify-loopmode-api.mjs", false, null),
        new TestDef("ui", "Loops tab looks right",
            "Opens the Loops tab in a real browser and checks it draws all three screens correctly — the arm form, a loop that's running, and a finished loop — and that pressing the buttons sends the right request. The server is faked here, so this is purely about what's on screen.",
            "Catches a visually broken Loops tab — a missing button, a wrong field, a screen that won't render — before you depend on it to drive an agent.",
            "verify-loopmode-ui.mjs", true, ".claudeweb-preview/out-loopmode-ui.png"),
        new TestDef("spa", "Explainer matches reality",
            "Loads the Autopilot explainer page (the animated “how loop mode works” demo) and runs its built-in simulator through all three ways a loop ends: hitting the iteration cap, seeing the done-phrase, and escalating on a risky word.",
            "Keeps the teaching diagram honest — it makes sure the animation that explains loop mode still matches how the real loop behaves, so the docs don't quietly drift from the code.",
            "verify-loopmode-spa.mjs", true, ".claudeweb-preview/out-loopmode-spa.png"),
        new TestDef("probe", "Page isn't broken",
            "A quick smoke test: opens the live Autopilot page, confirms its tabs are present and the browser console is free of errors, and saves a full-page screenshot you can eyeball below.",
            "A fast “is the Autopilot page broken?” check after a deploy — it flags a blank page or a JavaScript crash without you having to click around.",
            "probe-loopmode.mjs", true, ".claudeweb-preview/out-loopmode-probe.png"),
    };

    // Mutable per-test run record. status: idle | running | passed | failed | error.
    private sealed class RunState
    {
        public string Status = "idle";
        public int? ExitCode;
        public readonly StringBuilder Output = new();
        public long? StartedAt;
        public long? FinishedAt;
        public string? Error;
        public Process? Proc;
    }

    private const int TimeoutMs = 120_000; // playwright launch + run backstop
    private const string ScriptDir = ".claudeweb-preview/playwright";

    private readonly RepositoryRegistry _repos;
    private readonly AppConfig _config;
    private readonly Logger _logger;
    private readonly ConcurrentDictionary<string, RunState> _runs = new();
    private readonly object _gate = new();

    public SystemTestsService(RepositoryRegistry repos, AppConfig config, Logger logger)
    {
        _repos = repos;
        _config = config;
        _logger = logger;
    }

    public IReadOnlyList<TestDef> Definitions => Tests;

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private string? SelfRepoPath() =>
        _repos.GetAll().FirstOrDefault(r => r.IsSelf)?.Path;

    /// <summary>The full path to a test's screenshot, or null if the test has
    /// none or the self repo can't be located.</summary>
    public string? ArtifactPath(string id)
    {
        var def = Tests.FirstOrDefault(t => t.Id == id);
        var root = SelfRepoPath();
        if (def?.Artifact is null || root is null) return null;
        return Path.GetFullPath(Path.Combine(root, def.Artifact));
    }

    /// <summary>The list every test plus its live/last run state, for the UI.</summary>
    public IEnumerable<object> Snapshot()
    {
        foreach (var def in Tests)
        {
            var r = _runs.TryGetValue(def.Id, out var s) ? s : null;
            string? artFull = def.Artifact is null ? null : ArtifactPath(def.Id);
            bool artExists = artFull is not null && File.Exists(artFull);
            long? artAt = artExists ? new DateTimeOffset(File.GetLastWriteTimeUtc(artFull!)).ToUnixTimeMilliseconds() : null;

            lock (_gate)
            {
                yield return new
                {
                    id = def.Id,
                    title = def.Title,
                    checks = def.Checks,
                    why = def.Why,
                    script = $"{ScriptDir}/{def.Script}",
                    browser = def.Browser,
                    hasArtifact = def.Artifact is not null,
                    artifactReady = artExists,
                    artifactAt = artAt,
                    status = r?.Status ?? "idle",
                    exitCode = r?.ExitCode,
                    output = r?.Output.ToString() ?? "",
                    startedAt = r?.StartedAt,
                    finishedAt = r?.FinishedAt,
                    error = r?.Error,
                };
            }
        }
    }

    /// <summary>Kicks off a test run if it isn't already running. Returns false
    /// only for an unknown id; a missing prerequisite still "runs" and surfaces
    /// the failure in the run state (honest, not silent).</summary>
    public bool Start(string id)
    {
        var def = Tests.FirstOrDefault(t => t.Id == id);
        if (def is null) return false;

        var state = _runs.GetOrAdd(id, _ => new RunState());
        lock (_gate)
        {
            if (state.Status == "running") return true; // already in flight
            state.Status = "running";
            state.ExitCode = null;
            state.Error = null;
            state.Output.Clear();
            state.StartedAt = Now();
            state.FinishedAt = null;
        }

        // Fire-and-forget; the UI polls Snapshot() for progress.
        Task.Run(() => Execute(def, state));
        return true;
    }

    private void Execute(TestDef def, RunState state)
    {
        var root = SelfRepoPath();
        if (root is null)
        {
            Fail(state, "Can't locate the harness's own (self) repo, so the test scripts can't be found.");
            return;
        }

        var script = Path.GetFullPath(Path.Combine(root, ScriptDir, def.Script));
        if (!File.Exists(script))
        {
            Fail(state, $"Test script not found: {script}");
            return;
        }

        var psi = new ProcessStartInfo
        {
            FileName = "node",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = root,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        psi.ArgumentList.Add(script);
        // Point the scripts at THIS running harness (they default to :5210).
        psi.Environment["TEST_BASE"] = $"http://localhost:{_config.Port}";

        Process proc;
        try
        {
            proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
            proc.OutputDataReceived += (_, e) => Append(state, e.Data);
            proc.ErrorDataReceived += (_, e) => Append(state, e.Data);
            proc.Start();
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
        }
        catch (Win32Exception)
        {
            // node not on PATH — the real prerequisite, surfaced honestly.
            Fail(state, "Could not launch `node`. Node.js must be on the host PATH to run these tests"
                + (def.Browser ? ", and Playwright must be installed (the three browser tests launch Chromium)." : "."));
            return;
        }
        catch (Exception ex)
        {
            Fail(state, $"Failed to start the test: {ex.Message}");
            return;
        }

        lock (_gate) state.Proc = proc;

        if (!proc.WaitForExit(TimeoutMs))
        {
            try { proc.Kill(entireProcessTree: true); } catch { /* best effort */ }
            Append(state, $"\n[timed out after {TimeoutMs / 1000}s — killed]");
            Finish(state, exit: null, status: "error", error: "Test timed out.");
            return;
        }
        proc.WaitForExit(); // flush async readers

        var exit = proc.ExitCode;
        Finish(state, exit, exit == 0 ? "passed" : "failed", error: null);
        _logger.Info($"[SYSTEST] {def.Id} exited {exit}");
        lock (_gate) state.Proc = null;
    }

    private void Append(RunState state, string? line)
    {
        if (line is null) return;
        lock (_gate) state.Output.AppendLine(line);
    }

    private void Fail(RunState state, string message)
    {
        Append(state, message);
        Finish(state, exit: null, status: "error", error: message);
    }

    private void Finish(RunState state, int? exit, string status, string? error)
    {
        lock (_gate)
        {
            state.ExitCode = exit;
            state.Status = status;
            state.Error = error;
            state.FinishedAt = Now();
        }
    }
}
