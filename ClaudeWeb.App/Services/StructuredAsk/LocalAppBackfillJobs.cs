using System.Collections.Concurrent;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// Backend-owned registry of build-command BACKFILL jobs, one per repository
/// (openspec local-app-lifecycle-controls, D6). Same lifecycle contract as
/// <see cref="LocalAppDiscoveryJobs"/>: start-or-join, background task on the job's
/// own token (disconnect-proof), latest-only per repo, in-memory.
///
/// The job sends the targeted <see cref="LocalAppBuildCommandAsk"/> for the cached
/// findings that lack a build command, then merges the answers SURGICALLY into the
/// cache (<see cref="LocalAppDiscoveryCache.UpdateBuildCommands"/> — only
/// <c>buildCommand</c> by port, nothing else) and reseeds the in-memory discovery
/// job so status reads and Rebuild resolve the new commands immediately. The
/// nothing-to-do short-circuit lives in the CONTROLLER (no cache / nothing missing
/// → no agent call, no job) so this registry only ever runs a real ask.
/// </summary>
public class LocalAppBackfillJobs
{
    private readonly LocalAppBuildCommandAsk _ask;
    private readonly LocalAppDiscoveryCache _cache;
    private readonly LocalAppDiscoveryJobs _discoveryJobs;
    private readonly RepoEventLog _events;
    private readonly ConcurrentDictionary<string, BackfillJob> _jobs = new();
    private readonly object _gate = new();

    public LocalAppBackfillJobs(
        LocalAppBuildCommandAsk ask, LocalAppDiscoveryCache cache,
        LocalAppDiscoveryJobs discoveryJobs, RepoEventLog events)
    {
        _ask = ask;
        _cache = cache;
        _discoveryJobs = discoveryJobs;
        _events = events;
    }

    /// <summary>
    /// Join the repo's backfill if one is running, otherwise start a new one for the
    /// given findings (the caller has already selected the ones missing a build
    /// command and confirmed the set is non-empty).
    /// </summary>
    public BackfillJob StartOrJoin(string repoId, string workingDirectory, IReadOnlyList<LocalAppFinding> missing)
    {
        // Lock, not AddOrUpdate: the factories can run more than once under
        // contention and StartNew launches a real agent ask (same race the
        // rebuild registry fixed — see LocalAppBuildJobs.StartOrJoin).
        lock (_gate)
        {
            if (_jobs.TryGetValue(repoId, out var existing) && existing.Status == BackfillStatus.Running)
                return existing;
            var job = StartNew(repoId, workingDirectory, missing);
            _jobs[repoId] = job;
            return job;
        }
    }

    /// <summary>The most recent backfill job for the repo, or null.</summary>
    public BackfillJob? Get(string repoId) =>
        _jobs.TryGetValue(repoId, out var job) ? job : null;

    private BackfillJob StartNew(string repoId, string workingDirectory, IReadOnlyList<LocalAppFinding> missing)
    {
        var job = new BackfillJob(missing.Count);
        _events.Emit(repoId, "backfill", "started", "Build-command backfill",
            $"asking the agent about {missing.Count} app{(missing.Count == 1 ? "" : "s")} missing a build command…");
        job.Run = Task.Run(async () =>
        {
            try
            {
                var result = await _ask.BackfillAsync(workingDirectory, missing, job.Cts.Token);
                if (!result.Success)
                {
                    job.MarkError(result.Error ?? "backfill failed");
                    _events.Emit(repoId, "backfill", "error", "Build-command backfill", job.Error!);
                    return;
                }

                var answers = result.Report!.Apps.ToDictionary(a => a.Port, a => a.BuildCommand);
                var updated = _cache.UpdateBuildCommands(repoId, answers);
                if (updated is null)
                {
                    // Cache vanished mid-ask (operator deleted every finding) — the
                    // answers have nowhere to land; report honestly.
                    job.MarkError("cache disappeared while the backfill was running");
                    _events.Emit(repoId, "backfill", "error", "Build-command backfill", job.Error!);
                    return;
                }

                // Reseed the in-memory job so status reads / Rebuild see the new
                // commands now (never clobbers a running scan — SeedFromCache skips it;
                // that scan's own completion merge lands on the already-updated cache).
                _discoveryJobs.SeedFromCache(repoId, updated);

                var filled = answers.Count(kv => !string.IsNullOrWhiteSpace(kv.Value));
                job.MarkDone(filled);
                _events.Emit(repoId, "backfill", "done", "Build-command backfill",
                    $"filled {filled} of {missing.Count} — {missing.Count - filled} reported build-less/unknown");
            }
            catch (OperationCanceledException)
            {
                job.MarkError("backfill cancelled");
                _events.Emit(repoId, "backfill", "error", "Build-command backfill", "backfill cancelled");
            }
            catch (Exception ex)
            {
                job.MarkError($"{ex.GetType().Name}: {ex.Message}");
                _events.Emit(repoId, "backfill", "error", "Build-command backfill", job.Error!);
            }
        });
        return job;
    }
}

public enum BackfillStatus { Running, Done, Error }

/// <summary>One repo's most recent backfill run. Request-independent.</summary>
public class BackfillJob
{
    public BackfillJob(int asked) => Asked = asked;

    public BackfillStatus Status { get; private set; } = BackfillStatus.Running;

    /// <summary>How many findings the ask enumerated.</summary>
    public int Asked { get; }

    /// <summary>How many came back with a non-empty build command (Done only).</summary>
    public int? Filled { get; private set; }

    public string? Error { get; private set; }
    public DateTimeOffset StartedAt { get; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; private set; }

    public Task? Run { get; set; }
    public CancellationTokenSource Cts { get; } = new();

    public void MarkDone(int filled)
    {
        Filled = filled;
        Status = BackfillStatus.Done;
        FinishedAt = DateTimeOffset.UtcNow;
    }

    public void MarkError(string error)
    {
        Error = error;
        Status = BackfillStatus.Error;
        FinishedAt = DateTimeOffset.UtcNow;
    }
}
