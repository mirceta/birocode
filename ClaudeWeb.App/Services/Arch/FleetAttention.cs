using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The hub's own record of "finished, not yet checked" (openspec status-mark-from-events,
/// fleet task 9c1120fe): per agent — keyed like the board's assignees, <c>sourceId|repoId</c>
/// with an empty sourceId for this machine — when its last genuine turn ended and through
/// which finish the Operator acknowledged it, both in the producing machine's clock.
///
/// The Status tab's mark is normally the dock's server-owned <c>unseenResult</c> latch
/// (openspec status-agents-attention): set on the machine that ran the turn and read off its
/// describe. That latch cannot speak for every agent: a peer on a build that predates it
/// reports nothing (<c>null</c>), and a repo that holds no dock has no tab to latch. For those
/// the hub raises the mark itself from the one signal every build has sent since the event
/// feed existed — the <c>turn.ended</c> events the collector already pulls from every machine.
/// Where the dock's latch does speak it stays authoritative and this record only follows it.
///
/// Persisted to <c>fleet-attention.json</c> under the data dir so a hub restart neither forgets a
/// mark nor re-raises one the Operator already checked: a source's retained feed is pulled
/// from its start again after a restart (a BACKLOG), and only what ended after the last event
/// the hub had seen from that source counts. A source met for the first time is a baseline —
/// its history is not turned into marks.
/// </summary>
public sealed class FleetAttention
{
    public sealed record Entry(
        [property: JsonPropertyName("finishedAt")] long FinishedAt,
        [property: JsonPropertyName("status")] string Status,
        [property: JsonPropertyName("ackedAt")] long AckedAt)
    {
        /// <summary>A finish the Operator has not acknowledged (through this hub) yet.</summary>
        [JsonIgnore] public bool Pending => FinishedAt > AckedAt;
    }

    private sealed class State
    {
        [JsonPropertyName("sources")] public Dictionary<string, long> Sources { get; set; } = new(StringComparer.Ordinal);
        [JsonPropertyName("agents")] public Dictionary<string, Entry> Agents { get; set; } = new(StringComparer.Ordinal);
    }

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private State _state = new();

    public FleetAttention(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "fleet-attention.json");
        Load();
    }

    /// <summary>The board's assignee key: "" for this machine, else the source id.</summary>
    public static string Key(string? sourceId, string repoId) => OccupancyStore.Key(sourceId, repoId);

    // ---- the rules (pure, unit-tested) ------------------------------------------------------

    /// <summary>A turn end the dock latch would have recorded: a <c>turn.ended</c> of a builder
    /// turn (not the read-only ask lane) that ended <c>done</c> or <c>error</c>. The event cannot
    /// tell a turn the Operator stopped by hand from one that failed (both end <c>error</c>), so a
    /// stopped turn is marked too — the honest side to err on.</summary>
    public static bool IsGenuineFinish(string? type, object? data)
    {
        if (!string.Equals(type, "turn.ended", StringComparison.Ordinal)) return false;
        JsonElement d;
        try { d = data is JsonElement je ? je : JsonSerializer.SerializeToElement(data); }
        catch { return false; }
        if (d.ValueKind != JsonValueKind.Object) return false;
        if (d.TryGetProperty("readOnly", out var ro) && ro.ValueKind == JsonValueKind.True) return false;
        var status = d.TryGetProperty("status", out var st) && st.ValueKind == JsonValueKind.String ? st.GetString() : null;
        return status is "done" or "error";
    }

    /// <summary>
    /// Whether an agent shows the mark. The dock's latch speaks when the machine reports it
    /// (<paramref name="dockLatch"/> non-null — null is a peer build that predates the field)
    /// and the repo holds a dock there (<paramref name="docked"/> false = no tab to latch; null =
    /// not reported, taken as docked). When it speaks it decides; otherwise the hub's own record
    /// (<paramref name="derivedPending"/>) does.
    /// </summary>
    public static bool Resolve(bool? dockLatch, bool? docked, bool derivedPending) =>
        LatchSpeaks(dockLatch, docked) ? dockLatch!.Value : derivedPending;

    public static bool LatchSpeaks(bool? dockLatch, bool? docked) => dockLatch is not null && docked != false;

    // ---- ingest ------------------------------------------------------------------------------

    /// <summary>
    /// Folds one source's batch of collector events in. <paramref name="backlog"/> = the batch
    /// is the source's retained feed from its start: then only events after the last one this
    /// hub had seen from the source count, and a source never seen before only sets that
    /// baseline. Returns how many agents were newly marked.
    /// </summary>
    public int Ingest(string sourceId, IReadOnlyList<CollectorService.CollectorEvent> events, bool backlog)
    {
        if (events.Count == 0) return 0;
        lock (_gate)
        {
            var hadSeen = _state.Sources.TryGetValue(sourceId, out var seen);
            var max = hadSeen ? seen : 0;
            var marked = 0;
            var changed = false;
            foreach (var ev in events)
            {
                if (ev.At > max) max = ev.At;
                if (!IsGenuineFinish(ev.Type, ev.Data)) continue;
                var repoId = ev.RepoId ?? CollectorService.RepoIdOf(ev.Source);
                if (string.IsNullOrWhiteSpace(repoId)) continue;
                if (backlog && (!hadSeen || ev.At <= seen)) continue;
                var key = Key(sourceId, repoId);
                _state.Agents.TryGetValue(key, out var e);
                if (e is not null && ev.At <= e.FinishedAt) continue;
                var status = StatusOf(ev.Data);
                _state.Agents[key] = new Entry(ev.At, status, e?.AckedAt ?? 0);
                changed = true;
                if (e is null || !e.Pending) marked++;
            }
            if (!hadSeen || max != seen) { _state.Sources[sourceId] = max; changed = true; }
            if (changed) Save();
            if (marked > 0) _logger.Info($"[ATTENTION] {marked} agent(s) on {sourceId} finished a turn (from the event feed){(backlog ? " while this harness was away" : "")}");
            return marked;
        }
    }

    private static string StatusOf(object? data)
    {
        try
        {
            var d = data is JsonElement je ? je : JsonSerializer.SerializeToElement(data);
            return d.ValueKind == JsonValueKind.Object && d.TryGetProperty("status", out var st) && st.ValueKind == JsonValueKind.String ? st.GetString() ?? "done" : "done";
        }
        catch { return "done"; }
    }

    // ---- read + acknowledge -------------------------------------------------------------------

    public Entry? Get(string? sourceId, string repoId)
    {
        lock (_gate) return _state.Agents.TryGetValue(Key(sourceId, repoId), out var e) ? e : null;
    }

    /// <summary>A finish nobody acknowledged through this hub yet.</summary>
    public bool Pending(string? sourceId, string repoId) => Get(sourceId, repoId)?.Pending == true;

    /// <summary>The Operator's acknowledgement (or the dock latch's word that there is nothing
    /// unchecked): the record is acknowledged through its latest finish. True when it changed.</summary>
    public bool Ack(string? sourceId, string repoId)
    {
        var key = Key(sourceId, repoId);
        lock (_gate)
        {
            if (!_state.Agents.TryGetValue(key, out var e) || !e.Pending) return false;
            _state.Agents[key] = e with { AckedAt = e.FinishedAt };
            Save();
            return true;
        }
    }

    public IReadOnlyDictionary<string, Entry> All()
    {
        lock (_gate) return new Dictionary<string, Entry>(_state.Agents, StringComparer.Ordinal);
    }

    private void Load()
    {
        try
        {
            if (File.Exists(_path))
                _state = JsonSerializer.Deserialize<State>(File.ReadAllText(_path)) ?? new State();
            _state.Sources ??= new(StringComparer.Ordinal);
            _state.Agents ??= new(StringComparer.Ordinal);
        }
        catch (Exception ex) { _logger.Error($"[ATTENTION] {_path} unreadable ({ex.Message}); starting empty — the file is left untouched until the next change"); }
    }

    // Caller holds _gate. Atomic temp+rename.
    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_state, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex) { _logger.Error($"[ATTENTION] failed to save {_path}: {ex.Message}"); }
    }
}
