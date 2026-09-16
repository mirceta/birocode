using System.Text.Json;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch as the policeman's agent directory (openspec one-policeman): the few things the loop
/// needs of the fleet, behind <see cref="IAgentDirectory"/>. The arch knows nothing about the
/// policeman.
/// </summary>
public partial class ArchAgentService : IAgentDirectory
{
    AgentRef IAgentDirectory.ResolveAgent(string? machine, string? repoRef) => ResolveAgentRef(machine, repoRef);

    string IAgentDirectory.AgentLabel(string? sourceId, string repoId) => AgentLabelOf(sourceId, repoId);

    void IAgentDirectory.AuditTool(string tool, string? repoKey, string outcome) => AuditTool(tool, repoKey, outcome);

    GitHubRemoteLookup IAgentDirectory.GitHubRemoteOf(AgentRef agent)
    {
        var rid = agent.RepoId!;
        if (agent.Target.IsSelf)
        {
            var repo = _repos.GetAll().FirstOrDefault(r => r.Id == rid);
            if (repo is null || !IsManaged(rid))
                return new GitHubRemoteLookup(null, null, rid, rid, new ToolOutcome(false, Unmanaged, $"{rid} is not a managed repo"));
            var url = RemoteUrl(repo.Path);
            return new GitHubRemoteLookup(TaskGraph.PrRef.OwnerRepoOf(url), url, repo.Name, rid, null);
        }
        var src = agent.Target.Source!;
        var fleetKey = ArchStateStore.FleetKey(src.Id, rid);
        if (!IsManagedFleet(src.Id, rid))
            return new GitHubRemoteLookup(null, null, rid, fleetKey, new ToolOutcome(false, Unmanaged, $"{rid} on {src.Label} is not a managed agent"));
        var view = RemoteAgents(refreshPeers: false, nonBlocking: true).FirstOrDefault(a => a.SourceId == src.Id && a.RepoId == rid);
        if (view is null) return new GitHubRemoteLookup(null, null, rid, fleetKey, new ToolOutcome(false, Unreachable, $"{src.Label} did not report {rid}"));
        return new GitHubRemoteLookup(TaskGraph.PrRef.OwnerRepoOf(view.RemoteUrl), view.RemoteUrl, $"{view.Name} on {src.Label}", fleetKey, null);
    }

    /// <summary>The same read the arch's <c>read_transcript</c> tool makes (local session file, or
    /// the peer API), flattened to typed messages. A refusal (unmanaged, claimed, unreachable)
    /// comes back as the reason, never as an exception.</summary>
    (IReadOnlyList<AgentMessage>? Messages, string? Refusal) IAgentDirectory.ReadTranscript(string? sourceId, string repoId, int tail)
    {
        ToolOutcome o;
        try { o = ToolReadTranscript(sourceId, repoId, tail); }
        catch (Exception ex) { return (null, ex.Message); }
        if (!o.Ok) return (null, o.Detail);
        return (TranscriptMessages(o.Data), null);
    }

    /// <summary>Pure: the <c>messages</c> of a transcript outcome's data (an anonymous object here,
    /// a JSON element from a peer), each as (role, text, unix ms).</summary>
    internal static IReadOnlyList<AgentMessage> TranscriptMessages(object? data)
    {
        var list = new List<AgentMessage>();
        if (data is null) return list;
        try
        {
            using var doc = JsonDocument.Parse(JsonSerializer.Serialize(data));
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Array) return list; // "no conversation yet"
            if (!root.TryGetProperty("messages", out var msgs) || msgs.ValueKind != JsonValueKind.Array) return list;
            foreach (var m in msgs.EnumerateArray())
            {
                var role = m.TryGetProperty("role", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() ?? "" : "";
                var text = m.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() ?? "" : "";
                long? at = null;
                if (m.TryGetProperty("at", out var a))
                {
                    if (a.ValueKind == JsonValueKind.Number && a.TryGetInt64(out var n)) at = n;
                    else if (a.ValueKind == JsonValueKind.String && DateTimeOffset.TryParse(a.GetString(), null, System.Globalization.DateTimeStyles.AssumeUniversal, out var d)) at = d.ToUnixTimeMilliseconds();
                }
                list.Add(new AgentMessage(role, text, at));
            }
        }
        catch { /* an unreadable transcript is an empty one */ }
        return list;
    }

    /// <summary>The Operator's answer to a flag goes into the assignee's conversation as the
    /// Operator's own message; the arch's send path applies the slot and claim rules.</summary>
    ToolOutcome IAgentDirectory.SendToAgent(string? sourceId, string repoId, string text) =>
        SendTask(sourceId, repoId, text, null, requireArmed: false, overrideClaimed: true);

    private static readonly IReadOnlyDictionary<string, string> NoTaskBranches =
        new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>The branches the dispatch watch recorded per task (openspec
    /// policeman-board-behind). Best-effort: a peer's or an unreadable store is empty,
    /// never an exception — discovery must not kill a policeman pass.</summary>
    IReadOnlyDictionary<string, string> IAgentDirectory.RecordedTaskBranches(string? sourceId, string repoId)
    {
        if (sourceId is not null || string.IsNullOrWhiteSpace(repoId)) return NoTaskBranches;
        try { return ReadAssignment(repoId).TaskBranches ?? NoTaskBranches; }
        catch { return NoTaskBranches; }
    }
}
