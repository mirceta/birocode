namespace ClaudeWeb.Services.Events;

/// <summary>
/// A single, HARNESS-WIDE, in-memory feed of harness events (openspec change
/// add-harness-event-feed). Where <see cref="RepoEventLog"/> is per-repo and
/// records harness-owned background operations for the dock's Console lane, this
/// is one stream for the whole harness, designed to be read by an OUTSIDE
/// observer — the pilot consumer app today, a cross-harness collector service on
/// another machine later.
///
/// It is the GENERAL MECHANISM: every event shares one stable envelope
/// (<see cref="HarnessEvent"/>) and the <c>type</c> field is the extension point.
/// A future kind of event is expressed by introducing a new <c>type</c> and its
/// <c>data</c> shape — no change to the envelope, the read contract, or readers'
/// parsing of the envelope. The pilot seeds exactly one type: <c>turn.ended</c>.
///
/// Like <see cref="RepoEventLog"/> it borrows the proven SHAPE (monotonic seq +
/// soft cap + watermark read) but is append-only with no live push — polling by
/// watermark (<c>GET /api/events?after=N</c>) is the pilot transport. In-memory
/// only: a restart simply means the feed starts empty.
/// </summary>
public class HarnessEventFeed
{
    // Soft cap for the whole harness. When exceeded the oldest chunk is dropped;
    // seq keeps increasing so a client watermark past the trimmed range still works.
    private const int Cap = 1000;
    private const int TrimChunk = 200;

    private readonly object _lock = new();
    private readonly List<HarnessEvent> _events = new();
    private int _seq;

    /// <summary>
    /// Append one event to the feed under the next harness-wide sequence number.
    /// Best-effort: this is observation, not the operation itself, so it MUST NOT
    /// throw into the caller — any failure is swallowed.
    /// </summary>
    /// <param name="type">The event kind, e.g. "turn.ended" (the extension point).</param>
    /// <param name="source">Where it originated, at least { repoId, repoName }.</param>
    /// <param name="data">Type-specific payload; its shape depends on <paramref name="type"/>.</param>
    public void Publish(string type, object source, object data)
    {
        if (string.IsNullOrWhiteSpace(type)) return;
        try
        {
            lock (_lock)
            {
                var ev = new HarnessEvent(
                    ++_seq,
                    DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    type, source, data);
                _events.Add(ev);
                if (_events.Count > Cap) _events.RemoveRange(0, TrimChunk);
            }
        }
        catch
        {
            // Never surface a feed failure to the caller (e.g. a chat run).
        }
    }

    /// <summary>
    /// The events whose seq is greater than <paramref name="after"/>, plus the
    /// current highest seq. An <paramref name="after"/> of -1 (or below the
    /// earliest retained event) returns the full retained feed. An empty feed
    /// reads as empty, lastSeq 0 — so a fresh client can poll from -1 and advance.
    /// </summary>
    public (IReadOnlyList<HarnessEvent> Events, int LastSeq) Read(int after)
    {
        lock (_lock)
        {
            var fresh = after <= 0
                ? _events.ToList()
                : _events.Where(e => e.Seq > after).ToList();
            return (fresh, _seq);
        }
    }
}

/// <summary>
/// One harness event. The envelope is stable; <see cref="Type"/> is the extension
/// point and <see cref="Data"/> carries the type-specific payload.
/// </summary>
/// <param name="Seq">Monotonic, harness-wide sequence number.</param>
/// <param name="At">Unix epoch milliseconds when published.</param>
/// <param name="Type">Event kind, e.g. "turn.ended".</param>
/// <param name="Source">Origin of the event, at least { repoId, repoName }.</param>
/// <param name="Data">Type-specific payload (shape determined by <see cref="Type"/>).</param>
public sealed record HarnessEvent(int Seq, long At, string Type, object Source, object Data);
