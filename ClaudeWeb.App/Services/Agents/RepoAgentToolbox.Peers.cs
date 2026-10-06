namespace ClaudeWeb.Services.Agents;

/// <summary>One machine of the fleet as <c>my_peers</c> shows it (openspec repo-agent-my-peers):
/// the harness's reachability and posture, the repos registered there (so "no prg agent on
/// that machine" reads apart from "no agent there at all"), and its agents.</summary>
public sealed record PeerMachine(
    string Machine, bool Self, bool Reachable, string Status, string? Detail, string? Build, bool OlderBuild,
    bool AcceptsSends, bool SendsAllowed, bool GateOpen,
    IReadOnlyList<PeerRepoRow> Repos, IReadOnlyList<PeerAgent> Agents);

/// <summary>A repo registered on a machine, agent or not.</summary>
public sealed record PeerRepoRow(string RepoId, string Name, string Handle, bool Docked, string? RemoteUrl);

/// <summary>One repo agent on a machine, in the arch's <c>list_agents</c> vocabulary.</summary>
public sealed record PeerAgent(
    string Machine, bool Self, string RepoId, string Name, string Handle, string? RemoteUrl, string Branch, bool Dirty,
    string Availability, string? ClaimedReason, string LastActor, long? RunningSince, bool Managed, string? Note = null);

public sealed partial class RepoAgentToolbox
{
    /// <summary>The availability as the agent reads it: the arch's word, plus the reason when claimed
    /// ("claimed (operator-occupied)").</summary>
    public static string AvailabilityWord(string? availability, string? claimedReason = null)
    {
        var a = string.IsNullOrWhiteSpace(availability) ? "unknown" : availability;
        return a == "claimed" && !string.IsNullOrWhiteSpace(claimedReason) ? $"claimed ({claimedReason})" : a;
    }

    /// <summary>"https://github.com/mirceta/prg.git" and "git@github.com:mirceta/prg" are the same repo.</summary>
    public static string? NormalizeRemote(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        var u = url.Trim().ToLowerInvariant();
        u = System.Text.RegularExpressions.Regex.Replace(u, @"^[a-z+]+://", "");
        u = System.Text.RegularExpressions.Regex.Replace(u, @"^[^@/]+@", "");
        u = u.Replace(':', '/').TrimEnd('/');
        if (u.EndsWith(".git", StringComparison.Ordinal)) u = u[..^4];
        return u;
    }

    /// <summary>"prg#2" → "prg": the handle's repo part without the per-machine suffix.</summary>
    public static string HandleBase(string? handle)
    {
        var h = (handle ?? "").Trim();
        var slash = h.LastIndexOf('/');
        if (slash >= 0) h = h[(slash + 1)..];
        var hash = h.IndexOf('#');
        return (hash > 0 ? h[..hash] : h).ToLowerInvariant();
    }

    /// <summary>Same repo = same remote URL, else the same handle base, else the same name — the only
    /// valid targets for a branch or PR handoff.</summary>
    public static bool SameRepo(PeerAgent a, string? remoteUrl, string? handle, string? name)
    {
        var ra = NormalizeRemote(a.RemoteUrl); var rb = NormalizeRemote(remoteUrl);
        if (ra is not null && rb is not null) return ra == rb;
        var hb = HandleBase(handle);
        if (hb.Length > 0 && HandleBase(a.Handle) == hb) return true;
        return !string.IsNullOrWhiteSpace(name) && string.Equals(a.Name, name, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary><c>my_peers</c>: the fleet as the arch sees it — read-only, within the turn, never a wake.</summary>
    public ToolOutcome MyPeers(string? repoId, string? repoFilter = null, bool sameRepoOnly = false)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Peers is null) return new ToolOutcome(false, "unavailable", "my_peers is not available on this harness (no arch directory wired)");
        IReadOnlyList<PeerMachine> machines;
        try { machines = env.Peers() ?? Array.Empty<PeerMachine>(); }
        catch (Exception ex) { return new ToolOutcome(false, "error", $"the fleet directory could not be read: {ex.Message}"); }
        var me = machines.Where(m => m.Self).SelectMany(m => m.Agents).FirstOrDefault(a => a.RepoId == repoId);
        var myRepo = env.Repo(repoId);
        var myRemote = me?.RemoteUrl ?? machines.Where(m => m.Self).SelectMany(m => m.Repos).FirstOrDefault(r => r.RepoId == repoId)?.RemoteUrl;
        var myHandle = me?.Handle ?? myRepo?.Handle;
        var myName = me?.Name ?? myRepo?.Name;
        var filter = (repoFilter ?? "").Trim().ToLowerInvariant();
        bool Matches(PeerAgent a) => filter.Length == 0 || a.Name.ToLowerInvariant().Contains(filter) || a.Handle.ToLowerInvariant().Contains(filter) || HandleBase(a.Handle) == HandleBase(filter);

        var rows = machines.Select(m => new
        {
            machine = m.Machine, self = m.Self, reachable = m.Reachable, status = m.Status, detail = m.Detail, build = m.Build, olderBuild = m.OlderBuild,
            acceptsSends = m.AcceptsSends, sendsAllowed = m.SendsAllowed, gateOpen = m.GateOpen,
            repos = m.Repos.Select(r => new { r.RepoId, name = r.Name, handle = r.Handle, docked = r.Docked, sameRepo = SameRepoRow(r, myRemote, myHandle, myName) }).Where(r => filter.Length == 0 || r.name.ToLowerInvariant().Contains(filter) || r.handle.ToLowerInvariant().Contains(filter)).ToList(),
            agents = m.Agents.Where(Matches).Select(a =>
            {
                var you = m.Self && a.RepoId == repoId;
                var same = SameRepo(a, myRemote, myHandle, myName);
                return new
                {
                    machine = a.Machine, self = m.Self, you, repoId = a.RepoId, name = a.Name, handle = a.Handle, remoteUrl = a.RemoteUrl,
                    branch = a.Branch, dirty = a.Dirty, availability = AvailabilityWord(a.Availability, a.ClaimedReason), lastActor = a.LastActor,
                    runningSince = a.RunningSince, running = a.RunningSince is not null, managed = a.Managed,
                    sameRepo = same,
                    // A branch / PR can only be handed to the same repo; the arch reaches it only when managed, the machine accepts sends and this hub may send.
                    handoffTarget = same && !you && m.Reachable && a.Managed && m.AcceptsSends && m.SendsAllowed,
                    note = a.Note,
                };
            }).Where(a => !sameRepoOnly || a.sameRepo).OrderBy(a => a.you ? 0 : 1).ThenBy(a => a.sameRepo ? 0 : 1).ThenBy(a => a.handle, StringComparer.OrdinalIgnoreCase).ToList(),
        }).Where(m => !sameRepoOnly || m.self || m.agents.Count > 0 || !m.reachable).OrderBy(m => m.self ? 0 : 1).ThenBy(m => m.machine, StringComparer.OrdinalIgnoreCase).ToList();

        var agents = rows.SelectMany(m => m.agents).ToList();
        var sameRepo = agents.Where(a => a.sameRepo && !a.you).ToList();
        var targets = sameRepo.Where(a => a.handoffTarget).ToList();
        var dark = rows.Where(m => !m.self && !m.reachable).Select(m => m.machine).ToList();
        var machinesWithoutMyRepo = rows.Where(m => m.reachable && !m.repos.Any(r => r.sameRepo)).Select(m => m.machine).ToList();
        var youLabel = me is null ? (myHandle ?? repoId) : $"{machines.First(m => m.Self).Machine}/{me.Handle}";
        var detail = $"you are {youLabel}. {rows.Count} machine(s), {agents.Count} agent(s)"
            + (dark.Count > 0 ? $"; not answering: {string.Join(", ", dark)}" : "")
            + ". Same repo as you (the only valid targets for a branch or PR handoff): "
            + (sameRepo.Count == 0 ? "NONE — no other agent of your repo exists in the fleet; to hand a branch to another machine, ask the Operator (via request_arch) to register your repo there" + (machinesWithoutMyRepo.Count > 0 ? $" (machines without it: {string.Join(", ", machinesWithoutMyRepo)})" : "") + "."
               : string.Join(", ", sameRepo.Select(a => $"{a.machine}/{a.handle} ({a.availability}{(a.handoffTarget ? "" : ", not reachable by the arch")})")) + ".")
            + " A question about a MACHINE can go to any agent on it. Name the recipient in your request_arch.";
        return new ToolOutcome(true, "ok", detail, new
        {
            you = new { machine = machines.FirstOrDefault(m => m.Self)?.Machine, repoId, handle = myHandle, name = myName, remoteUrl = myRemote },
            machines = rows,
            sameRepo = sameRepo.Select(a => $"{a.machine}/{a.handle}").ToList(),
            handoffTargets = targets.Select(a => $"{a.machine}/{a.handle}").ToList(),
            machinesWithoutYourRepo = machinesWithoutMyRepo,
            notAnswering = dark,
        });
    }

    private static bool SameRepoRow(PeerRepoRow r, string? remoteUrl, string? handle, string? name)
    {
        var ra = NormalizeRemote(r.RemoteUrl); var rb = NormalizeRemote(remoteUrl);
        if (ra is not null && rb is not null) return ra == rb;
        var hb = HandleBase(handle);
        if (hb.Length > 0 && HandleBase(r.Handle) == hb) return true;
        return !string.IsNullOrWhiteSpace(name) && string.Equals(r.Name, name, StringComparison.OrdinalIgnoreCase);
    }
}
