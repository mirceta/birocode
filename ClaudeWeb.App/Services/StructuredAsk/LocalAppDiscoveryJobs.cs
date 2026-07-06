using System.Collections.Concurrent;
using ClaudeWeb.Services.AgenticAudit;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// Backend-owned registry of local-app discovery scans, one job per repository
/// (openspec change discover-local-apps-resilient). Discovery used to be bound to
/// the HTTP request: a browser refresh aborted the fetch, <c>RequestAborted</c>
/// cancelled the still-running agent scan, and the result (held only in frontend
/// state) was lost. This service moves ownership server-side — the scan runs on a
/// background task with the job's OWN cancellation token (never the request's), so
/// a disconnect leaves it running to completion, and the dock reattaches on load.
///
/// We borrow the ownership/reattach IDEA from <see cref="Chat.RunSessionService"/>
/// but not its machinery: discovery is one-shot with a typed JSON result, not a
/// seq-numbered streaming event log, so a small purpose-built store fits.
///
/// In-memory and latest-only per repo: a harness restart simply means "no recent
/// discovery", and only the most recent job per repo is retained (the next start
/// overwrites it) so jobs never accumulate.
/// </summary>
public class LocalAppDiscoveryJobs
{
    private readonly LocalAppDiscoveryAsk _discovery;
    private readonly RepoEventLog _events;
    private readonly AgenticAuditLog _audit;
    private readonly ConcurrentDictionary<string, DiscoveryJob> _jobs = new();

    public LocalAppDiscoveryJobs(LocalAppDiscoveryAsk discovery, RepoEventLog events, AgenticAuditLog audit)
    {
        _discovery = discovery;
        _events = events;
        _audit = audit;
    }

    /// <summary>
    /// Join the repo's discovery if one is already running, otherwise start a new
    /// one on a background task and return it. Satisfies "only one discovery per
    /// repository at a time" (the join case) and the disconnect-survival fix (the
    /// scan runs under the job's own token). Actor + IP come from the controller
    /// (identity is request-scoped) and are recorded in the agentic audit trail —
    /// only on an actual start, never on a join (openspec add-agent-audit-trail).
    /// </summary>
    public DiscoveryJob StartOrJoin(string repoId, string repoName, string workingDirectory, string actor, string ip)
    {
        // AddOrUpdate so the start-or-join decision is atomic per repo: a Running
        // job is returned as-is; any terminal (Done/Error) job is replaced by a
        // fresh scan (latest-only — the old result is discarded).
        return _jobs.AddOrUpdate(
            repoId,
            _ => StartNew(repoId, repoName, workingDirectory, actor, ip),
            (_, existing) => existing.Status == DiscoveryStatus.Running
                ? existing
                : StartNew(repoId, repoName, workingDirectory, actor, ip));
    }

    /// <summary>The most recent job for the repo, or null if none has ever run.</summary>
    public DiscoveryJob? Get(string repoId) =>
        _jobs.TryGetValue(repoId, out var job) ? job : null;

    private DiscoveryJob StartNew(string repoId, string repoName, string workingDirectory, string actor, string ip)
    {
        var job = new DiscoveryJob();
        // Event Console (openspec agent-dock-event-console): emit at the boundary we
        // own. "started" fires only here — on a genuine NEW scan — so joining an
        // already-running job does not emit a duplicate start.
        _events.Emit(repoId, "discovery", "started", "Discovery",
            "invoked — awaiting the agent gateway…");
        // Agentic audit (openspec add-agent-audit-trail): durable "started" entry,
        // same only-on-actual-start boundary. The callId lives on the job so the
        // trail endpoint can tell a live "running" from a crash-orphaned start.
        job.AuditCallId = _audit.RecordStart("discover-local-apps", repoId, repoName, actor, ip);
        void AuditEnd(string outcome, string? error = null) =>
            _audit.RecordEnd(job.AuditCallId!, "discover-local-apps", repoId, repoName, actor, ip,
                outcome, (long)(DateTimeOffset.UtcNow - job.StartedAt).TotalMilliseconds, error);
        // Fire-and-forget on a background task with the job's OWN token. We never
        // pass the request's abort token in, so a client disconnect can't cancel it.
        job.Run = Task.Run(async () =>
        {
            try
            {
                var result = await _discovery.DiscoverAsync(workingDirectory, job.Cts.Token);
                if (result.Success)
                {
                    job.MarkDone(result.Report!);
                    var n = result.Report!.Apps.Count;
                    _events.Emit(repoId, "discovery", "done", "Discovery",
                        $"returned {n} app{(n == 1 ? "" : "s")} — produced for the dock to render");
                    AuditEnd("done");
                }
                else
                {
                    var err = result.Error ?? "discovery failed";
                    job.MarkError(err);
                    _events.Emit(repoId, "discovery", "error", "Discovery", err);
                    AuditEnd("error", err);
                }
            }
            catch (OperationCanceledException)
            {
                job.MarkError("discovery cancelled");
                _events.Emit(repoId, "discovery", "error", "Discovery", "discovery cancelled");
                AuditEnd("canceled");
            }
            catch (Exception ex)
            {
                var err = $"{ex.GetType().Name}: {ex.Message}";
                job.MarkError(err);
                _events.Emit(repoId, "discovery", "error", "Discovery", err);
                AuditEnd("error", err);
            }
        });
        return job;
    }
}

public enum DiscoveryStatus { Running, Done, Error }

/// <summary>
/// One repository's most recent discovery scan. Lives independently of any HTTP
/// request: <see cref="Cts"/> is the only cancellation source (effectively never
/// fired in v1 — see the design's "no user cancel" trade-off).
/// </summary>
public class DiscoveryJob
{
    public DiscoveryStatus Status { get; private set; } = DiscoveryStatus.Running;
    public LocalAppExposureReport? Result { get; private set; }
    public string? Error { get; private set; }
    public DateTimeOffset StartedAt { get; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; private set; }

    /// <summary>The backing background task; cancellation source for it.</summary>
    public Task? Run { get; set; }
    public CancellationTokenSource Cts { get; } = new();

    /// <summary>Correlation id of this run's agentic-audit call (openspec
    /// add-agent-audit-trail) — lets the trail endpoint distinguish a live
    /// "running" call from a start orphaned by a harness restart.</summary>
    public string? AuditCallId { get; set; }

    public void MarkDone(LocalAppExposureReport report)
    {
        Result = report;
        Status = DiscoveryStatus.Done;
        FinishedAt = DateTimeOffset.UtcNow;
    }

    public void MarkError(string error)
    {
        Error = error;
        Status = DiscoveryStatus.Error;
        FinishedAt = DateTimeOffset.UtcNow;
    }
}
