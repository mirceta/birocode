namespace ClaudeWeb.Services.Agents;

/// <summary>
/// A repo agent's request UP to its managing arch (openspec repo-agent-requests):
/// <c>request_arch</c> RECORDS the request on this harness's <see cref="AgentRequestStore"/>
/// and nothing else — no arch turn starts, no message is posted, the arch is not woken. The
/// request reaches the arch only when the Operator approves it on the Management dashboard's
/// Repo Agent Requests tab (the hub pulls a managed peer's requests over the fleet channel);
/// a dismissed request never reaches the arch at all.
/// </summary>
public sealed partial class RepoAgentToolbox
{
    public ToolOutcome RequestArch(string? repoId, string? text, string? title)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Requests is null) return new ToolOutcome(false, "unavailable", "request_arch is not available on this harness (no request store wired)");
        var repo = env.Repo(repoId);
        if (repo is null) return new ToolOutcome(false, "error", $"unknown repo {repoId}");
        var agent = string.IsNullOrWhiteSpace(repo.Handle) ? _label(null, repoId) : repo.Handle;
        var (row, status, error) = env.Requests.Record(repoId, agent, env.Machine, title, text);
        env.Audit?.Invoke("request_arch", repoId, repo.Name, status);
        if (row is null) return new ToolOutcome(false, status, error ?? status);
        var detail = status == "duplicate"
            ? $"you already have this exact request pending (recorded {RequestView.When(row.CreatedAt, _now())}); nothing new was recorded"
            : $"recorded for the Operator — the arch is NOT woken by this; it sees your request only once the Operator approves it on the Repo Agent Requests tab, and a dismissed request never reaches it. Carry on with your work; if the arch acts on it, its answer arrives as a task in this chat.";
        return new ToolOutcome(true, status, detail, new
        {
            request = RequestView.Row(row),
            pendingForYou = env.Requests.PendingCount(repoId),
            reaches = "the arch only after the Operator approves; never on its own",
        });
    }
}

/// <summary>The JSON shape of a request wherever it is shown (the tool's answer, the peer API,
/// the Operator's tab) — one shape, so the hub's merge and the tab read the same fields.</summary>
public static class RequestView
{
    public static object Row(AgentRequestStore.AgentRequest r) => new
    {
        id = r.Id, sourceId = r.SourceId, machine = r.Machine, repoId = r.RepoId, agent = r.Agent, title = r.Title, text = r.Text,
        createdAt = r.CreatedAt, status = r.Status, decidedAt = r.DecidedAt, decidedBy = r.DecidedBy, deliveredAt = r.DeliveredAt,
        decisionSynced = r.DecisionSynced, conversationId = r.ConversationId,
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
