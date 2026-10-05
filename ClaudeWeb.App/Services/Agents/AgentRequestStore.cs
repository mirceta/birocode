using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Agents;

/// <summary>
/// Repo-agent → arch requests (openspec repo-agent-requests): the PERSISTED record of every
/// request a repo agent sent UP to its managing arch, kept per harness under the data dir
/// (<c>%APPDATA%\ClaudeWeb\agent-requests.json</c>) so it survives a restart. Two kinds of row
/// live here: a request an agent on THIS machine recorded (<see cref="AgentRequest.SourceId"/>
/// null — the local origin), and a copy the hub pulled from a managed peer (SourceId = the
/// collector source), because the fleet channel runs hub→peer only. A request is
/// <c>pending</c> until the Operator decides: <c>approved</c> (then delivered into the arch
/// conversation, <see cref="AgentRequest.DeliveredAt"/>) or <c>dismissed</c> (never reaches the
/// arch). Recording a request NEVER starts an arch turn — the store is inert data; the engine
/// tick delivers approved rows when the arch's slot is free. Thread-safe under one lock; the
/// file is rewritten on every change (a few KB).
/// </summary>
public sealed class AgentRequestStore
{
    public const string FileName = "agent-requests.json";
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Dismissed = "dismissed";
    public const int MaxTextChars = 4000;
    public const int MaxTitleChars = 120;
    /// <summary>An agent may hold this many pending requests at once.</summary>
    public const int MaxPendingPerAgent = 20;
    /// <summary>Decided rows beyond this count are dropped, oldest first (pending rows are never dropped).</summary>
    public const int MaxDecidedKept = 500;

    /// <param name="Id">Minted where the request was recorded; a pulled copy keeps it, so a decision names the same row on both harnesses.</param>
    /// <param name="SourceId">null = recorded on this harness; else the collector source it was pulled from.</param>
    /// <param name="Machine">The label of the machine the agent runs on.</param>
    /// <param name="Agent">The agent's handle on its machine (prg#1).</param>
    /// <param name="DecidedBy">The machine whose Operator decided (label), when decided.</param>
    /// <param name="DeliveredAt">When the approved request was posted into the arch conversation (hub side).</param>
    /// <param name="DecisionSynced">Hub side, pulled rows: the decision was pushed back to the agent's harness.</param>
    /// <param name="Mode">How an approved request reached the arch (openspec repo-agent-requests-goal-drive): <c>message</c> = one message into the Operator-facing conversation; <c>goal</c> = a goal conversation drives it to completion.</param>
    /// <param name="GoalId">The arch goal that drives it, mode goal.</param>
    public sealed record AgentRequest(
        string Id, string? SourceId, string Machine, string RepoId, string Agent, string? Title, string Text,
        long CreatedAt, string Status, long? DecidedAt = null, string? DecidedBy = null, long? DeliveredAt = null,
        bool DecisionSynced = false, string? ConversationId = null, string? Mode = null, string? GoalId = null);

    public const string ModeMessage = "message";
    public const string ModeGoal = "goal";

    private sealed record Persisted(List<AgentRequest> Requests);

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly Func<long> _now;
    private readonly object _gate = new();
    private List<AgentRequest> _rows = new();

    /// <param name="dataDir">overrides the data dir (tests)</param>
    public AgentRequestStore(Logger logger, string? dataDir = null, Func<long>? now = null)
    {
        _logger = logger;
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _path = Path.Combine(dataDir ?? AppPaths.DataDir, FileName);
        Load();
    }

    public string FilePath => _path;

    // ---- reads ---------------------------------------------------------------------------------

    public IReadOnlyList<AgentRequest> All()
    {
        lock (_gate) return _rows.OrderByDescending(r => r.CreatedAt).ToList();
    }

    public AgentRequest? Get(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        lock (_gate) return _rows.FirstOrDefault(r => r.Id == id);
    }

    /// <summary>The rows recorded on this harness (what a hub pulls), newest first.</summary>
    public IReadOnlyList<AgentRequest> Local()
    {
        lock (_gate) return _rows.Where(r => r.SourceId is null).OrderByDescending(r => r.CreatedAt).ToList();
    }

    /// <summary>Approved rows not yet delivered into the arch conversation, oldest first.</summary>
    public IReadOnlyList<AgentRequest> ApprovedUndelivered()
    {
        lock (_gate) return _rows.Where(r => r.Status == Approved && r.DeliveredAt is null).OrderBy(r => r.DecidedAt ?? r.CreatedAt).ToList();
    }

    /// <summary>Pulled rows whose decision has not reached the agent's harness yet.</summary>
    public IReadOnlyList<AgentRequest> DecisionsToPush()
    {
        lock (_gate) return _rows.Where(r => r.SourceId is not null && r.Status != Pending && !r.DecisionSynced).ToList();
    }

    public int PendingCount(string? repoId = null)
    {
        lock (_gate) return _rows.Count(r => r.Status == Pending && r.SourceId is null && (repoId is null || r.RepoId == repoId));
    }

    // ---- the agent's write ---------------------------------------------------------------------

    /// <summary>Record a request from an agent on this harness. Returns the row, or the refusal.
    /// An identical pending text from the same agent is answered with the existing row
    /// (<c>duplicate</c>) rather than a second one.</summary>
    public (AgentRequest? Row, string Status, string? Error) Record(string repoId, string agent, string machine, string? title, string? text)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return (null, "error", "repoId is required");
        var body = (text ?? "").Trim();
        if (body.Length == 0) return (null, "error", "text is required: what you are asking the arch for, in words");
        if (body.Length > MaxTextChars) return (null, "error", $"text is too long ({body.Length} chars; at most {MaxTextChars}) — put the detail in a file and ask for a look at it");
        var head = string.IsNullOrWhiteSpace(title) ? null : title.Trim();
        if (head is { Length: > MaxTitleChars }) head = head[..MaxTitleChars];
        lock (_gate)
        {
            var mine = _rows.Where(r => r.SourceId is null && r.RepoId == repoId && r.Status == Pending).ToList();
            var same = mine.FirstOrDefault(r => string.Equals(r.Text, body, StringComparison.Ordinal));
            if (same is not null) return (same, "duplicate", null);
            if (mine.Count >= MaxPendingPerAgent)
                return (null, "too-many", $"you already have {mine.Count} pending requests; wait for the Operator to decide on them");
            var row = new AgentRequest(Guid.NewGuid().ToString("N")[..16], null, machine, repoId, agent, head, body, _now(), Pending);
            _rows.Add(row);
            Save();
            _logger.Info($"[REQUESTS] {agent}@{machine} recorded request {row.Id} ({body.Length} chars) — pending the Operator");
            return (row, "recorded", null);
        }
    }

    // ---- the Operator's decisions --------------------------------------------------------------

    /// <summary>Approve or dismiss a pending row. A row already decided the same way is a no-op
    /// success; decided the other way is refused — a decision is final.</summary>
    public (AgentRequest? Row, string? Error) Decide(string? id, string status, string decidedBy, long? decidedAt = null, string? conversationId = null)
    {
        if (status != Approved && status != Dismissed) return (null, $"status must be {Approved} or {Dismissed}");
        lock (_gate)
        {
            var i = _rows.FindIndex(r => r.Id == id);
            if (i < 0) return (null, $"no request {id}");
            var row = _rows[i];
            if (row.Status == status) return (row, null);
            if (row.Status != Pending) return (null, $"request {id} was already {row.Status}");
            var decided = row with
            {
                Status = status, DecidedAt = decidedAt ?? _now(), DecidedBy = decidedBy,
                // A local row decided here needs no sync; a pulled row's decision travels back.
                DecisionSynced = row.SourceId is null, ConversationId = conversationId ?? row.ConversationId,
            };
            _rows[i] = decided;
            Trim();
            Save();
            _logger.Info($"[REQUESTS] {decided.Agent}@{decided.Machine} request {id} {status} by {decidedBy}");
            return (decided, null);
        }
    }

    /// <summary>The approved request reached the arch: as a message (default) or as a goal
    /// conversation (<paramref name="mode"/> goal with its <paramref name="goalId"/> and conversation).</summary>
    public AgentRequest? MarkDelivered(string id, long? at = null, string? mode = null, string? goalId = null, string? conversationId = null)
    {
        lock (_gate)
        {
            var i = _rows.FindIndex(r => r.Id == id);
            if (i < 0) return null;
            _rows[i] = _rows[i] with { DeliveredAt = at ?? _now(), Mode = mode ?? _rows[i].Mode ?? ModeMessage, GoalId = goalId ?? _rows[i].GoalId, ConversationId = conversationId ?? _rows[i].ConversationId };
            Save();
            return _rows[i];
        }
    }

    public void MarkDecisionSynced(string id)
    {
        lock (_gate)
        {
            var i = _rows.FindIndex(r => r.Id == id);
            if (i < 0 || _rows[i].DecisionSynced) return;
            _rows[i] = _rows[i] with { DecisionSynced = true };
            Save();
        }
    }

    // ---- the hub's merge of a peer's rows ------------------------------------------------------

    /// <summary>Fold rows pulled from a peer into this store. A new id is inserted as pulled
    /// (SourceId / Machine from the peer). An existing row keeps a decision made here; a row
    /// still pending here takes the peer's decision if the peer has one (its own Operator
    /// decided). Returns how many rows were added or changed.</summary>
    public int MergePulled(string sourceId, string machine, IEnumerable<AgentRequest> pulled)
    {
        var changed = 0;
        lock (_gate)
        {
            foreach (var p in pulled)
            {
                if (string.IsNullOrWhiteSpace(p.Id)) continue;
                var i = _rows.FindIndex(r => r.Id == p.Id);
                if (i < 0)
                {
                    _rows.Add(p with { SourceId = sourceId, Machine = machine, DeliveredAt = null, DecisionSynced = p.Status != Pending });
                    changed++;
                    continue;
                }
                var mine = _rows[i];
                if (mine.SourceId is null) continue;                       // a local row never takes a peer's view of it
                if (mine.Status == Pending && p.Status != Pending)
                {
                    _rows[i] = mine with { Status = p.Status, DecidedAt = p.DecidedAt, DecidedBy = p.DecidedBy ?? machine, DecisionSynced = true };
                    changed++;
                }
            }
            if (changed > 0) { Trim(); Save(); }
        }
        return changed;
    }

    /// <summary>Apply a decision a hub pushed for a row recorded here (the peer side).</summary>
    public (AgentRequest? Row, string? Error) ApplyPushedDecision(string? id, string? status, string decidedBy, long? decidedAt)
    {
        var row = Get(id);
        if (row is null) return (null, $"no request {id} on this harness");
        if (row.SourceId is not null) return (null, $"request {id} was not recorded on this harness");
        return Decide(id, status ?? "", decidedBy, decidedAt);
    }

    // ---- persistence ---------------------------------------------------------------------------

    private void Trim()
    {
        var decided = _rows.Where(r => r.Status != Pending).OrderByDescending(r => r.DecidedAt ?? r.CreatedAt).Skip(MaxDecidedKept).ToList();
        foreach (var d in decided) _rows.Remove(d);
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var p = JsonSerializer.Deserialize<Persisted>(File.ReadAllText(_path), JsonOpts);
            _rows = p?.Requests?.Where(r => r is { Id.Length: > 0 }).ToList() ?? new List<AgentRequest>();
        }
        catch (Exception ex)
        {
            _logger.Error($"[REQUESTS] could not read {_path}: {ex.Message} — starting empty");
            _rows = new List<AgentRequest>();
        }
    }

    private void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(new Persisted(_rows), JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex) { _logger.Error($"[REQUESTS] could not write {_path}: {ex.Message}"); }
    }
}
