using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// Backend-owned registry of local-app REBUILD jobs, one per (repo, port) —
/// openspec change local-app-lifecycle-controls (D4). Patterned on
/// <see cref="LocalAppDiscoveryJobs"/>: start-or-join, the job runs on a background
/// task with its OWN cancellation token (a client disconnect never cancels a build),
/// and the latest job per key is retained so the panel can reattach to an in-flight
/// build or pick up an outcome that landed while the page was closed.
///
/// The build runs the finding's cached <c>buildCommand</c> in the app's folder with
/// stdout+stderr captured into a bounded tail (truncation marked, so a "success"
/// with truncated output is still honest) plus the exit code. Rebuild deliberately
/// does NOT stop or start the app's server — restarting into the new build is the
/// operator's separate action.
///
/// In-memory and latest-only per key: a harness restart simply means "no recent
/// rebuild", same contract as discovery jobs.
/// </summary>
public class LocalAppBuildJobs
{
    // Bounded output tail (~8 KB) — build logs can be huge; the panel needs the
    // decisive end of the log, not all of it.
    private const int TailChars = 8_192;

    // Hard runtime cap so a hung build can't pin a job in "running" forever.
    private static readonly TimeSpan BuildTimeout = TimeSpan.FromMinutes(10);

    private readonly RepoEventLog _events;
    private readonly ConcurrentDictionary<(string RepoId, int Port), BuildJob> _jobs = new();
    private readonly object _gate = new();

    public LocalAppBuildJobs(RepoEventLog events) => _events = events;

    /// <summary>
    /// Join the (repo, port)'s rebuild if one is running, otherwise start a new one.
    /// The command/folder are resolved by the CALLER from the repo's discovery result
    /// (never off the wire) — this registry only owns the job lifecycle.
    /// Serialized under a lock, NOT AddOrUpdate: the dictionary's factories can run
    /// more than once under contention, and <see cref="StartNew"/> has a side effect
    /// (it launches the build) — two concurrent clicks would each run a build while
    /// only one job stayed visible. The e2e's concurrent-rebuild check caught this.
    /// </summary>
    public BuildJob StartOrJoin(string repoId, int port, string appName, string buildCommand, string folder)
    {
        lock (_gate)
        {
            if (_jobs.TryGetValue((repoId, port), out var existing) && existing.Status == BuildStatus.Running)
                return existing;
            var job = StartNew(repoId, port, appName, buildCommand, folder);
            _jobs[(repoId, port)] = job;
            return job;
        }
    }

    /// <summary>The most recent rebuild job for the (repo, port), or null.</summary>
    public BuildJob? Get(string repoId, int port) =>
        _jobs.TryGetValue((repoId, port), out var job) ? job : null;

    private BuildJob StartNew(string repoId, int port, string appName, string buildCommand, string folder)
    {
        var job = new BuildJob(buildCommand);
        _events.Emit(repoId, "rebuild", "started", $"Rebuild · {appName}",
            $"running `{buildCommand}` in {folder}…");
        job.Run = Task.Run(() =>
        {
            try
            {
                var (exitCode, tail, timedOut) = Execute(buildCommand, folder, job.Cts.Token);
                if (timedOut)
                {
                    job.MarkFailed(null, tail + "\n[build timed out after 10 minutes — process killed]");
                    _events.Emit(repoId, "rebuild", "error", $"Rebuild · {appName}",
                        "build timed out after 10 minutes");
                }
                else if (exitCode == 0)
                {
                    job.MarkSucceeded(tail);
                    _events.Emit(repoId, "rebuild", "done", $"Rebuild · {appName}",
                        "build succeeded (exit 0)");
                }
                else
                {
                    job.MarkFailed(exitCode, tail);
                    _events.Emit(repoId, "rebuild", "error", $"Rebuild · {appName}",
                        $"build failed (exit {exitCode})");
                }
            }
            catch (Exception ex)
            {
                job.MarkFailed(null, ex.Message);
                _events.Emit(repoId, "rebuild", "error", $"Rebuild · {appName}",
                    $"{ex.GetType().Name}: {ex.Message}");
            }
        });
        return job;
    }

    // Run the build command via PowerShell in the app's folder, stdout+stderr merged
    // into a bounded tail. Synchronous inside the job's background task.
    private static (int? ExitCode, string Tail, bool TimedOut) Execute(string buildCommand, string folder, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = folder,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        psi.ArgumentList.Add("-NoProfile");
        psi.ArgumentList.Add("-Command");
        // `; exit $LASTEXITCODE` propagates the native build's real exit code —
        // bare powershell -Command reports a generic 1 for any failing command,
        // which would launder e.g. exit 3 into 1 in the job's outcome.
        psi.ArgumentList.Add(buildCommand + "; exit $LASTEXITCODE");

        using var proc = Process.Start(psi)
            ?? throw new InvalidOperationException("Process.Start returned null");

        var tail = new StringBuilder();
        var truncated = false;
        var tailLock = new object();
        void Append(string? line)
        {
            if (line is null) return;
            lock (tailLock)
            {
                tail.AppendLine(line);
                if (tail.Length > TailChars)
                {
                    tail.Remove(0, tail.Length - TailChars);
                    truncated = true;
                }
            }
        }
        proc.OutputDataReceived += (_, e) => Append(e.Data);
        proc.ErrorDataReceived += (_, e) => Append(e.Data);
        proc.BeginOutputReadLine();
        proc.BeginErrorReadLine();

        var deadline = DateTimeOffset.UtcNow + BuildTimeout;
        while (!proc.WaitForExit(500))
        {
            if (ct.IsCancellationRequested || DateTimeOffset.UtcNow > deadline)
            {
                try { proc.Kill(entireProcessTree: true); } catch { /* already gone */ }
                proc.WaitForExit(5_000);
                lock (tailLock)
                    return (null, Render(), true);
            }
        }
        proc.WaitForExit(); // drain the async output readers
        lock (tailLock)
            return (proc.ExitCode, Render(), false);

        string Render() => (truncated ? "[…output truncated to last 8 KB…]\n" : "") + tail.ToString().TrimEnd();
    }
}

public enum BuildStatus { Running, Succeeded, Failed }

/// <summary>One (repo, port)'s most recent rebuild. Request-independent: the only
/// cancellation source is the job's own <see cref="Cts"/>.</summary>
public class BuildJob
{
    public BuildJob(string command) => Command = command;

    public BuildStatus Status { get; private set; } = BuildStatus.Running;
    public string Command { get; }
    public int? ExitCode { get; private set; }

    /// <summary>Bounded stdout+stderr tail (~8 KB, truncation marked in-band).</summary>
    public string Output { get; private set; } = "";

    public DateTimeOffset StartedAt { get; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; private set; }

    public Task? Run { get; set; }
    public CancellationTokenSource Cts { get; } = new();

    public void MarkSucceeded(string output)
    {
        Output = output;
        ExitCode = 0;
        Status = BuildStatus.Succeeded;
        FinishedAt = DateTimeOffset.UtcNow;
    }

    public void MarkFailed(int? exitCode, string output)
    {
        Output = output;
        ExitCode = exitCode;
        Status = BuildStatus.Failed;
        FinishedAt = DateTimeOffset.UtcNow;
    }
}
