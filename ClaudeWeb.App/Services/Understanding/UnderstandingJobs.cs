using System.Collections.Concurrent;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// Backend-owned registry of "Ask for understanding" runs, one job per repository
/// (openspec change add-ask-for-understanding). Modeled on
/// <see cref="StructuredAsk.LocalAppDiscoveryJobs"/>: the run is owned server-side
/// on a background task with the job's OWN cancellation token (never the request's),
/// so a phone refresh / disconnect mid-run leaves it running to completion, and the
/// dock reattaches via status on load.
///
/// In-memory and latest-only per repo: a harness restart simply means "no recent
/// run", and only the most recent job per repo is retained (the next start
/// overwrites a terminal one) so jobs never accumulate.
/// </summary>
public class UnderstandingJobs
{
    private readonly UnderstandingAsk _ask;
    private readonly RepoEventLog _events;
    private readonly ConcurrentDictionary<string, UnderstandingJob> _jobs = new();

    public UnderstandingJobs(UnderstandingAsk ask, RepoEventLog events)
    {
        _ask = ask;
        _events = events;
    }

    /// <summary>
    /// Join the repo's run if one is already in progress, otherwise start a new one
    /// on a background task and return it. The start-or-join decision is atomic per
    /// repo: a Running job is returned as-is; any terminal (Done/Error) job is
    /// replaced by a fresh run (latest-only).
    /// </summary>
    public UnderstandingJob StartOrJoin(string repoId, string workingDirectory, string sessionId)
    {
        return _jobs.AddOrUpdate(
            repoId,
            _ => StartNew(repoId, workingDirectory, sessionId),
            (_, existing) => existing.Status == UnderstandingStatus.Running
                ? existing
                : StartNew(repoId, workingDirectory, sessionId));
    }

    /// <summary>The most recent job for the repo, or null if none has ever run.</summary>
    public UnderstandingJob? Get(string repoId) =>
        _jobs.TryGetValue(repoId, out var job) ? job : null;

    private UnderstandingJob StartNew(string repoId, string workingDirectory, string sessionId)
    {
        var job = new UnderstandingJob();
        // Event Console: "started" fires only here — on a genuine NEW run — so
        // joining an already-running job does not emit a duplicate start.
        _events.Emit(repoId, "understanding", "started", "Understanding",
            "forking the conversation — building the Understanding app…");
        // Fire-and-forget on a background task with the job's OWN token. We never
        // pass the request's abort token in, so a client disconnect can't cancel it.
        job.Run = Task.Run(async () =>
        {
            try
            {
                var result = await _ask.BuildAsync(workingDirectory, sessionId, job.Cts.Token);
                if (result.Success)
                {
                    job.MarkDone();
                    _events.Emit(repoId, "understanding", "done", "Understanding",
                        "built understanding-app/ — reload the Local tab's Understanding app to see it");
                }
                else
                {
                    var err = result.Error ?? "understanding run failed";
                    job.MarkError(err);
                    _events.Emit(repoId, "understanding", "error", "Understanding", err);
                }
            }
            catch (OperationCanceledException)
            {
                job.MarkError("understanding run cancelled");
                _events.Emit(repoId, "understanding", "error", "Understanding", "understanding run cancelled");
            }
            catch (Exception ex)
            {
                var err = $"{ex.GetType().Name}: {ex.Message}";
                job.MarkError(err);
                _events.Emit(repoId, "understanding", "error", "Understanding", err);
            }
        });
        return job;
    }
}

public enum UnderstandingStatus { Running, Done, Error }

/// <summary>
/// One repository's most recent "Ask for understanding" run. Lives independently of
/// any HTTP request: <see cref="Cts"/> is the only cancellation source.
/// </summary>
public class UnderstandingJob
{
    public UnderstandingStatus Status { get; private set; } = UnderstandingStatus.Running;
    public string? Error { get; private set; }
    public DateTimeOffset StartedAt { get; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; private set; }

    /// <summary>The backing background task; cancellation source for it.</summary>
    public Task? Run { get; set; }
    public CancellationTokenSource Cts { get; } = new();

    public void MarkDone()
    {
        Status = UnderstandingStatus.Done;
        FinishedAt = DateTimeOffset.UtcNow;
    }

    public void MarkError(string error)
    {
        Error = error;
        Status = UnderstandingStatus.Error;
        FinishedAt = DateTimeOffset.UtcNow;
    }
}
