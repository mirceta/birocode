using ClaudeWeb.Services.Policeman;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch's side of its add-ons. The arch knows nothing about the policeman: it offers a
/// host (<see cref="IArchConversationHost"/>: home, sessions, sending, pacing), an agent
/// directory for tools (<see cref="IAgentDirectory"/>), and asks every registered
/// <see cref="IArchConversationHook"/> on each engine tick and around each turn. The hooks
/// arrive lazily because an add-on depends on this service and this service on the add-ons.
/// </summary>
public partial class ArchAgentService : IArchConversationHost, IAgentDirectory
{
    private readonly Lazy<IEnumerable<IArchConversationHook>> _hooks;

    private IEnumerable<IArchConversationHook> HooksFor(string? key) =>
        key is null ? Array.Empty<IArchConversationHook>() : _hooks.Value.Where(h => h.Owns(key));

    /// <summary>Once per engine tick: every add-on keeps its own conversation alive.</summary>
    public void TickConversationHooks()
    {
        foreach (var h in _hooks.Value) h.OnEngineTick();
    }

    /// <summary>The driven-loop quiet floor for a conversation: an add-on's own, else the shared one.</summary>
    public TimeSpan DrivenQuietFloorFor(string? key) =>
        HooksFor(key).Select(h => h.QuietFloorFor(key!)).FirstOrDefault(f => f is not null) ?? DrivenQuietFloor;

    /// <summary>A prompt about to go into a conversation, with every owning add-on's prefix.</summary>
    private string DecorateSend(string key, string text)
    {
        foreach (var h in HooksFor(key)) text = h.DecorateSend(key, text);
        return text;
    }

    /// <summary>The CLI fence for one conversation's turns: the arch's built-in denials, plus —
    /// for the policeman — every withheld arch tool by its MCP name, so the CLI never offers
    /// them either (the MCP server withholds them from tools/list and refuses them at call time).</summary>
    public static IReadOnlyList<string> DisallowedToolsFor(string? key) =>
        PolicemanIdentity.IsPoliceman(key) ? PolicemanToolPolicy.CliDisallowed(DisallowedTools, ArchMcpServer.KnownToolNames) : DisallowedTools;

    // ---- IArchConversationHost ---------------------------------------------------------------

    string? IArchConversationHost.ResolveSessionId(string conversationId) => ResolveArchSessionId(conversationId);

    void IArchConversationHost.ForgetSession(string conversationId)
    {
        _state.SetSessionId(conversationId, null);
        if (_loops.Get(conversationId) is not null) _loops.SetSessionId(conversationId, null);
    }

    (bool Ok, string Error) IArchConversationHost.Send(string conversationId, string text, string actor)
    {
        var (ok, error, _) = SendToArch(conversationId, text, actor);
        return (ok, error);
    }

    TimeSpan IArchConversationHost.DefaultQuietFloor => DrivenQuietFloor;

    long IArchConversationHost.Now() => Now();

    // ---- IAgentDirectory ---------------------------------------------------------------------

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
            {
                AuditTool("list_pull_requests", rid, Unmanaged);
                return new GitHubRemoteLookup(null, null, rid, rid, new ToolOutcome(false, Unmanaged, $"{rid} is not a managed repo"));
            }
            var url = RemoteUrl(repo.Path);
            return new GitHubRemoteLookup(TaskGraph.PrRef.OwnerRepoOf(url), url, repo.Name, rid, null);
        }
        var src = agent.Target.Source!;
        var fleetKey = ArchStateStore.FleetKey(src.Id, rid);
        if (!IsManagedFleet(src.Id, rid))
        {
            AuditTool("list_pull_requests", fleetKey, Unmanaged);
            return new GitHubRemoteLookup(null, null, rid, fleetKey, new ToolOutcome(false, Unmanaged, $"{rid} on {src.Label} is not a managed agent"));
        }
        var view = RemoteAgents(refreshPeers: false, nonBlocking: true).FirstOrDefault(a => a.SourceId == src.Id && a.RepoId == rid);
        if (view is null) return new GitHubRemoteLookup(null, null, rid, fleetKey, new ToolOutcome(false, Unreachable, $"{src.Label} did not report {rid}"));
        return new GitHubRemoteLookup(TaskGraph.PrRef.OwnerRepoOf(view.RemoteUrl), view.RemoteUrl, $"{view.Name} on {src.Label}", fleetKey, null);
    }
}
