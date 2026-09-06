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
/// One verification pass over the board (openspec board-verify-remote). Two sources
/// of truth, applied forward-only through <see cref="TaskGraphService.ApplyVerification"/>:
/// <list type="number">
/// <item><b>Local facts</b> (unchanged from openspec kanban-lifecycle-columns): a card
/// assigned to a repo ON THIS MACHINE with a recorded branch is probed in that clone
/// — commits, pushed, PR, merge live per the deploy log.</item>
/// <item><b>PR facts</b>: any card still below pr-merged that names a PR (its recorded
/// PR URL, or its branch in a GitHub repo the hub can name) is checked against GitHub
/// itself — regardless of which machine its assignee runs on. A merged PR is proof:
/// the card lands at pr-merged with its merge commit and PR number even when the
/// branch was deleted on origin. It lands at <c>done</c> when the merge commit is
/// contained in the build the assignee's machine (or this hub) reports as live, or
/// when the repo is not a deployed harness at all.</item>
/// </list>
/// Commit/push facts that only the assignee's machine can see (a branch not yet on
/// origin) are NOT relayed here — that is the peer's own poller's job (follow-up).
/// </summary>
public sealed class BoardVerifier
{
    public sealed record Change(string Id, string Title, string From, string To);
    public sealed record Result(int Checked, int Probed, IReadOnlyList<Change> Changes, IReadOnlyList<string> Notes, long At);

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
            // Verified done is the end of the road. A card that SAYS done but is verified
            // less (an arch or Operator claim, a migrated pre-lifecycle card — openspec
            // board-claims-advisory) keeps being checked like any other, so its badge
            // clears once the facts catch up.
            if (start.VerifiedStatus == TaskLifecycle.Done)
            {
                // Nothing left to verify; a leftover badge on a fully verified card is recomputed away.
                if (start.Warning is not null) _graph.ApplyVerification(start.Id, new TaskLifecycle.Facts(false, null, false, false, null, null, false, null, false), now);
                continue;
            }
            checkedCount++;
            var n = start;

            // 1. Local facts: this machine's repo, recorded branch.
            if (n.SourceId is null && n.RepoId is not null && n.Branch is not null
                && localRepoPaths.TryGetValue(n.RepoId, out var repoPath) && Directory.Exists(repoPath))
            {
                probed++;
                var facts = _local.Probe(repoPath, n.Branch);
                n = _graph.ApplyVerification(n.Id, facts, now) ?? n;
            }

            // 2. PR facts, for any card that can name a PR: below pr-merged GitHub is
            //    asked; at pr-merged only the "is the merge live yet" question is re-judged
            //    (no GitHub call once the merge commit and PR number are on the card).
            var pr = ResolvePr(n, localRepoPaths, CloneFor);
            if (pr is null) { Record(start, n); continue; }

            PrFacts? prFacts;
            if (n.MergeCommit is not null && n.PrNumber is not null && TaskLifecycle.Rank(n.VerifiedStatus) >= TaskLifecycle.Rank(TaskLifecycle.PrMerged))
            {
                // Already verified merged; only the "live" question is open — no gh call.
                prFacts = new PrFacts(n.PrUrl ?? "", n.PrNumber.Value, "MERGED", n.MergeCommit, n.HeadCommit, n.Branch);
            }
            else
            {
                probed++;
                prFacts = _pr.ProbePr(pr);
                if (prFacts is null) { notes.Add($"{Short(n)}: no PR found for {Describe(pr)}"); Record(start, n); continue; }
            }

            var live = false;
            if (prFacts.Merged)
            {
                var clone = CloneFor(pr.OwnerRepo);
                if (prFacts.MergeCommit is null) live = false;
                else if (clone is null) { live = false; notes.Add($"{Short(n)}: merged (PR #{prFacts.Number}) but no local clone of {pr.OwnerRepo} to judge whether the merge is live — landing at pr-merged"); }
                else if (!IsDeployedHarness(clone)) live = true;
                else
                {
                    var lives = LiveCommits(n);
                    var anc = lives.Count == 0 ? null : _pr.MergeIsAncestor(clone, prFacts.MergeCommit, lives);
                    live = anc == true;
                    if (anc is null && lives.Count > 0) notes.Add($"{Short(n)}: the clone of {pr.OwnerRepo} does not know {Shorten(prFacts.MergeCommit)} or the live commits yet");
                }
            }
            var observed = new TaskLifecycle.Facts(
                BranchExists: prFacts.HeadRefOid is not null, HeadCommit: prFacts.HeadRefOid, HasCommits: true, OnOrigin: true,
                PrUrl: string.IsNullOrEmpty(prFacts.Url) ? n.PrUrl : prFacts.Url, PrNumber: prFacts.Number,
                PrMerged: prFacts.Merged, MergeCommit: prFacts.MergeCommit, MergeLive: live);
            n = _graph.ApplyVerification(n.Id, observed, now) ?? n;
            Record(start, n);
        }

        if (changes.Count > 0)
            _logger.Info($"[TASKVERIFY] pass: {checkedCount} card(s) checked, {probed} probed, {changes.Count} moved: {string.Join("; ", changes.Select(c => $"{c.Id[..Math.Min(8, c.Id.Length)]} {c.From}→{c.To}"))}");
        return new Result(checkedCount, probed, changes, notes, now);

        void Record(TaskGraphService.Node before, TaskGraphService.Node after)
        {
            if (before.Status != after.Status) changes.Add(new Change(after.Id, after.Title, before.Status, after.Status));
        }
    }

    /// <summary>The commits the merge must be contained in to count as live: the
    /// assignee machine's live build (a peer's, or this hub's for a local assignee)
    /// and this hub's own — "live on the assignee machine or the hub".</summary>
    private List<string> LiveCommits(TaskGraphService.Node n)
    {
        var lives = new List<string>();
        if (_fleet is null) return lives;
        if (n.SourceId is not null && n.RepoId is not null)
        {
            var (_, peerLive) = _fleet.Assignee(n.SourceId, n.RepoId);
            if (!string.IsNullOrWhiteSpace(peerLive)) lives.Add(peerLive!);
        }
        if (!string.IsNullOrWhiteSpace(_fleet.HubLiveCommit) && !lives.Contains(_fleet.HubLiveCommit!, StringComparer.OrdinalIgnoreCase)) lives.Add(_fleet.HubLiveCommit!);
        return lives;
    }

    /// <summary>Name the PR to ask GitHub about: the recorded PR URL first; else the
    /// recorded branch in the assignee repo's GitHub remote (a peer's, from the fleet
    /// cache; a local one, from its clone).</summary>
    private PrRef? ResolvePr(TaskGraphService.Node n, IReadOnlyDictionary<string, string> localRepoPaths, Func<string, string?> cloneFor)
    {
        if (PrRef.FromUrl(n.PrUrl) is { } fromUrl) return fromUrl;
        if (n.RepoId is null) return null;
        string? remote = null;
        if (n.SourceId is not null) remote = _fleet?.Assignee(n.SourceId, n.RepoId).RemoteUrl;
        else if (localRepoPaths.TryGetValue(n.RepoId, out var path)) remote = _pr.OriginUrl(path);
        var ownerRepo = PrRef.OwnerRepoOf(remote);
        if (ownerRepo is null) return null;
        if (n.PrNumber is not null) return new PrRef(ownerRepo, n.PrNumber, null);
        return n.Branch is null ? null : new PrRef(ownerRepo, null, n.Branch);
    }

    private static string Describe(PrRef pr) => pr.Number is not null ? $"{pr.OwnerRepo}#{pr.Number}" : $"{pr.OwnerRepo} head {pr.Branch}";
    private static string Short(TaskGraphService.Node n) => n.Id.Length > 8 ? n.Id[..8] : n.Id;
    private static string Shorten(string sha) => sha.Length > 7 ? sha[..7] : sha;
}
