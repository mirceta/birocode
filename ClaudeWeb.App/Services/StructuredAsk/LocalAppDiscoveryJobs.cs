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
    private readonly LocalAppDiscoveryCache _cache;
    private readonly ConcurrentDictionary<string, DiscoveryJob> _jobs = new();

    public LocalAppDiscoveryJobs(LocalAppDiscoveryAsk discovery, RepoEventLog events, AgenticAuditLog audit, LocalAppDiscoveryCache cache)
    {
        _discovery = discovery;
        _events = events;
        _audit = audit;
        _cache = cache;
    }

    /// <summary>
    /// Seed a Done job from a cached discovery WITHOUT running the agent (openspec
    /// change cache-discovered-local-apps). After a "Load cache" the dock's per-row
    /// Run / Check / register affordances must work identically to a live scan — and
    /// Run resolves its command server-side from the repo's latest job by port, never
    /// from the wire. Seeding a Done job from the cache keeps that guarantee (the
    /// command still comes from a real scan, just a persisted one). Overwrites any
    /// terminal job; a still-running scan is left untouched so a cache load never
    /// clobbers a live discovery.
    /// </summary>
    public DiscoveryJob SeedFromCache(string repoId, CachedDiscovery cached) =>
        _jobs.AddOrUpdate(
            repoId,
            _ => DiscoveryJob.Completed(cached),
            (_, existing) => existing.Status == DiscoveryStatus.Running
                ? existing
                : DiscoveryJob.Completed(cached));

    /// <summary>
    /// Drop one finding from the repo's in-memory result after a cache delete
    /// (openspec discover-apps-panel, D5) — so a deleted record cannot resurface on
    /// the next status poll or be relaunched via Run-by-port. The job swaps in a
    /// filtered copy of its result; a running or absent job is left alone (a running
    /// scan has no result yet, and its eventual Save re-merges against the already-
    /// edited cache).
    /// </summary>
    public void RemoveFromResult(string repoId, int port)
    {
        if (_jobs.TryGetValue(repoId, out var job)) job.RemoveResultApp(port);
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
                    // Union-merge into the durable per-repo cache FIRST (openspec
                    // discover-apps-panel, D3) — the WRITE is best-effort inside the
                    // service, but the returned merge always succeeds — then mark the
                    // job done with the MERGED set, so status reads, Run-by-port and
                    // Check resolve every cached port, not just this scan's.
                    var merged = _cache.Save(repoId, result.Report!, DateTimeOffset.UtcNow);
                    job.MarkDone(merged);
                    var n = result.Report!.Apps.Count;
                    var total = merged.Report.Apps.Count;
                    _events.Emit(repoId, "discovery", "done", "Discovery",
                        $"returned {n} app{(n == 1 ? "" : "s")} — merged into cache ({total} total)");
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

    /// <summary>Per-port last-discovered times for <see cref="Result"/>'s findings —
    /// under the union cache (openspec discover-apps-panel) rows can come from
    /// different scans, so the panel shows each row's own age. Null only for a
    /// not-yet-done job.</summary>
    public IReadOnlyDictionary<int, DateTimeOffset>? DiscoveredAt { get; private set; }

    /// <summary>The cache's latest-successful-scan time for this result — the truthful
    /// "latest scan" for the panel (a cache-seeded job's <see cref="FinishedAt"/> is
    /// only the seed time, not when the scan actually ran).</summary>
    public DateTimeOffset? CachedAt { get; private set; }

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

    /// <summary>
    /// A job that is already Done, holding a report from a cached discovery rather
    /// than a live agent run (openspec change cache-discovered-local-apps). No
    /// background task or audit call is attached — it exists only so the dock's
    /// Run / Check affordances can resolve against a repo's latest result after a
    /// "Load cache".
    /// </summary>
    public static DiscoveryJob Completed(CachedDiscovery cached)
    {
        var job = new DiscoveryJob();
        job.MarkDone(cached);
        return job;
    }

    public void MarkDone(CachedDiscovery cached)
    {
        Result = cached.Report;
        DiscoveredAt = cached.DiscoveredAtByPort;
        CachedAt = cached.CachedAt;
        Status = DiscoveryStatus.Done;
        FinishedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>Swap in a filtered COPY of the result without the given port (cache
    /// delete, openspec discover-apps-panel). A copy — not an in-place list edit — so
    /// a concurrent status projection never enumerates a mutating list. No-op unless
    /// the job is Done with a result.</summary>
    public void RemoveResultApp(int port)
    {
        if (Status != DiscoveryStatus.Done || Result is null) return;
        Result = new LocalAppExposureReport { Apps = Result.Apps.Where(a => a.Port != port).ToList() };
        if (DiscoveredAt is not null)
            DiscoveredAt = DiscoveredAt.Where(kv => kv.Key != port).ToDictionary(kv => kv.Key, kv => kv.Value);
    }

    public void MarkError(string error)
    {
        Error = error;
        Status = DiscoveryStatus.Error;
        FinishedAt = DateTimeOffset.UtcNow;
    }
}
