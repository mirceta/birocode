using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// One backend-owned chat turn (a "Run") for one repo. Owns the run's
/// cancellation source, status, and a seq-numbered buffer of every SSE event
/// emitted, so clients can detach and reattach freely (see
/// plans/detached-runs.md). The Run never depends on an HTTP connection:
/// disconnects drop only the attachment, and only <see cref="Cts"/> (user
/// Stop / app shutdown) kills the CLI process.
/// </summary>
public class RunSession
{
    private static readonly JsonSerializerOptions SseJson = new()
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    // Soft cap on buffered events. When exceeded, the oldest are dropped --
    // a reattach that far behind reloads the transcript from disk instead.
    private const int MaxBufferedEvents = 10_000;
    private const int TrimChunk = 1_000;

    private readonly object _lock = new();
    private readonly List<(int Seq, string Json)> _events = new();
    private readonly List<Channel<string>> _subscribers = new();
    private int _seq;
    private bool _sawDone;

    /// <param name="startSeq">Seq to continue counting from (the previous
    /// run's last seq). Seq is monotonic per repo across runs so a client
    /// holding an old watermark never discards a new run's events.</param>
    public RunSession(string repoId, int startSeq = 0)
    {
        RepoId = repoId;
        _seq = startSeq;
    }

    public string RepoId { get; }

    /// <summary>"running" | "done" | "error".</summary>
    public string Status { get; private set; } = "running";

    /// <summary>Claude session id, captured from the "session" event.</summary>
    public string? SessionId { get; private set; }

    /// <summary>Cancels the run (kills the CLI process tree). Fired only by an
    /// explicit user Stop or app shutdown -- never by a client disconnect.</summary>
    public CancellationTokenSource Cts { get; } = new();

    public int LastSeq { get { lock (_lock) return _seq; } }

    /// <summary>
    /// Appends one stable SSE event to the buffer (tagged with the next seq)
    /// and broadcasts it to all attached clients. Also sniffs the event to
    /// capture the session id and notice the terminal "done".
    /// </summary>
    public Task EmitAsync(object evt)
    {
        var node = JsonSerializer.SerializeToNode(evt, SseJson)!.AsObject();
        lock (_lock)
        {
            node["seq"] = ++_seq;
            var json = node.ToJsonString();

            var type = (string?)node["type"];
            if (type == "session" || type == "done")
            {
                var sid = (string?)node["sessionId"];
                if (!string.IsNullOrEmpty(sid)) SessionId = sid;
            }
            if (type == "done") _sawDone = true;

            _events.Add((_seq, json));
            if (_events.Count > MaxBufferedEvents) _events.RemoveRange(0, TrimChunk);

            foreach (var ch in _subscribers) ch.Writer.TryWrite(json);
        }
        return Task.CompletedTask;
    }

    /// <summary>
    /// Marks the run finished (after the CLI process has fully ended) and
    /// closes all attached streams. "done" only if the terminal done event was
    /// emitted; a cancelled, crashed, or is_error run finalizes as "error".
    /// </summary>
    public void Complete()
    {
        lock (_lock)
        {
            if (Status != "running") return;
            Status = _sawDone ? "done" : "error";
            foreach (var ch in _subscribers) ch.Writer.TryComplete();
            _subscribers.Clear();
        }
    }

    /// <summary>
    /// One attachment: replays buffered events with seq &gt; <paramref name="after"/>,
    /// then streams live events until the run completes or the client drops.
    /// Snapshot and subscription happen under one lock, so no event is missed
    /// or duplicated across the replay/live boundary.
    /// </summary>
    public async IAsyncEnumerable<string> StreamAsync(
        int after, [EnumeratorCancellation] CancellationToken ct = default)
    {
        List<string> replay;
        Channel<string>? channel = null;
        lock (_lock)
        {
            replay = _events.Where(e => e.Seq > after).Select(e => e.Json).ToList();
            if (Status == "running")
            {
                channel = Channel.CreateUnbounded<string>();
                _subscribers.Add(channel);
            }
        }

        try
        {
            foreach (var json in replay)
            {
                ct.ThrowIfCancellationRequested();
                yield return json;
            }
            if (channel is null) yield break; // run already finished: replay only

            await foreach (var json in channel.Reader.ReadAllAsync(ct))
                yield return json;
        }
        finally
        {
            if (channel is not null)
                lock (_lock) _subscribers.Remove(channel);
        }
    }
}

/// <summary>
/// Registry of Run Sessions, one slot per repo. Replaces the old
/// CliRunnerService._busyRepos set as the per-repo single-flight gate: a repo
/// is busy iff its session is "running". A finished session is kept (so late
/// clients can replay the turn) until the next run for that repo starts.
/// Cancels all running sessions on app shutdown so no CLI process leaks.
/// </summary>
public class RunSessionService
{
    private readonly object _gate = new();
    private readonly Dictionary<string, RunSession> _sessions = new();

    public RunSessionService(IHostApplicationLifetime lifetime)
    {
        lifetime.ApplicationStopping.Register(StopAll);
    }

    /// <summary>
    /// A run "lane" lets one repo host two independent conversations at once: the
    /// default <c>builder</c> (full-capability, the only writer) and a read-only
    /// <c>ask</c> side conversation (plans/repo-ask-chat.md). Lanes get separate
    /// run slots, sessions, and seq streams. The builder keeps the bare repoId as
    /// its dictionary key, so existing clients and per-repo seq continuity are
    /// unaffected; other lanes are suffixed.
    /// </summary>
    private static string Key(string repoId, string lane) =>
        string.IsNullOrEmpty(lane) || lane == "builder" ? repoId : $"{repoId}#{lane}";

    /// <summary>
    /// Atomically claims the run slot for a (repo, lane). False if a run is
    /// already in progress on that lane; otherwise creates a fresh session
    /// (discarding the previous finished one) and returns it. Different lanes of
    /// the same repo (builder + ask) can run concurrently.
    /// </summary>
    public bool TryBeginRun(string repoId, string lane, out RunSession session)
    {
        var key = Key(repoId, lane);
        lock (_gate)
        {
            if (_sessions.TryGetValue(key, out var existing) && existing.Status == "running")
            {
                session = existing;
                return false;
            }
            session = new RunSession(repoId, existing?.LastSeq ?? 0);
            _sessions[key] = session;
            return true;
        }
    }

    public RunSession? Get(string repoId, string lane = "builder")
    {
        lock (_gate) return _sessions.GetValueOrDefault(Key(repoId, lane));
    }

    public bool IsBusy(string repoId, string lane = "builder") => Get(repoId, lane)?.Status == "running";

    /// <summary>Per-(repo, lane) run state for GET /api/runs. The builder lane is
    /// keyed by the bare repoId; other lanes (e.g. ask) are keyed
    /// <c>repoId#lane</c> so the frontend can reconcile each independently.</summary>
    public Dictionary<string, object> Snapshot()
    {
        lock (_gate)
        {
            return _sessions.ToDictionary(
                kv => kv.Key,
                kv => (object)new
                {
                    status = kv.Value.Status,
                    sessionId = kv.Value.SessionId,
                    lastSeq = kv.Value.LastSeq,
                });
        }
    }

    private void StopAll()
    {
        List<RunSession> running;
        lock (_gate) running = _sessions.Values.Where(s => s.Status == "running").ToList();
        foreach (var s in running)
        {
            try { s.Cts.Cancel(); } catch { /* already disposed */ }
        }
    }
}
