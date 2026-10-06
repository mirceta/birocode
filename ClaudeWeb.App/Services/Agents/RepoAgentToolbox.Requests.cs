namespace ClaudeWeb.Services.Agents;

/// <summary>
/// A repo agent's request UP to its managing arch (openspec repo-agent-requests; the picture of
/// the arch and the structured fields since openspec repo-agent-arch-picture):
/// <c>request_arch</c> RECORDS the request on this harness's <see cref="AgentRequestStore"/>
/// and nothing else — no arch turn starts, no message is posted, the arch is not woken. The
/// request reaches the arch only when the Operator approves it on the Management dashboard's
/// Repo Agent Requests tab (the hub pulls a managed peer's requests over the fleet channel);
/// a dismissed request never reaches the arch at all. <c>my_requests</c> is how the agent
/// tells silence, approval, rejection and an answer apart.
/// </summary>
public sealed partial class RepoAgentToolbox
{
    public ToolOutcome RequestArch(string? repoId, string? text, string? title, string? probe = null, string? ifFits = null, string? ifNone = null, string? meanwhile = null)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Requests is null) return new ToolOutcome(false, "unavailable", "request_arch is not available on this harness (no request store wired)");
        var repo = env.Repo(repoId);
        if (repo is null) return new ToolOutcome(false, "error", $"unknown repo {repoId}");
        var agent = string.IsNullOrWhiteSpace(repo.Handle) ? _label(null, repoId) : repo.Handle;
        var fields = new AgentRequestStore.Fields(probe, ifFits, ifNone, meanwhile);
        var (row, status, error) = env.Requests.Record(repoId, agent, env.Machine, title, text, fields);
        env.Audit?.Invoke("request_arch", repoId, repo.Name, status);
        if (row is null) return new ToolOutcome(false, status, error ?? status);
        var detail = status == "duplicate"
            ? $"you already have this exact request pending (recorded {RequestView.When(row.CreatedAt, _now())}); nothing new was recorded — my_requests shows its status"
            : "recorded for the Operator — the arch is NOT woken by this and nothing comes back in this turn. The Operator approves it on the Repo Agent Requests tab (the arch then sees it, probes peers if you gave a probe, and may answer you) or dismisses it (the arch never sees it). Any answer arrives later as a prompt tagged arch@<machine> in this dock, never as a tool result: leave your work in a state a peer could pick up (branch pushed, notes in the repo) and carry on. my_requests shows pending | approved | dismissed | answered."
              + (fields.Any ? "" : " Tip: a request that needs another machine reads best with probe / ifFits / ifNone / meanwhile filled in.");
        return new ToolOutcome(true, status, detail, new
        {
            request = RequestView.Row(row),
            pendingForYou = env.Requests.PendingCount(repoId),
            reaches = "the arch only after the Operator approves; never on its own",
        });
    }

    /// <summary><c>my_requests</c>: this agent's own requests with a status that tells silence,
    /// approval, rejection and an answer apart. <c>answered</c> = approved and the arch has sent
    /// this agent a prompt since (the harness stamps every arch send).</summary>
    public ToolOutcome MyRequests(string? repoId, bool includeDecided = true)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Requests is null) return new ToolOutcome(false, "unavailable", "my_requests is not available on this harness (no request store wired)");
        var sentAt = env.ArchSentAt?.Invoke(repoId);
        var rows = env.Requests.Local().Where(r => r.RepoId == repoId).Select(r =>
        {
            var status = RequestStatusFor(r, sentAt);
            return new
            {
                id = r.Id, title = r.Title, text = r.Text, probe = r.Probe, ifFits = r.IfFits, ifNone = r.IfNone, meanwhile = r.Meanwhile,
                createdAt = r.CreatedAt, status, decidedAt = r.DecidedAt, decidedBy = r.DecidedBy, mode = r.Mode,
                meaning = StatusMeaning(status),
            };
        }).Where(x => includeDecided || x.status == AgentRequestStore.Pending).ToList();
        var counts = rows.GroupBy(x => x.status).ToDictionary(g => g.Key, g => g.Count());
        var detail = rows.Count == 0
            ? "you have made no requests to the arch"
            : string.Join(", ", counts.Select(kv => $"{kv.Value} {kv.Key}")) + ". pending = not decided yet (silence, not rejection); approved = the arch has it, any answer comes as an arch@ prompt here; dismissed = the Operator declined; answered = the arch has sent you a prompt since — read your transcript.";
        return new ToolOutcome(true, "ok", detail, new { requests = rows, counts });
    }

    public const string StatusAnswered = "answered";

    /// <summary>pending | approved | dismissed | answered — answered when the arch sent this agent a
    /// prompt after the approval (the arch's send stamp is newer than the decision).</summary>
    public static string RequestStatusFor(AgentRequestStore.AgentRequest r, long? archSentAt)
    {
        if (r.Status != AgentRequestStore.Approved) return r.Status;
        var since = r.DeliveredAt ?? r.DecidedAt ?? r.CreatedAt;
        return archSentAt is { } at && at > since ? StatusAnswered : r.Status;
    }

    public static string StatusMeaning(string status) => status switch
    {
        AgentRequestStore.Pending => "the Operator has not decided yet — silence, not rejection; carry on with your work",
        AgentRequestStore.Approved => "the arch has your request; its answer, if any, arrives as a prompt tagged arch@<machine> in this dock",
        AgentRequestStore.Dismissed => "the Operator declined — do not resend the same text; change the ask or carry on without it",
        StatusAnswered => "the arch has sent you a prompt since the approval — read your own transcript for it",
        _ => status,
    };
}

/// <summary>The JSON shape of a request wherever it is shown (the tool's answer, the peer API,
/// the Operator's tab) — one shape, so the hub's merge and the tab read the same fields.</summary>
public static class RequestView
{
    public static object Row(AgentRequestStore.AgentRequest r) => new
    {
        id = r.Id, sourceId = r.SourceId, machine = r.Machine, repoId = r.RepoId, agent = r.Agent, title = r.Title, text = r.Text,
        probe = r.Probe, ifFits = r.IfFits, ifNone = r.IfNone, meanwhile = r.Meanwhile,
        createdAt = r.CreatedAt, status = r.Status, decidedAt = r.DecidedAt, decidedBy = r.DecidedBy, deliveredAt = r.DeliveredAt,
        decisionSynced = r.DecisionSynced, conversationId = r.ConversationId, mode = r.Mode, goalId = r.GoalId,
    };

    public static string When(long at, long now)
    {
        var s = Math.Max(0, (now - at) / 1000);
        if (s < 60) return $"{s} s ago";
        if (s < 3600) return $"{s / 60} min ago";
        if (s < 86400) return $"{s / 3600} h ago";
        return $"{s / 86400} d ago";
    }
}
