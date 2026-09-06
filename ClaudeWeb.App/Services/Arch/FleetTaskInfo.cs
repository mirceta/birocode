using System.Text.RegularExpressions;
using ClaudeWeb.Services.TaskGraph;

namespace ClaudeWeb.Services.Arch;

/// <summary>The task verifier's window onto the fleet (openspec board-verify-remote):
/// a remote assignee's repo remote URL and the commit its machine is live on, both
/// from the peer describe the hub already caches (never a blocking call — the
/// poller runs every minute). The live commit is the <c>+&lt;sha&gt;</c> of the
/// peer's build version; this hub's own comes from its assembly version.</summary>
public sealed class FleetTaskInfo : ITaskFleetInfo
{
    private static readonly Regex Sha = new(@"\+([0-9a-f]{7,40})\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private readonly FleetClient _fleet;

    public FleetTaskInfo(FleetClient fleet) { _fleet = fleet; }

    public static string? CommitOf(string? version)
    {
        if (string.IsNullOrWhiteSpace(version)) return null;
        var m = Sha.Match(version);
        return m.Success ? m.Groups[1].Value : null;
    }

    public (string? RemoteUrl, string? LiveCommit) Assignee(string sourceId, string repoId)
    {
        var snap = _fleet.SnapshotNonBlocking(sourceId);
        var repo = snap.Repos.FirstOrDefault(r => string.Equals(r.RepoId, repoId, StringComparison.Ordinal));
        return (repo?.RemoteUrl, CommitOf(snap.Info?.Version));
    }

    public string? HubLiveCommit => CommitOf(ArchAgentService.BuildVersion);
}
