using System.Collections.Concurrent;

namespace ClaudeWeb.Services.Events;

/// <summary>
/// A per-repository, in-memory log of lifecycle events for harness-owned
/// background operations (openspec change agent-dock-event-console). Each repo has
/// its own append-only ring of small records; a dock's Console lane reads them by
/// a sequence watermark (<c>?after=N</c>), the same reattach contract chat and
/// discovery-status already use.
///
/// Scope is deliberately SHALLOW and harness-owned: events record the boundary
/// OUR code controls — that an operation was invoked and is awaiting a response,
/// then that it returned and what we did with the result. We never reach inside
/// the ClaudeMonitor gateway to log its tool calls or tokens; that is the
/// gateway's own domain and a much larger change.
///
/// We borrow the SHAPE of <see cref="Chat.RunSessionService"/> (monotonic seq +
/// soft cap + watermark) but not its machinery: this is append-only with no live
/// push channel — polling at the dock cadence is enough for slice 1.
///
/// In-memory only: a harness restart simply means "nothing happening now". The
/// model is source-agnostic (<see cref="EventRecord.Op"/> / <c>Phase</c> are open
/// strings) so autopilot, loops, or any future operation can emit without a
/// change here.
/// </summary>
public class RepoEventLog
{
    // Soft cap per repo. When exceeded, the oldest chunk is dropped; seq keeps
    // increasing so a client watermark past the trimmed range still works.
    private const int Cap = 500;
    private const int TrimChunk = 100;

    private sealed class RepoLog
    {
        public readonly object Lock = new();
        public readonly List<EventRecord> Events = new();
        public int Seq;
    }

    private readonly ConcurrentDictionary<string, RepoLog> _logs = new();

    /// <summary>
    /// Append one boundary event for <paramref name="repoId"/>, tagged with the
    /// next per-repo sequence number. Best-effort: this is instrumentation and
    /// MUST NOT throw into the operation being instrumented, so any failure is
    /// swallowed.
    /// </summary>
    public void Emit(string repoId, string op, string phase, string title, string detail)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return;
        try
        {
            var log = _logs.GetOrAdd(repoId, _ => new RepoLog());
            lock (log.Lock)
            {
                var rec = new EventRecord(
                    ++log.Seq,
                    DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    op, phase, title, detail);
                log.Events.Add(rec);
                if (log.Events.Count > Cap) log.Events.RemoveRange(0, TrimChunk);
            }
        }
        catch
        {
            // Never surface a logging failure to the caller.
        }
    }

    /// <summary>
    /// The events for <paramref name="repoId"/> whose seq is greater than
    /// <paramref name="after"/>, plus the current highest seq for that repo.
    /// An <paramref name="after"/> of -1 (or below the earliest retained event)
    /// returns the full retained log. A repo with no events reads as empty,
    /// lastSeq 0.
    /// </summary>
    public (IReadOnlyList<EventRecord> Events, int LastSeq) Read(string repoId, int after)
    {
        if (string.IsNullOrWhiteSpace(repoId) || !_logs.TryGetValue(repoId, out var log))
            return (Array.Empty<EventRecord>(), 0);

        lock (log.Lock)
        {
            var fresh = after <= 0
                ? log.Events.ToList()
                : log.Events.Where(e => e.Seq > after).ToList();
            return (fresh, log.Seq);
        }
    }
}

/// <summary>
/// One boundary event. <see cref="Op"/> and <see cref="Phase"/> are open strings
/// (not enums) so new emit sources can introduce their own kinds without changing
/// this model or the frontend renderer.
/// </summary>
/// <param name="Seq">Monotonic per-repo sequence number.</param>
/// <param name="At">Unix epoch milliseconds when emitted.</param>
/// <param name="Op">Operation kind, e.g. "discovery" | "run" | "check".</param>
/// <param name="Phase">Lifecycle phase, e.g. "started" | "done" | "error".</param>
/// <param name="Title">Short human label, e.g. "Discovery", "Run · homepage".</param>
/// <param name="Detail">Boundary narration of what the harness did/observed.</param>
public sealed record EventRecord(
    int Seq, long At, string Op, string Phase, string Title, string Detail);
