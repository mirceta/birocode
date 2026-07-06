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
///
/// The auto path (openspec auto-understanding-after-turn) adds one pending slot
/// per repo: <see cref="EnqueueLatest"/> during a run remembers only the NEWEST
/// session, and the run's completion chains it — coalescing, never queuing, so
/// turns that finish faster than builds complete cost at most one follow-up run.
/// </summary>
public class UnderstandingJobs
{
    private readonly UnderstandingAsk _ask;
    private readonly RepoEventLog _events;
    private readonly Logging.Logger _logger;
    // One lock guards both maps: a job's terminal transition and the pending
    // slot's consume/keep decision must be atomic together, or a pending run
    // could be double-started or silently dropped.
    private readonly object _gate = new();
    private readonly Dictionary<string, UnderstandingJob> _jobs = new();
    private readonly Dictionary<string, (string Path, string SessionId)> _pending = new();

    public UnderstandingJobs(UnderstandingAsk ask, RepoEventLog events, Logging.Logger logger)
    {
        _ask = ask;
        _events = events;
        _logger = logger;
    }

    /// <summary>
    /// Join the repo's run if one is already in progress, otherwise start a new one
    /// on a background task and return it. The start-or-join decision is atomic per
    /// repo: a Running job is returned as-is; any terminal (Done/Error) job is
    /// replaced by a fresh run (latest-only).
    /// </summary>
    public UnderstandingJob StartOrJoin(string repoId, string workingDirectory, string sessionId)
    {
        lock (_gate)
        {
            if (_jobs.TryGetValue(repoId, out var existing) && existing.Status == UnderstandingStatus.Running)
                return existing;
            var job = StartNew(repoId, workingDirectory, sessionId);
            _jobs[repoId] = job;
            return job;
        }
    }

    /// <summary>
    /// The auto-trigger's entry point (openspec auto-understanding-after-turn):
    /// start a run now if the repo is idle/terminal (same as
    /// <see cref="StartOrJoin"/>), else overwrite the repo's single pending slot
    /// with this newest session; the in-flight run starts it when it finishes.
    /// Intermediate sessions are dropped by design — a fork always explains the
    /// transcript's latest turn, so only the newest matters.
    /// </summary>
    public UnderstandingJob EnqueueLatest(string repoId, string workingDirectory, string sessionId)
    {
        lock (_gate)
        {
            if (_jobs.TryGetValue(repoId, out var existing) && existing.Status == UnderstandingStatus.Running)
            {
                _pending[repoId] = (workingDirectory, sessionId);
                return existing;
            }
            var job = StartNew(repoId, workingDirectory, sessionId);
            _jobs[repoId] = job;
            return job;
        }
    }

    /// <summary>The most recent job for the repo, or null if none has ever run.</summary>
    public UnderstandingJob? Get(string repoId)
    {
        lock (_gate) return _jobs.GetValueOrDefault(repoId);
    }

    // Chains the pending run, if any, when a job reaches its terminal state —
    // called at the end of every job's background task. If another run raced in
    // and is already Running (a manual press), the pending slot is left alone:
    // THAT run's completion will land here too and chain it then.
    private void StartPendingIfAny(string repoId)
    {
        lock (_gate)
        {
            if (!_pending.TryGetValue(repoId, out var next)) return;
            if (_jobs.TryGetValue(repoId, out var existing) && existing.Status == UnderstandingStatus.Running)
                return;
            _pending.Remove(repoId);
            _jobs[repoId] = StartNew(repoId, next.Path, next.SessionId);
        }
    }

    private UnderstandingJob StartNew(string repoId, string workingDirectory, string sessionId)
    {
        var job = new UnderstandingJob();
        // Which session each run explains lands in the host log — the audit
        // trail that a coalesced follow-up ran for the NEWEST pending session.
        _logger.Info($"[UNDERSTANDING] run started for {repoId} (session {sessionId[..Math.Min(8, sessionId.Length)]}…)");
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
            finally
            {
                // Coalescing continuation: the terminal run itself starts the
                // pending "latest" (if a qualifying turn landed while we ran).
                StartPendingIfAny(repoId);
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
