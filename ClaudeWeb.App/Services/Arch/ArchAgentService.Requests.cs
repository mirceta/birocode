using System.Text;
using System.Text.Json;
using ClaudeWeb.Services.Agents;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch side of repo-agent → arch requests (openspec repo-agent-requests). A repo agent's
/// <c>request_arch</c> only wrote a row on ITS harness's <see cref="AgentRequestStore"/>; this
/// partial is everything that happens after:
///  - <see cref="SyncAgentRequests"/>: the hub PULLS every active peer's locally recorded rows
///    over the proven hub→peer channel (the fleet client, the peer's stored credential) and
///    keeps those from repos it manages; and PUSHES the Operator's decisions back (behind the
///    peer's accept-sends opt-in), so the agent's own harness shows the outcome too.
///  - <see cref="ApproveAgentRequest"/> / <see cref="DismissAgentRequest"/>: the Operator's
///    decision from the Repo Agent Requests tab. Approve posts the request into the
///    Operator-facing conversation right away when its slot is free; otherwise the engine tick
///    does it (<see cref="DeliverAgentRequests"/>) — the same path a goal summary takes, so the
///    arch sees it on its next turn. Dismiss never reaches the arch.
/// The message carries the actor tag <see cref="ActorRequest"/>, so the transcript shows it was
/// the harness relaying an approved agent request, not the Operator typing.
/// </summary>
public partial class ArchAgentService
{
    public const string ActorRequest = "request";
    /// <summary>How often the engine tick re-pulls peers' requests (the tab's GET pulls more eagerly).</summary>
    public static readonly TimeSpan RequestSyncOnTick = TimeSpan.FromSeconds(30);
    public static readonly TimeSpan RequestSyncOnRead = TimeSpan.FromSeconds(10);

    private AgentRequestStore? _agentRequests;
    private long _requestsPulledAt;
    private readonly object _requestSyncGate = new();
    private readonly Dictionary<string, (string Status, string? Detail)> _requestPeerStatus = new(StringComparer.Ordinal);

    /// <summary>The store this harness keeps (null on a build without the module).</summary>
    public AgentRequestStore? AgentRequests { get => _agentRequests; set => _agentRequests = value; }

    // ---- the message the arch sees ------------------------------------------------------------

    /// <summary>The text posted into the arch conversation for an approved request. Pure.</summary>
    public static string ComposeRequestMessage(AgentRequestStore.AgentRequest r)
    {
        var sb = new StringBuilder();
        sb.Append("[Request from repo agent ").Append(r.Machine).Append('/').Append(r.Agent).Append(" — approved by the Operator");
        if (!string.IsNullOrWhiteSpace(r.Title)) sb.Append(": ").Append(r.Title.Trim());
        sb.Append(']').Append('\n');
        sb.Append(r.Text.Trim()).Append('\n').Append('\n');
        sb.Append("(The agent recorded this with request_arch; the Operator approved it on the Repo Agent Requests tab. Act on it as you would on the Operator's own instruction, and answer the agent with send_task if it needs a reply.)");
        return sb.ToString();
    }

    // ---- the Operator's view ------------------------------------------------------------------

    /// <summary>Everything the Repo Agent Requests tab shows: this harness's rows (local and
    /// pulled), how each peer answered the last pull, and the how-to.</summary>
    public object AgentRequestsView()
    {
        var rows = _agentRequests?.All() ?? Array.Empty<AgentRequestStore.AgentRequest>();
        List<object> peers;
        lock (_requestSyncGate)
            peers = _collector.ListSources().Where(s => s.Kind == "remote" && s.Active)
                .Select(s => (object)new
                {
                    machine = s.Label, sourceId = s.Id,
                    status = _requestPeerStatus.TryGetValue(s.Id, out var st) ? st.Status : "not-pulled",
                    detail = _requestPeerStatus.TryGetValue(s.Id, out var d) ? d.Detail : null,
                    allowSends = s.AllowSends, managed = ManagedFleet().Any(k => ArchStateStore.ParseFleetKey(k) is { } p && p.SourceId == s.Id),
                }).ToList();
        return new
        {
            hub = SelfLabel,
            available = _agentRequests is not null,
            gateOpen = _gate.Enabled,
            pulledAt = Interlocked.Read(ref _requestsPulledAt),
            requests = rows.Select(RequestView.Row).ToList(),
            pending = rows.Count(r => r.Status == AgentRequestStore.Pending),
            peers,
            howTo = AgentRequestsHowTo(SelfLabel),
        };
    }

    public static object AgentRequestsHowTo(string selfLabel) => new
    {
        hub = selfLabel,
        tool = "request_arch",
        agent = new[]
        {
            "A repo agent calls request_arch(text, title?) when it needs something only the arch can give: a decision, a resource, another agent's help, a change of plan.",
            "The call only records the request here — the arch is not woken and sees nothing until you approve.",
        },
        operatorSteps = new[]
        {
            "Approve: the request is posted into the arch's conversation (the Arch tab) as a tagged message; the arch sees it on its next turn and may answer the agent with a task.",
            "Dismiss: the request is closed; the arch never sees it. Decisions are final and travel back to the agent's machine.",
            "A request from another machine's agent gets here when this hub pulls it (every 30 s on the engine tick, every 10 s while this tab is open); a peer that does not answer is named below, not hidden.",
        },
    };

    // ---- the Operator's decisions -------------------------------------------------------------

    /// <summary>Approve a pending request: mark it, then try to post it into the Operator-facing
    /// conversation at once; a busy arch leaves it for the engine tick.</summary>
    public ToolOutcome ApproveAgentRequest(string? id)
    {
        if (_agentRequests is null) return new ToolOutcome(false, "unavailable", "this harness has no request store");
        var (row, err) = _agentRequests.Decide(id, AgentRequestStore.Approved, SelfLabel, conversationId: ReservedId);
        if (row is null) return new ToolOutcome(false, "error", err!);
        var delivered = row.DeliveredAt is not null ? row : TryDeliver(row);
        PushDecisions();
        return new ToolOutcome(true, delivered.DeliveredAt is null ? "approved-waiting" : "approved-delivered",
            delivered.DeliveredAt is null
                ? "approved; the arch is mid-turn — it is posted into the Arch conversation as soon as its slot is free"
                : "approved and posted into the Arch conversation",
            RequestView.Row(delivered));
    }

    public ToolOutcome DismissAgentRequest(string? id)
    {
        if (_agentRequests is null) return new ToolOutcome(false, "unavailable", "this harness has no request store");
        var (row, err) = _agentRequests.Decide(id, AgentRequestStore.Dismissed, SelfLabel);
        if (row is null) return new ToolOutcome(false, "error", err!);
        PushDecisions();
        return new ToolOutcome(true, "dismissed", "dismissed; the arch never sees it", RequestView.Row(row));
    }

    // ---- delivery into the arch conversation --------------------------------------------------

    /// <summary>Engine tick: post ONE approved, undelivered request into the Operator-facing
    /// conversation when its slot is free (one turn per tick, like a goal summary).</summary>
    public void DeliverAgentRequests()
    {
        if (_agentRequests is null) return;
        var next = _agentRequests.ApprovedUndelivered().FirstOrDefault();
        if (next is null) return;
        if (_runs.Get(ReservedId)?.Status == "running") return;
        TryDeliver(next);   // one turn per tick; a busy slot waits for the next
    }

    private AgentRequestStore.AgentRequest TryDeliver(AgentRequestStore.AgentRequest r)
    {
        var (ok, error, _) = SendToArch(r.ConversationId ?? ReservedId, ComposeRequestMessage(r), ActorRequest);
        if (!ok) { _logger.Info($"[REQUESTS] request {r.Id} from {r.Machine}/{r.Agent} waits: {error}"); return r; }
        var marked = _agentRequests!.MarkDelivered(r.Id) ?? r;
        _logger.Info($"[REQUESTS] request {r.Id} from {r.Machine}/{r.Agent} posted to {r.ConversationId ?? ReservedId}");
        return marked;
    }

    // ---- the fleet: pull peers' rows, push decisions ------------------------------------------

    /// <summary>Pull every active remote peer's locally recorded requests unless pulled within
    /// <paramref name="maxAge"/>; keep rows from repos this hub manages on that peer. Then push
    /// decisions not yet synced. Returns how many rows changed.</summary>
    public int SyncAgentRequests(TimeSpan maxAge)
    {
        if (_agentRequests is null) return 0;
        var now = Now();
        if (now - Interlocked.Read(ref _requestsPulledAt) < maxAge.TotalMilliseconds) return 0;
        if (!Monitor.TryEnter(_requestSyncGate)) return 0;   // one pull at a time; a concurrent reader just waits for the next
        try
        {
            Interlocked.Exchange(ref _requestsPulledAt, now);
            var changed = 0;
            foreach (var src in _collector.ListSources().Where(s => s.Kind == "remote" && s.Active))
            {
                var o = _fleet.AgentRequests(src.Id);
                if (!o.Ok) { _requestPeerStatus[src.Id] = (o.Status, o.Detail); continue; }
                var pulled = ParsePulled(o.Data).Where(r => IsManagedFleet(src.Id, r.RepoId)).ToList();
                changed += _agentRequests.MergePulled(src.Id, src.Label, pulled);
                _requestPeerStatus[src.Id] = ("ok", $"{pulled.Count} request(s) from managed agents");
            }
            changed += PushDecisionsLocked();
            if (changed > 0) _logger.Info($"[REQUESTS] fleet sync: {changed} row(s) changed");
            return changed;
        }
        finally { Monitor.Exit(_requestSyncGate); }
    }

    private void PushDecisions()
    {
        lock (_requestSyncGate) PushDecisionsLocked();
    }

    private int PushDecisionsLocked()
    {
        if (_agentRequests is null) return 0;
        var pushed = 0;
        foreach (var r in _agentRequests.DecisionsToPush())
        {
            var o = _fleet.AgentRequestDecision(r.SourceId!, r.Id, r.Status, SelfLabel, r.DecidedAt);
            // A peer that no longer has the row, or refuses, is settled too: nothing more to push.
            if (o.Ok || o.Status is "error" or "not-accepting" or "no-peer-api") { _agentRequests.MarkDecisionSynced(r.Id); pushed++; }
            else _logger.Info($"[REQUESTS] decision on {r.Id} not yet on {r.Machine}: {o.Status} — {o.Detail}");
        }
        return pushed;
    }

    /// <summary>Rows as a peer's <c>GET /api/arch/peer/requests</c> returns them. Pure.</summary>
    public static IReadOnlyList<AgentRequestStore.AgentRequest> ParsePulled(object? data)
    {
        if (data is not JsonElement arr || arr.ValueKind != JsonValueKind.Array) return Array.Empty<AgentRequestStore.AgentRequest>();
        var rows = new List<AgentRequestStore.AgentRequest>();
        foreach (var el in arr.EnumerateArray())
        {
            string? S(string k) => el.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            long? L(string k) => el.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt64() : null;
            var id = S("id"); var repoId = S("repoId"); var text = S("text");
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(repoId) || string.IsNullOrWhiteSpace(text)) continue;
            rows.Add(new AgentRequestStore.AgentRequest(id, null, S("machine") ?? "", repoId, S("agent") ?? repoId, S("title"), text,
                L("createdAt") ?? 0, S("status") ?? AgentRequestStore.Pending, L("decidedAt"), S("decidedBy")));
        }
        return rows;
    }

    // ---- the peer side (what a hub calls on this harness) -------------------------------------

    /// <summary>The peer API's list: the requests agents on THIS harness recorded.</summary>
    public ToolOutcome PeerAgentRequests()
    {
        if (_agentRequests is null) return new ToolOutcome(false, "unavailable", $"{SelfLabel} has no request store");
        var rows = _agentRequests.Local().Select(RequestView.Row).ToList();
        return new ToolOutcome(true, "ok", $"{rows.Count} request(s) recorded on {SelfLabel}", rows);
    }

    /// <summary>The peer API's decision push: a hub's Operator decided on a request recorded
    /// here. Behind this harness's accept-sends opt-in like every write a fleet arch may do.</summary>
    public ToolOutcome PeerAgentRequestDecision(string? from, string? id, string? status, long? decidedAt)
    {
        if (_agentRequests is null) return new ToolOutcome(false, "unavailable", $"{SelfLabel} has no request store");
        var sender = SanitizeMachine(from);
        if (sender is null) return new ToolOutcome(false, "error", "from (the deciding machine's label) is required");
        if (!AcceptFleetSends) return new ToolOutcome(false, "not-accepting", $"{SelfLabel} does not accept fleet sends (its operator has not opted in)");
        var (row, err) = _agentRequests.ApplyPushedDecision(id, status, $"operator@{sender}", decidedAt);
        if (row is null) return new ToolOutcome(false, "error", err!);
        return new ToolOutcome(true, row.Status, $"request {row.Id} {row.Status} by {sender}", RequestView.Row(row));
    }
}
