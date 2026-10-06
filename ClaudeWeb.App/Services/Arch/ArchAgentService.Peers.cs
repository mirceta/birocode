using ClaudeWeb.Services.Agents;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The fleet as a repo agent may read it (openspec repo-agent-my-peers): the <c>my_peers</c>
/// tool's source. No new store — this machine from the registry and the agent snapshot (the
/// same local views <c>list_agents</c> sees, non-blocking), every peer from its cached describe
/// (what <c>GET /api/arch/peer</c> returned last: build, opt-ins, gate, every registered repo
/// with its agent facts). A dark peer is a row with its status, an older build is marked, and
/// nothing on this path spawns git or dials a machine.
/// </summary>
public partial class ArchAgentService
{
    public IReadOnlyList<PeerMachine> PeerFleet()
    {
        var list = new List<PeerMachine>();
        var managed = ManagedRepoIds().ToHashSet(StringComparer.Ordinal);
        // This machine: every registered repo; an agent row for each repo that holds a dock or is managed.
        var local = AgentSnapshotOrCompute().Local.ToDictionary(a => a.RepoId, StringComparer.Ordinal);
        var repos = _repos.GetAll().Select(r => new PeerRepoRow(r.Id, r.Name, string.IsNullOrWhiteSpace(r.Handle) ? Handles.Slug(r.Name) : r.Handle,
            local.TryGetValue(r.Id, out var v) && v.TabId is not null, local.TryGetValue(r.Id, out var v2) ? v2.RemoteUrl : null)).ToList();
        var agents = local.Values.Where(a => a.TabId is not null || managed.Contains(a.RepoId))
            .Select(a => new PeerAgent(SelfLabel, true, a.RepoId, a.Name, a.RepoHandle, a.RemoteUrl, a.Branch, a.Dirty,
                managed.Contains(a.RepoId) ? a.Availability : Unmanaged, a.ClaimedReason, a.LastActor, a.RunningSince, managed.Contains(a.RepoId),
                managed.Contains(a.RepoId) ? null : "outside the arch's scope on this machine — the Operator adds it on the Arch tab")).ToList();
        list.Add(new PeerMachine(SelfLabel, true, true, FleetClient.StatusOk, null, BuildVersion, false, AcceptFleetSends, true, _gate.Enabled, repos, agents));

        foreach (var src in _collector.ListSources().Where(s => s.Kind == "remote"))
        {
            var snap = _fleet.SnapshotNonBlocking(src.Id);
            if (!snap.Reachable || snap.Info is null)
            {
                list.Add(new PeerMachine(src.Label, false, false, snap.Status, snap.Detail ?? src.LastError ?? "not answering", snap.Info?.Version, false,
                    snap.Info?.AcceptsSends ?? false, src.AllowSends, snap.Info?.GateOpen ?? false, Array.Empty<PeerRepoRow>(), Array.Empty<PeerAgent>()));
                continue;
            }
            var handles = PeerHandles(snap);
            var older = snap.Info.Version is { } pv && pv != BuildVersion;
            var peerRepos = snap.Repos.Select(r => new PeerRepoRow(r.RepoId, r.Name, handles.GetValueOrDefault(r.RepoId, Handles.Slug(r.Name)), r.Docked == true, r.RemoteUrl)).ToList();
            var peerAgents = snap.Repos.Where(r => r.Docked == true || r.Managed == true || r.RunningSince is not null || (r.Docked is null && !string.IsNullOrEmpty(r.Branch) && r.Branch != "unknown"))
                .Select(r =>
                {
                    var managedThere = r.Managed == true;
                    // The hub's own occupancy setting applies to its view of a managed peer agent (openspec manual-agent-occupancy).
                    var v = managedThere ? PeerVerdict(src.Id, r) : new ArchClaims.Verdict(r.Availability ?? Unmanaged, r.ClaimedReason);
                    return new PeerAgent(src.Label, false, r.RepoId, r.Name, handles.GetValueOrDefault(r.RepoId, Handles.Slug(r.Name)), r.RemoteUrl,
                        r.Branch ?? "unknown", r.Dirty, managedThere ? v.Availability : Unmanaged, v.ClaimedReason, r.LastActor ?? "none", r.RunningSince, managedThere,
                        managedThere ? null : r.Managed is null ? "older build: its arch scope is not reported" : "outside that machine's arch scope");
                }).ToList();
            list.Add(new PeerMachine(src.Label, false, true, snap.Status, null, snap.Info.Version, older, snap.Info.AcceptsSends, src.AllowSends, snap.Info.GateOpen, peerRepos, peerAgents));
        }
        return list;
    }
}
