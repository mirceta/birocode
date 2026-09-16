using System.Text.RegularExpressions;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.TaskGraph;

/// <summary>What the hub knows about a repo agent on ANOTHER machine, for the
/// verifier (openspec board-verify-remote): the repo's remote URL as the peer last
/// described it, and the commit the peer is live on (parsed from its build version).
/// Implemented in the arch module over the fleet cache; the task-graph module only
/// sees this interface, so the verifier stays testable without a fleet.</summary>
public interface ITaskFleetInfo
{
    /// <summary>The remote URL and live commit of (sourceId, repoId); nulls when the
    /// peer has not answered or does not list that repo.</summary>
    (string? RemoteUrl, string? LiveCommit) Assignee(string sourceId, string repoId);

    /// <summary>The commit THIS harness is live on (its build version), or null.</summary>
    string? HubLiveCommit { get; }
}

/// <summary>A pull request named either by number in <c>owner/repo</c> or by its
/// head branch there.</summary>
public sealed record PrRef(string OwnerRepo, int? Number, string? Branch)
{
    private static readonly Regex PullUrl = new(@"^https?://github\.com/([^/\s]+/[^/\s]+)/pull/(\d+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>"https://github.com/owner/repo/pull/72" → (owner/repo, 72); null otherwise.</summary>
    public static PrRef? FromUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        var m = PullUrl.Match(url.Trim());
        if (!m.Success) return null;
        var ownerRepo = m.Groups[1].Value;
        if (ownerRepo.EndsWith(".git", StringComparison.OrdinalIgnoreCase)) ownerRepo = ownerRepo[..^4];
        return new PrRef(ownerRepo, int.Parse(m.Groups[2].Value), null);
    }

    /// <summary>"https://github.com/o/r.git", "git@github.com:o/r.git", "ssh://git@github.com/o/r"
    /// → "o/r"; null for anything that is not a github.com remote.</summary>
    public static string? OwnerRepoOf(string? remoteUrl)
    {
        if (string.IsNullOrWhiteSpace(remoteUrl)) return null;
        var u = remoteUrl.Trim();
        u = Regex.Replace(u, @"^[a-z+]+://", "", RegexOptions.IgnoreCase);   // scheme
        u = Regex.Replace(u, @"^[^@/]+@", "");                                // user@
        u = Regex.Replace(u, @"^([^/:]+):(?!/)", "$1/");                       // scp-style host:path
        u = u.TrimEnd('/');
        if (u.EndsWith(".git", StringComparison.OrdinalIgnoreCase)) u = u[..^4];
        var parts = u.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 3 || !parts[0].Equals("github.com", StringComparison.OrdinalIgnoreCase)) return null;
        return parts[1] + "/" + parts[2];
    }

    public static bool SameRepo(string? a, string? b) =>
        a is not null && b is not null && string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
}

/// <summary>What GitHub says about one PR: enough for pr-opened / pr-merged and the
/// merge commit. <c>HeadRefOid</c> survives the branch's deletion on origin.</summary>
public sealed record PrFacts(string Url, int Number, string State, string? MergeCommit, string? HeadRefOid, string? HeadRefName)
{
    public bool Merged => string.Equals(State, "MERGED", StringComparison.OrdinalIgnoreCase);
}

/// <summary>GitHub-side facts (through <c>gh</c>) and local-clone ancestry, abstracted
/// so the verifier is unit-testable without gh or git.</summary>
public interface IPrFactsProbe
{
    /// <summary>The PR named by <paramref name="pr"/> (by number, else the newest PR
    /// whose head is the branch), or null when GitHub knows none / gh is unavailable.</summary>
    PrFacts? ProbePr(PrRef pr);

    /// <summary>Is <paramref name="mergeCommit"/> an ancestor of any of
    /// <paramref name="liveCommits"/>, judged in <paramref name="clonePath"/>? Null when
    /// the clone cannot say (commit unknown to it).</summary>
    bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits);

    /// <summary>The clone's <c>origin</c> URL, or null.</summary>
    string? OriginUrl(string clonePath);
}

/// <summary>
/// One verification pass over the board (openspec board-verify-remote; per assignee
/// since openspec task-multi-assignee). For EVERY assignee of every card that is not
/// done, two sources of truth, applied forward-only through
/// <see cref="TaskGraphService.ApplyVerification(string, string?, TaskLifecycle.Facts, long)"/>
/// on that assignee (the parent card re-aggregates):
/// <list type="number">
/// <item><b>Local facts</b> (openspec kanban-lifecycle-columns): an assignee on a repo ON
/// THIS MACHINE with a recorded branch is probed in that clone — commits, pushed, PR,
/// merge live per the deploy log.</item>
/// <item><b>PR facts</b>: an assignee still short of pr-merged that names a PR (its
/// recorded PR URL, or its branch in its repo's GitHub remote) is checked against GitHub
/// itself, whichever machine it runs on. A merged PR is proof: pr-merged with the merge
/// commit and PR number even when the branch was deleted on origin; done when the merge
/// commit is contained in the build the assignee's machine (or this hub) reports as
/// live, or when the repo is not a deployed harness at all.</item>
/// </list>
/// Commit/push facts that only the assignee's machine can see are NOT relayed here —
/// that is the peer's own poller's job (follow-up).
/// </summary>
public sealed class BoardVerifier
{
    /// <summary>One move: the card, and the assignee it happened on (null = the card
    /// itself, an unassigned card or the aggregate).</summary>
    public sealed record Change(string Id, string Title, string From, string To, string? Assignee = null);
    public sealed record Result(int Checked, int Probed, IReadOnlyList<Change> Changes, IReadOnlyList<string> Notes, long At);

    private static readonly TaskLifecycle.Facts NoFacts = new(false, null, false, false, null, null, false, null, false);

    private readonly TaskGraphService _graph;
    private readonly ITaskFactsProbe _local;
    private readonly IPrFactsProbe _pr;
    private readonly ITaskFleetInfo? _fleet;
    private readonly Logger _logger;

    public BoardVerifier(TaskGraphService graph, ITaskFactsProbe local, IPrFactsProbe pr, ITaskFleetInfo? fleet, Logger logger)
    {
        _graph = graph;
        _local = local;
        _pr = pr;
        _fleet = fleet;
        _logger = logger;
    }

    /// <summary>Whether a clone is a deployed harness (carries the committed deploy
    /// pipeline): for those, merged is not yet live.</summary>
    public static bool IsDeployedHarness(string clonePath) => File.Exists(Path.Combine(clonePath, "swap.ps1"));

    /// <param name="localRepoPaths">repo id → checkout path for every repo on this machine.</param>
    /// <param name="now">unix ms.</param>
    public Result VerifyOnce(IReadOnlyDictionary<string, string> localRepoPaths, long now)
    {
        var changes = new List<Change>();
        var notes = new List<string>();
        var checkedCount = 0;
        var probed = 0;
        // owner/repo → local clone path, resolved lazily (one git call per local repo per pass).
        Dictionary<string, string>? clones = null;
        string? CloneFor(string ownerRepo)
        {
            if (clones is null)
            {
                clones = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var (_, path) in localRepoPaths)
                {
                    var or = PrRef.OwnerRepoOf(_pr.OriginUrl(path));
                    if (or is not null && !clones.ContainsKey(or)) clones[or] = path;
                }
            }
            return clones.TryGetValue(ownerRepo, out var p) ? p : null;
        }

        foreach (var start in _graph.Get().Nodes)
        {
            var assignees = TaskGraphService.AssigneesOf(start);
            // The targets of this card: its assignees (each on its own key), or — for an
            // unassigned card that still names a PR or carries a claim — the card itself
            // (null key: the legacy whole-card path).
            var targets = assignees.Count == 0
                ? new List<(string? Key, TaskGraphService.Assignee A)> { (null, AsTarget(start)) }
                : assignees.Select(a => ((string?)a.Key, a)).ToList();
            var multi = assignees.Count > 1;
            var cardBefore = start.Status;
            foreach (var (key, a0) in targets)
            {
                var label = multi ? $"{start.Title} [{a0.RepoId}]" : start.Title;
                // Verified done is the end of the road. An assignee that SAYS done but is
                // verified less (a claim, a migrated pre-lifecycle card — openspec
                // board-claims-advisory) keeps being checked like any other, so its badge
                // clears once the facts catch up.
                if (a0.VerifiedStatus == TaskLifecycle.Done)
                {
                    // Nothing left to verify; a leftover badge on a fully verified one is recomputed away.
                    if (a0.Warning is not null) _graph.ApplyVerification(start.Id, key, NoFacts, now);
                    continue;
                }
                checkedCount++;
                var a = a0;

                // 1. Local facts: this machine's repo, recorded branch.
                if (a.SourceId is null && a.RepoId.Length > 0 && a.Branch is not null
                    && localRepoPaths.TryGetValue(a.RepoId, out var repoPath) && Directory.Exists(repoPath))
                {
                    probed++;
                    var facts = _local.Probe(repoPath, a.Branch);
                    a = Current(_graph.ApplyVerification(start.Id, key, facts, now), key) ?? a;
                }

                // 2. PR facts, for any assignee that can name a PR: below pr-merged GitHub is
                //    asked; at pr-merged only the "is the merge live yet" question is re-judged
                //    (no GitHub call once the merge commit and PR number are on the assignee).
                var pr = ResolvePr(a, localRepoPaths);
                if (pr is null) { RecordMove(start.Id, label, a0.Status, a.Status, multi ? a.RepoId : null); continue; }

                PrFacts? prFacts;
                if (a.MergeCommit is not null && a.PrNumber is not null && TaskLifecycle.Rank(a.VerifiedStatus) >= TaskLifecycle.Rank(TaskLifecycle.PrMerged))
                {
                    prFacts = new PrFacts(a.PrUrl ?? "", a.PrNumber.Value, "MERGED", a.MergeCommit, a.HeadCommit, a.Branch);
                }
                else
                {
                    probed++;
                    prFacts = _pr.ProbePr(pr);
                    if (prFacts is null) { notes.Add($"{Short(start.Id)}{(multi ? "[" + a.RepoId + "]" : "")}: no PR found for {Describe(pr)}"); RecordMove(start.Id, label, a0.Status, a.Status, multi ? a.RepoId : null); continue; }
                }

                var live = false;
                if (prFacts.Merged)
                {
                    var clone = CloneFor(pr.OwnerRepo);
                    if (prFacts.MergeCommit is null) live = false;
                    else if (clone is null) { live = false; notes.Add($"{Short(start.Id)}: merged (PR #{prFacts.Number}) but no local clone of {pr.OwnerRepo} to judge whether the merge is live — landing at pr-merged"); }
                    else if (!IsDeployedHarness(clone)) live = true;
                    else
                    {
                        var lives = LiveCommits(a);
                        var anc = lives.Count == 0 ? null : _pr.MergeIsAncestor(clone, prFacts.MergeCommit, lives);
                        live = anc == true;
                        if (anc is null && lives.Count > 0) notes.Add($"{Short(start.Id)}: the clone of {pr.OwnerRepo} does not know {Shorten(prFacts.MergeCommit)} or the live commits yet");
                    }
                }
                var observed = new TaskLifecycle.Facts(
                    BranchExists: prFacts.HeadRefOid is not null, HeadCommit: prFacts.HeadRefOid, HasCommits: true, OnOrigin: true,
                    PrUrl: string.IsNullOrEmpty(prFacts.Url) ? a.PrUrl : prFacts.Url, PrNumber: prFacts.Number,
                    PrMerged: prFacts.Merged, MergeCommit: prFacts.MergeCommit, MergeLive: live);
                a = Current(_graph.ApplyVerification(start.Id, key, observed, now), key) ?? a;
                RecordMove(start.Id, label, a0.Status, a.Status, multi ? a.RepoId : null);
            }
            // The card's own move (the aggregate), when several assignees own it.
            if (multi && _graph.Find(start.Id) is { } after && after.Status != cardBefore)
                changes.Add(new Change(start.Id, start.Title, cardBefore, after.Status));
        }

        if (changes.Count > 0)
            _logger.Info($"[TASKVERIFY] pass: {checkedCount} assignee(s) checked, {probed} probed, {changes.Select(c => c.Id).Distinct().Count()} card(s) moved: {string.Join("; ", changes.Select(c => $"{c.Id[..Math.Min(8, c.Id.Length)]}{(c.Assignee is null ? "" : "[" + c.Assignee + "]")} {c.From}→{c.To}"))}");
        return new Result(checkedCount, probed, changes, notes, now);

        void RecordMove(string id, string title, string from, string to, string? assignee)
        {
            if (from != to) changes.Add(new Change(id, title, from, to, assignee));
        }
    }

    /// <summary>An unassigned card as a verification target: its own fields, no repo.</summary>
    private static TaskGraphService.Assignee AsTarget(TaskGraphService.Node n) =>
        new(n.SourceId, n.RepoId ?? "", n.Status, n.AssignedBy, n.AssignedAt, n.DispatchedAt, n.DispatchCount,
            n.Branch, n.HeadCommit, n.Pushed, n.PrUrl, n.PrNumber, n.MergeCommit, n.VerifiedStatus, n.VerifiedAt, n.Warning, n.UpdatedAt);

    private static TaskGraphService.Assignee? Current(TaskGraphService.Node? node, string? key) =>
        node is null ? null : key is null ? AsTarget(node) : TaskGraphService.AssigneesOf(node).FirstOrDefault(a => a.Key == key);

    /// <summary>The commits the merge must be contained in to count as live: the
    /// assignee machine's live build (a peer's, or this hub's for a local assignee)
    /// and this hub's own — "live on the assignee machine or the hub".</summary>
    private List<string> LiveCommits(TaskGraphService.Assignee a)
    {
        var lives = new List<string>();
        if (_fleet is null) return lives;
        if (a.SourceId is not null)
        {
            var (_, peerLive) = _fleet.Assignee(a.SourceId, a.RepoId);
            if (!string.IsNullOrWhiteSpace(peerLive)) lives.Add(peerLive!);
        }
        if (!string.IsNullOrWhiteSpace(_fleet.HubLiveCommit) && !lives.Contains(_fleet.HubLiveCommit!, StringComparer.OrdinalIgnoreCase)) lives.Add(_fleet.HubLiveCommit!);
        return lives;
    }

    /// <summary>Name the PR to ask GitHub about: the recorded PR URL first; else the
    /// recorded branch in the assignee repo's GitHub remote (a peer's, from the fleet
    /// cache; a local one, from its clone).</summary>
    private PrRef? ResolvePr(TaskGraphService.Assignee a, IReadOnlyDictionary<string, string> localRepoPaths)
    {
        if (PrRef.FromUrl(a.PrUrl) is { } fromUrl) return fromUrl;
        if (a.RepoId.Length == 0) return null; // an unassigned card: only its PR URL can name a PR
        string? remote = null;
        if (a.SourceId is not null) remote = _fleet?.Assignee(a.SourceId, a.RepoId).RemoteUrl;
        else if (localRepoPaths.TryGetValue(a.RepoId, out var path)) remote = _pr.OriginUrl(path);
        var ownerRepo = PrRef.OwnerRepoOf(remote);
        if (ownerRepo is null) return null;
        if (a.PrNumber is not null) return new PrRef(ownerRepo, a.PrNumber, null);
        return a.Branch is null ? null : new PrRef(ownerRepo, null, a.Branch);
    }

    private static string Describe(PrRef pr) => pr.Number is not null ? $"{pr.OwnerRepo}#{pr.Number}" : $"{pr.OwnerRepo} head {pr.Branch}";
    private static string Short(string id) => id.Length > 8 ? id[..8] : id;
    private static string Shorten(string sha) => sha.Length > 7 ? sha[..7] : sha;
}
