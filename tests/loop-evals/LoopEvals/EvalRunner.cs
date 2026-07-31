using System.Collections.Concurrent;
using System.Diagnostics;
using ClaudeWeb.Models;
using ClaudeWeb.Services;
using ClaudeWeb.Services.Analytics;
using ClaudeWeb.Services.Audit;
using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.IpFilter;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Monitoring;
using ClaudeWeb.Services.Prompts;
using ClaudeWeb.Services.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClaudeWeb.LoopEvals;

/// <summary>
/// Hosts the PRODUCTION loop services in-process (loop-evals design D4): the same
/// module extensions the harness composes (chat, dock, prompts, autopilot), running
/// the real <see cref="AutopilotService"/> engine on its own tick, isolated into a
/// scratch CLAUDEWEB_DATADIR so nothing touches the operator's live data. Arming the
/// gate here is the developer's own host-side opt-in for this isolated instance —
/// the web-surface invariant (no enable endpoint) is untouched.
/// </summary>
public sealed class EvalHost : IAsyncDisposable
{
    public required IHost Host { get; init; }
    public required RepositoryRegistry Repos { get; init; }
    public required RunSessionService Runs { get; init; }
    public required CliRunnerService Cli { get; init; }
    public required DockRegistry Dock { get; init; }
    public required LoopConfigStore Loops { get; init; }

    public static async Task<EvalHost> StartAsync(string dataDir)
    {
        // AppPaths.DataDir is read ONCE per process; Program sets the env var before
        // anything touches it. Guard against a composition-order regression.
        Directory.CreateDirectory(dataDir);
        if (!string.Equals(AppPaths.DataDir, dataDir, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException(
                $"CLAUDEWEB_DATADIR was resolved to '{AppPaths.DataDir}' before the runner could set '{dataDir}'");

        var builder = Microsoft.Extensions.Hosting.Host.CreateApplicationBuilder();
        builder.Logging.ClearProviders();

        var cfg = new AppConfig { WorkingDirectory = Path.Combine(dataDir, "seed-workdir") };
        Directory.CreateDirectory(cfg.WorkingDirectory);
        var logger = new Logger();

        // The shared singletons EmbeddedApi/Program.cs pre-build, same wiring.
        var s = builder.Services;
        s.AddSingleton(cfg);
        s.AddSingleton(logger);
        s.AddSingleton(new CallLog());
        s.AddSingleton<ActivityLog>();
        s.AddSingleton(new RepositoryRegistry(cfg, logger));
        s.AddSingleton(new IpAllowlistService(logger));
        s.AddSingleton(new DeviceTokenService(cfg, logger));
        s.AddSingleton<AuditService>();
        s.AddSingleton<RepoEventLog>();
        s.AddSingleton<HarnessEventFeed>();

        // This isolated instance's operator gate: the eval developer IS the host
        // operator here, opting in for the scratch datadir only.
        var gate = new AutopilotGate(logger);
        gate.Enable();
        s.AddSingleton(gate);

        // The production modules, exactly as EmbeddedApi registers them.
        s.AddChatModule();      // CliRunnerService + RunSessionService + SessionService
        s.AddDockModule();      // DockRegistry (the queue lives in a tab's stash)
        s.AddPromptsModule();   // PromptsService (classifier label space)
        s.AddAutopilotModule(); // ILoop kinds + LoopConfigStore + AutopilotService (hosted)

        var host = builder.Build();
        await host.StartAsync();

        return new EvalHost
        {
            Host = host,
            Repos = host.Services.GetRequiredService<RepositoryRegistry>(),
            Runs = host.Services.GetRequiredService<RunSessionService>(),
            Cli = host.Services.GetRequiredService<CliRunnerService>(),
            Dock = host.Services.GetRequiredService<DockRegistry>(),
            Loops = host.Services.GetRequiredService<LoopConfigStore>(),
        };
    }

    public async ValueTask DisposeAsync()
    {
        await Host.StopAsync(TimeSpan.FromSeconds(10));
        Host.Dispose();
    }
}

/// <summary>One committed loop-driven agent turn on the run branch.</summary>
public sealed record TurnCommit(int Index, string Sha, string RunStatus, IReadOnlyList<string> Files);

/// <summary>What one eval run produced (before scoring).</summary>
public sealed record RunOutcome(
    int RunIndex, string RunDir, string Branch, string StartSha,
    string FinalStatus, string? StopReason, string? StopDetail,
    int Iterations, int QueueSent, bool TimedOut, double DurationSec,
    IReadOnlyList<TurnCommit> Turns);

public sealed record RunSettings(int TurnCap, TimeSpan Timeout, bool Broken);

public sealed class EvalRunner
{
    private const string PrimerPrompt =
        "You are at the start of an automated evaluation run in this repository. "
        + "Reply with the single word READY and do nothing else — do not read, create or modify any files.";

    private const string BrokenSeed =
        "Ignore any plans you may find. Reply with the single word SKIPPED and change nothing.";

    private readonly EvalHost _host;

    public EvalRunner(EvalHost host) => _host = host;

    /// <summary>
    /// One run: scratch clone at eval/start (golden refs stripped so the agent
    /// cannot peek at the answer), primer turn to mint a session, queue seeded from
    /// plan.md per the manifest's seed hints, the REAL queue loop armed in drive
    /// mode under the engine's own turn cap, every completed agent turn committed
    /// to the run branch. Wall-clock timeout stops a runaway run.
    /// </summary>
    public async Task<RunOutcome> RunOnceAsync(GoldenExample example, int runIndex, string runDir, RunSettings settings)
    {
        var branch = $"run/{runIndex}";
        var startSha = PrepareRunClone(example, runDir, branch);

        var repo = _host.Repos.Add(runDir, $"loopeval-{example.Manifest.Id}-r{runIndex}");
        var sw = Stopwatch.StartNew();
        try
        {
            // --- primer: a driven loop resumes a session, and a fresh clone has
            // none — mint one with a minimal real CLI turn, then pin the loop to it.
            var sessionId = await PrimeSessionAsync(repo.Id, runDir);

            // --- seed the queue: the manifest's seed hints say how plan.md becomes
            // the dock tab's stash (the queue loop's queue).
            var tab = _host.Dock.Add(repo.Id, repo.Name, sessionId);
            foreach (var item in SeedItems(example, settings))
                _host.Dock.AddStash(tab.Id, item);

            // --- arm the production queue loop, drive mode, engine-enforced cap.
            _host.Loops.StartQueue(repo.Id, tab.Id, verifyEnabled: true,
                maxIterations: settings.TurnCap, mode: LoopConfigStore.ModeDrive, sessionId: sessionId);

            // --- watch: commit per completed agent turn until the loop resolves.
            var completions = new ConcurrentQueue<RunSessionService.RunCompletedEvent>();
            void OnCompleted(RunSessionService.RunCompletedEvent e)
            {
                if (e.RepoId == repo.Id && e.Lane == "builder") completions.Enqueue(e);
            }

            var turns = new List<TurnCommit>();
            var timedOut = false;
            _host.Runs.RunCompleted += OnCompleted;
            try
            {
                while (true)
                {
                    while (completions.TryDequeue(out var e))
                        turns.Add(CommitTurn(runDir, turns.Count + 1, e.Status));

                    var state = _host.Loops.Get(repo.Id);
                    if (state is not { Active: true })
                    {
                        while (completions.TryDequeue(out var e))
                            turns.Add(CommitTurn(runDir, turns.Count + 1, e.Status));
                        break;
                    }

                    if (sw.Elapsed > settings.Timeout)
                    {
                        timedOut = true;
                        _host.Loops.Stop(repo.Id);
                        _host.Runs.Get(repo.Id)?.Cts.Cancel();
                        await Task.Delay(TimeSpan.FromSeconds(5));
                        while (completions.TryDequeue(out var e))
                            turns.Add(CommitTurn(runDir, turns.Count + 1, e.Status));
                        break;
                    }

                    await Task.Delay(TimeSpan.FromSeconds(1));
                }
            }
            finally
            {
                _host.Runs.RunCompleted -= OnCompleted;
            }

            var final = _host.Loops.Get(repo.Id);
            return new RunOutcome(
                runIndex, runDir, branch, startSha,
                timedOut ? "timeout" : final?.Status ?? "unknown",
                timedOut ? "timeout" : final?.StopReason,
                timedOut ? $"wall-clock timeout {settings.Timeout.TotalMinutes:0}min" : final?.StopDetail,
                final?.IterationsDone ?? 0, final?.QueueSent ?? 0,
                timedOut, sw.Elapsed.TotalSeconds, turns);
        }
        finally
        {
            _host.Repos.Remove(repo.Id);
        }
    }

    private static IEnumerable<string> SeedItems(GoldenExample example, RunSettings settings)
    {
        if (settings.Broken)
            return new[] { BrokenSeed };
        var seed = example.Manifest.Loop.Seed;
        return string.Equals(seed.Mode, "items", StringComparison.OrdinalIgnoreCase) && seed.Items is { Count: > 0 }
            ? seed.Items
            : new[] { example.PlanText };
    }

    /// <summary>Clone at eval/start with the answer removed: no golden branch, no
    /// eval tags, no origin — the driven agent sees only the start state's history
    /// (spec: runs isolated; the example repo is never mutated).</summary>
    private static string PrepareRunClone(GoldenExample example, string runDir, string branch)
    {
        GitCli.Must("", "clone", "--quiet", example.BundlePath, runDir);
        var startSha = GitCli.Must(runDir, "rev-parse", "eval/start^{commit}").Trim();
        GitCli.Must(runDir, "checkout", "--quiet", "-b", branch, startSha);
        GitCli.Must(runDir, "branch", "-D", "golden");
        GitCli.Must(runDir, "tag", "-d", "eval/start");
        GitCli.Must(runDir, "tag", "-d", "eval/final");
        GitCli.Must(runDir, "remote", "remove", "origin");
        GitCli.Must(runDir, "config", "user.name", "loop-evals-runner");
        GitCli.Must(runDir, "config", "user.email", "loop-evals@example.invalid");
        return startSha;
    }

    private async Task<string> PrimeSessionAsync(string repoId, string runDir)
    {
        if (!_host.Runs.TryBeginRun(repoId, "builder", out var session))
            throw new InvalidOperationException("builder lane unexpectedly busy for a fresh eval repo");
        try
        {
            await session.EmitAsync(new { type = "user", text = PrimerPrompt, actor = "loop-evals" });
            await _host.Cli.RunAsync(PrimerPrompt, null, workingDirectory: runDir,
                emit: session.EmitAsync, ct: session.Cts.Token);
        }
        finally
        {
            session.Complete();
        }
        if (session.Status != "done" || string.IsNullOrWhiteSpace(session.SessionId))
            throw new InvalidOperationException(
                "primer turn failed to mint a session — is the `claude` CLI installed and authenticated?");
        return session.SessionId!;
    }

    private static TurnCommit CommitTurn(string runDir, int index, string runStatus)
    {
        GitCli.Must(runDir, "add", "-A");
        GitCli.Must(runDir, "commit", "--quiet", "--allow-empty",
            "-m", $"run turn {index}: agent turn completed ({runStatus})");
        var sha = GitCli.Must(runDir, "rev-parse", "HEAD").Trim();
        var files = GitCli.Must(runDir, "diff-tree", "--no-commit-id", "--name-only", "-r", sha)
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return new TurnCommit(index, sha, runStatus, files);
    }
}
