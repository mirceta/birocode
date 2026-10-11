using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// Fleet visibility of repo-agent subagents (openspec repo-agent-subagents): the hub reads a
/// repo agent's subagents the way it reads its main conversation — locally from the service,
/// on a peer through the peer API (<c>GET /api/arch/peer/subagents</c>). The per-agent counts
/// ride the Fleet Status rows and the peer describe (<c>subagents</c>), so the Status tab and
/// the Management Subagents tab can say which agents run subagents.
/// </summary>
public partial class ArchAgentService
{
    /// <summary>The peer API's receiving side: this harness's subagents of one repo (or every
    /// repo), with the selected one's last messages when <paramref name="id"/> is given.</summary>
    public ToolOutcome PeerSubagents(string? repoId, string? id, int tail)
    {
        if (_subagents is null) return new ToolOutcome(false, "no-subagents", "this build has no subagent service");
        var list = string.IsNullOrWhiteSpace(repoId)
            ? _subagents.Store.All().Select(_subagents.View).ToList()
            : _subagents.Views(repoId);
        object? messages = null;
        if (!string.IsNullOrWhiteSpace(id) && _subagents.Find(id) is { } s)
        {
            var repo = _repos.GetAll().FirstOrDefault(r => r.Id == s.RepoId);
            var sid = _subagents.ResolveSessionId(s.Key);
            if (repo is not null && sid is not null)
            {
                var (items, total) = Chat.TranscriptWindow.Tail(_sessions.GetMessages(repo.Path, sid), Math.Clamp(tail, 1, 40));
                messages = new { sessionId = sid, messages = items, total };
            }
        }
        return new ToolOutcome(true, "ok", $"{list.Count} subagent(s)", new { machine = SelfLabel, subagents = list, selected = messages });
    }

    /// <summary>The hub's view: this machine's subagents, or a peer's through its peer API.</summary>
    public ToolOutcome FleetSubagents(string? sourceId, string? repoId, string? id, int tail)
    {
        if (string.IsNullOrWhiteSpace(sourceId) || sourceId == CollectorService.SelfId) return PeerSubagents(repoId, id, tail);
        var src = _collector.ListSources().FirstOrDefault(s => s.Id == sourceId);
        if (src is null) return new ToolOutcome(false, "error", "unknown source");
        return _fleet.PeerSubagents(src.Id, repoId, id, tail);
    }

    /// <summary>Every agent of the fleet with subagents, from the local store and the cached peer
    /// describes — the Management Subagents tab's "repo-agent subagents" block. No network.</summary>
    public object FleetSubagentSummary()
    {
        var rows = new List<object>();
        if (_subagents is not null)
        {
            foreach (var g in _subagents.Store.All().GroupBy(s => s.RepoId))
            {
                var repo = _repos.GetAll().FirstOrDefault(r => r.Id == g.Key);
                if (repo is null) continue;
                var c = _subagents.CountsOf(g.Key);
                rows.Add(new
                {
                    machine = SelfLabel, sourceId = CollectorService.SelfId, self = true, repoId = g.Key, name = repo.Name,
                    handle = Handles.AgentLabel(SelfLabel, repo.Handle ?? repo.Id), key = g.Key,
                    counts = new { running = c.Running, total = c.Total, needsHuman = c.NeedsHuman, busy = c.Busy },
                    subagents = g.OrderByDescending(s => s.IsRunning).ThenByDescending(s => s.StartedAt).Take(12).Select(_subagents.View).ToList(),
                });
            }
        }
        foreach (var src in _collector.ListSources().Where(s => s.Kind == "remote"))
        {
            var snap = _fleet.SnapshotNonBlocking(src.Id);
            foreach (var r in snap.Repos.Where(r => r.Subagents is { Total: > 0 }))
                rows.Add(new
                {
                    machine = src.Label, sourceId = src.Id, self = false, repoId = r.RepoId, name = r.Name,
                    handle = Handles.AgentLabel(src.Label, PeerHandles(snap).GetValueOrDefault(r.RepoId, Handles.Slug(r.Name))), key = ArchStateStore.FleetKey(src.Id, r.RepoId),
                    counts = new { running = r.Subagents!.Running, total = r.Subagents.Total, needsHuman = r.Subagents.NeedsHuman, busy = r.Subagents.Busy },
                    subagents = (List<object>?)null,   // read on demand through GET /api/arch/fleet/subagents?sourceId=&repoId=
                });
        }
        return new { agents = rows, running = rows.Count };
    }
}
