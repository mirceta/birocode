using ClaudeWeb.Services.AgenticAudit;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// Backend-owned registry of conversation-app builds — "Ask for understanding" and
/// "Update goal" — one job per repository AND kind (openspec change
/// add-ask-for-understanding, generalised by <see cref="AppBuildKind"/> in openspec
/// goal-app). Modeled on <see cref="StructuredAsk.LocalAppDiscoveryJobs"/>: the run
/// is owned server-side on a background task with the job's OWN cancellation token
/// (never the request's), so a phone refresh / disconnect mid-run leaves it running
/// to completion, and the dock reattaches via status on load.
///
/// In-memory and latest-only per (kind, repo): a harness restart simply means "no
/// recent run", and only the most recent job per slot is retained (the next start
/// overwrites a terminal one) so jobs never accumulate. The understanding and the
/// goal runs of one repo are independent slots: they can run at the same time.
///
/// The auto path (openspec auto-understanding-after-turn) adds one pending slot
/// per (kind, repo): <see cref="EnqueueLatest(AppBuildKind, string, string, string, string)"/>
/// during a run remembers only the NEWEST session, and the run's completion chains
/// it — coalescing, never queuing, so turns that finish faster than builds complete
/// cost at most one follow-up run.
/// </summary>
public class UnderstandingJobs
{
    private readonly IReadOnlyDictionary<string, IConversationAppBuilder> _builders;
    private readonly RepoEventLog _events;
    private readonly AgenticAuditLog _audit;
    private readonly Logging.Logger _logger;
    // One lock guards both maps: a job's terminal transition and the pending
    // slot's consume/keep decision must be atomic together, or a pending run
    // could be double-started or silently dropped.
    private readonly object _gate = new();
    private readonly Dictionary<string, UnderstandingJob> _jobs = new();
    private readonly Dictionary<string, PendingRun> _pending = new();

    // Auto-triggered runs have no request-scoped identity (they fire from the
    // RunCompleted event with no client attached), so the audit trail records
    // them under this fixed actor.
    private const string AutoActor = "auto";
    private const string AutoIp = "-";

    private sealed record PendingRun(string RepoName, string Path, string SessionId);

    public UnderstandingJobs(IEnumerable<IConversationAppBuilder> builders, RepoEventLog events, AgenticAuditLog audit, Logging.Logger logger)
    {
        _builders = builders.ToDictionary(b => b.Kind.Key, StringComparer.Ordinal);
        _events = events;
        _audit = audit;
        _logger = logger;
    }

    private static string Slot(AppBuildKind kind, string repoId) => $"{kind.Key}:{repoId}";

    private IConversationAppBuilder BuilderFor(AppBuildKind kind) =>
        _builders.TryGetValue(kind.Key, out var b) ? b
            : throw new InvalidOperationException($"No conversation-app builder registered for kind '{kind.Key}'.");

    /// <summary>Understanding-kind shorthand (the original API).</summary>
    public UnderstandingJob StartOrJoin(string repoId, string repoName, string workingDirectory, string sessionId, string actor, string ip) =>
        StartOrJoin(AppBuildKind.Understanding, repoId, repoName, workingDirectory, sessionId, actor, ip);

    /// <summary>
    /// Join the slot's run if one is already in progress, otherwise start a new one
    /// on a background task and return it. The start-or-join decision is atomic per
    /// (kind, repo): a Running job is returned as-is; any terminal (Done/Error) job is
    /// replaced by a fresh run (latest-only). Actor + IP come from the controller
    /// (identity is request-scoped) and are recorded in the agentic audit trail —
    /// only on an actual start, never on a join (openspec add-agent-audit-trail).
    /// </summary>
    public UnderstandingJob StartOrJoin(AppBuildKind kind, string repoId, string repoName, string workingDirectory, string sessionId, string actor, string ip)
    {
        var slot = Slot(kind, repoId);
        lock (_gate)
        {
            if (_jobs.TryGetValue(slot, out var existing) && existing.Status == UnderstandingStatus.Running)
                return existing;
            var job = StartNew(kind, repoId, repoName, workingDirectory, sessionId, actor, ip);
            _jobs[slot] = job;
            return job;
        }
    }

    /// <summary>Understanding-kind shorthand (the original API).</summary>
    public UnderstandingJob EnqueueLatest(string repoId, string repoName, string workingDirectory, string sessionId) =>
        EnqueueLatest(AppBuildKind.Understanding, repoId, repoName, workingDirectory, sessionId);

    /// <summary>
    /// The auto-trigger's entry point (openspec auto-understanding-after-turn):
    /// start a run now if the slot is idle/terminal (same as StartOrJoin), else
    /// overwrite the slot's single pending entry with this newest session; the
    /// in-flight run starts it when it finishes. Intermediate sessions are dropped
    /// by design — a build always reads the transcript's latest turn, so only the
    /// newest matters. Audited as actor "auto" (there is no request identity here).
    /// </summary>
    public UnderstandingJob EnqueueLatest(AppBuildKind kind, string repoId, string repoName, string workingDirectory, string sessionId)
    {
        var slot = Slot(kind, repoId);
        lock (_gate)
        {
            if (_jobs.TryGetValue(slot, out var existing) && existing.Status == UnderstandingStatus.Running)
            {
                _pending[slot] = new PendingRun(repoName, workingDirectory, sessionId);
                return existing;
            }
            var job = StartNew(kind, repoId, repoName, workingDirectory, sessionId, AutoActor, AutoIp);
            _jobs[slot] = job;
            return job;
        }
    }

    /// <summary>The most recent understanding job for the repo, or null if none has ever run.</summary>
    public UnderstandingJob? Get(string repoId) => Get(AppBuildKind.Understanding, repoId);

    /// <summary>The most recent job of that kind for the repo, or null if none has ever run.</summary>
    public UnderstandingJob? Get(AppBuildKind kind, string repoId)
    {
        lock (_gate) return _jobs.GetValueOrDefault(Slot(kind, repoId));
    }

    // Chains the pending run, if any, when a job reaches its terminal state —
    // called at the end of every job's background task. If another run raced in
    // and is already Running (a manual press), the pending slot is left alone:
    // THAT run's completion will land here too and chain it then. Only the auto
    // path writes the slot, so chained runs are audited as "auto".
    private void StartPendingIfAny(AppBuildKind kind, string repoId)
    {
        var slot = Slot(kind, repoId);
        lock (_gate)
        {
            if (!_pending.TryGetValue(slot, out var next)) return;
            if (_jobs.TryGetValue(slot, out var existing) && existing.Status == UnderstandingStatus.Running)
                return;
            _pending.Remove(slot);
            _jobs[slot] = StartNew(kind, repoId, next.RepoName, next.Path, next.SessionId, AutoActor, AutoIp);
        }
    }

    private UnderstandingJob StartNew(AppBuildKind kind, string repoId, string repoName, string workingDirectory, string sessionId, string actor, string ip)
    {
        var builder = BuilderFor(kind);
        var job = new UnderstandingJob { Kind = kind };
        // Which session each run reads lands in the host log — the audit trail that
        // a coalesced follow-up ran for the NEWEST pending session.
        _logger.Info($"[{kind.Key.ToUpperInvariant()}] run started for {repoId} (session {sessionId[..Math.Min(8, sessionId.Length)]}…)");
        // Event Console: "started" fires only here — on a genuine NEW run — so
        // joining an already-running job does not emit a duplicate start.
        _events.Emit(repoId, kind.Op, "started", kind.Title, kind.StartedDetail);
        // Agentic audit (openspec add-agent-audit-trail): durable "started" entry,
        // same only-on-actual-start boundary. The callId lives on the job so the
        // trail endpoint can tell a live "running" from a crash-orphaned start.
        job.AuditCallId = _audit.RecordStart(kind.AuditFeature, repoId, repoName, actor, ip);
        void AuditEnd(string outcome, string? error = null) =>
            _audit.RecordEnd(job.AuditCallId!, kind.AuditFeature, repoId, repoName, actor, ip,
                outcome, (long)(DateTimeOffset.UtcNow - job.StartedAt).TotalMilliseconds, error);
        // Fire-and-forget on a background task with the job's OWN token. We never
        // pass the request's abort token in, so a client disconnect can't cancel it.
        job.Run = Task.Run(async () =>
        {
            try
            {
                var result = await builder.BuildAsync(workingDirectory, sessionId, job.Cts.Token);
                if (result.Success)
                {
                    job.MarkDone(result.Summary);
                    // The Console and the dock both carry the subagent's verdict, so an
                    // "unchanged" goal run is visibly a decision, not a silent no-op.
                    _events.Emit(repoId, kind.Op, "done", kind.Title,
                        result.Summary is null ? kind.DoneDetail : $"{result.Summary} — {kind.DoneDetail}");
                    AuditEnd("done");
                }
                else
                {
                    var err = result.Error ?? kind.FailedDefault;
                    job.MarkError(err);
                    _events.Emit(repoId, kind.Op, "error", kind.Title, err);
                    AuditEnd("error", err);
                }
            }
            catch (OperationCanceledException)
            {
                job.MarkError(kind.CancelledDetail);
                _events.Emit(repoId, kind.Op, "error", kind.Title, kind.CancelledDetail);
                AuditEnd("canceled");
            }
            catch (Exception ex)
            {
                var err = $"{ex.GetType().Name}: {ex.Message}";
                job.MarkError(err);
                _events.Emit(repoId, kind.Op, "error", kind.Title, err);
                AuditEnd("error", err);
            }
            finally
            {
                // Coalescing continuation: the terminal run itself starts the
                // pending "latest" (if a qualifying turn landed while we ran).
                StartPendingIfAny(kind, repoId);
            }
        });
        return job;
    }
}

public enum UnderstandingStatus { Running, Done, Error }

/// <summary>
/// One repository's most recent run of one kind. Lives independently of any HTTP
/// request: <see cref="Cts"/> is the only cancellation source.
/// </summary>
public class UnderstandingJob
{
    public AppBuildKind Kind { get; init; } = AppBuildKind.Understanding;
    public UnderstandingStatus Status { get; private set; } = UnderstandingStatus.Running;
    public string? Error { get; private set; }
    /// <summary>The subagent's closing line on a done run (what it decided / built).</summary>
    public string? Summary { get; private set; }
    public DateTimeOffset StartedAt { get; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; private set; }

    /// <summary>The backing background task; cancellation source for it.</summary>
    public Task? Run { get; set; }
    public CancellationTokenSource Cts { get; } = new();

    /// <summary>Correlation id of this run's agentic-audit call (openspec
    /// add-agent-audit-trail) — lets the trail endpoint distinguish a live
    /// "running" call from a start orphaned by a harness restart.</summary>
    public string? AuditCallId { get; set; }

    public void MarkDone(string? summary = null)
    {
        Summary = summary;
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
