using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec board-verify-remote: the verifier pass over the whole board —
/// cards assigned to agents on OTHER machines are verified from their PR on GitHub,
/// a merged PR is proof even when the branch is gone from origin, the merge counts
/// as live from the build the assignee's machine (or the hub) reports, a pass never
/// demotes and is idempotent (the backfill), and PR / remote references parse.</summary>
public sealed class TaskBoardVerifierTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-verifier-" + Guid.NewGuid().ToString("N"));
    private static readonly TaskLifecycle.Facts NoFacts = new(false, null, false, false, null, null, false, null, false);
    private const string PrUrl66 = "https://github.com/mirceta/birocode/pull/66";

    public TaskBoardVerifierTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    // ---- fakes -----------------------------------------------------------------------------

    private sealed class FakeLocal : ITaskFactsProbe
    {
        public TaskLifecycle.Facts Next = NoFacts;
        public int Calls;
        public TaskLifecycle.Facts Probe(string repoPath, string branch) { Calls++; return Next; }
    }

    private sealed class FakePr : IPrFactsProbe
    {
        public readonly Dictionary<string, PrFacts?> ByKey = new(StringComparer.OrdinalIgnoreCase);
        public readonly List<PrRef> Asked = new();
        public bool? Ancestor;
        public readonly Dictionary<string, string> Origins = new(StringComparer.OrdinalIgnoreCase);
        public PrFacts? ProbePr(PrRef pr)
        {
            Asked.Add(pr);
            var key = pr.Number is { } n ? $"{pr.OwnerRepo}#{n}" : $"{pr.OwnerRepo}@{pr.Branch}";
            return ByKey.TryGetValue(key, out var f) ? f : null;
        }
        public bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits) => Ancestor;
        public string? OriginUrl(string clonePath) => Origins.TryGetValue(clonePath, out var o) ? o : null;
    }

    private sealed class FakeFleet : ITaskFleetInfo
    {
        public readonly Dictionary<string, (string? RemoteUrl, string? LiveCommit)> Map = new(StringComparer.Ordinal);
        public string? HubLiveCommit { get; set; }
        public (string? RemoteUrl, string? LiveCommit) Assignee(string sourceId, string repoId) =>
            Map.TryGetValue(sourceId + "|" + repoId, out var v) ? v : (null, null);
    }

    private static PrFacts Merged(int number, string mergeCommit, string? headOid = null) =>
        new($"https://github.com/mirceta/birocode/pull/{number}", number, "MERGED", mergeCommit, headOid, "feature/x");

    private TaskGraphService Graph() => new(new Logger(), _dir);

    private string Clone(bool deployedHarness)
    {
        var path = Path.Combine(_dir, deployedHarness ? "harness" : "plain");
        Directory.CreateDirectory(path);
        if (deployedHarness) File.WriteAllText(Path.Combine(path, "swap.ps1"), "# deploy pipeline");
        return path;
    }

    // ---- 1. remote assignee verified from its PR -----------------------------------------------

    [Fact]
    public void Remote_assignee_card_is_verified_from_its_PR_even_with_the_branch_deleted()
    {
        var g = Graph();
        var n = g.AddNode("Task graph colours", null, null, null, 0, 0, now: 1)!;
        g.Assign(n.Id, "src-spacex", "p-colours", "arch", 2);          // an agent on spacex
        g.UpdateNode(n.Id, null, null, null, null, "doing", null, null, 3);
        g.RecordClaim(n.Id, "feature/taskgraph-colours", null, PrUrl66, 4); // the relayed claim
        var pr = new FakePr();
        pr.ByKey["mirceta/birocode#66"] = Merged(66, "m66");              // headRefOid null: branch gone
        var local = new FakeLocal();
        var v = new BoardVerifier(g, local, pr, new FakeFleet(), new Logger());

        var r = v.VerifyOnce(new Dictionary<string, string>(), 10);        // no local clones at all

        var after = g.Find(n.Id)!;
        Assert.Equal("pr-merged", after.Status);
        Assert.Equal("pr-merged", after.VerifiedStatus);
        Assert.Equal(66, after.PrNumber);
        Assert.Equal("m66", after.MergeCommit);
        Assert.Equal(PrUrl66, after.PrUrl);
        Assert.Equal(0, local.Calls);                                     // never probed a local clone for a remote card
        Assert.Single(r.Changes);
        Assert.Equal(("doing", "pr-merged"), (r.Changes[0].From, r.Changes[0].To));
        Assert.Contains(r.Notes, x => x.Contains("no local clone"));

        // The backfill is idempotent: a second pass moves nothing and asks GitHub nothing new.
        var again = v.VerifyOnce(new Dictionary<string, string>(), 11);
        Assert.Empty(again.Changes);
        Assert.Single(pr.Asked);
        Assert.Equal("pr-merged", g.Find(n.Id)!.Status);
    }

    [Fact]
    public void Remote_card_without_a_PR_url_is_found_by_its_branch_in_the_peers_remote()
    {
        var g = Graph();
        var n = g.AddNode("Handles", null, null, null, 0, 0, now: 1)!;
        g.Assign(n.Id, "src-spacex", "p-handles", "arch", 2);
        g.RecordClaim(n.Id, "feature/handles", null, null, 3);
        var fleet = new FakeFleet();
        fleet.Map["src-spacex|p-handles"] = ("git@github.com:mirceta/birocode.git", null);
        var pr = new FakePr();
        pr.ByKey["mirceta/birocode@feature/handles"] = new PrFacts("https://github.com/mirceta/birocode/pull/64", 64, "OPEN", null, "h64", "feature/handles");
        var v = new BoardVerifier(g, new FakeLocal(), pr, fleet, new Logger());

        v.VerifyOnce(new Dictionary<string, string>(), 10);

        var after = g.Find(n.Id)!;
        Assert.Equal("pr-opened", after.Status);
        Assert.Equal(64, after.PrNumber);
        Assert.Equal("h64", after.HeadCommit);
        Assert.True(after.Pushed);
        Assert.Equal("mirceta/birocode", pr.Asked.Single().OwnerRepo);
        Assert.Equal("feature/handles", pr.Asked.Single().Branch);
    }

    [Fact]
    public void Remote_card_with_no_way_to_name_a_PR_is_left_alone()
    {
        var g = Graph();
        var n = g.AddNode("Mystery", null, null, null, 0, 0, now: 1)!;
        g.Assign(n.Id, "src-dark", "p1", "arch", 2);
        g.UpdateNode(n.Id, null, null, null, null, "doing", null, null, 3);
        var pr = new FakePr();
        var v = new BoardVerifier(g, new FakeLocal(), pr, new FakeFleet(), new Logger());
        var r = v.VerifyOnce(new Dictionary<string, string>(), 10);
        Assert.Empty(r.Changes);
        Assert.Empty(pr.Asked);
        Assert.Equal("doing", g.Find(n.Id)!.Status);
    }

    // ---- 2. merged = live? ----------------------------------------------------------------------

    [Fact]
    public void Merged_PR_is_done_when_the_merge_is_in_the_assignee_machines_live_build()
    {
        var g = Graph();
        var n = g.AddNode("Lifecycle columns", null, null, null, 0, 0, now: 1)!;
        g.Assign(n.Id, "src-spacex", "p-birocode", "arch", 2);
        g.RecordClaim(n.Id, "feature/kanban-lifecycle-columns", null, "https://github.com/mirceta/birocode/pull/74", 3);
        var clone = Clone(deployedHarness: true);
        var pr = new FakePr { Ancestor = true };
        pr.Origins[clone] = "https://github.com/mirceta/birocode.git";
        pr.ByKey["mirceta/birocode#74"] = Merged(74, "m74");
        var fleet = new FakeFleet { HubLiveCommit = "hub-live" };
        fleet.Map["src-spacex|p-birocode"] = ("https://github.com/mirceta/birocode.git", "peer-live");
        var v = new BoardVerifier(g, new FakeLocal(), pr, fleet, new Logger());

        v.VerifyOnce(new Dictionary<string, string> { ["self"] = clone }, 10);

        var after = g.Find(n.Id)!;
        Assert.Equal("done", after.Status);
        Assert.Equal("m74", after.MergeCommit);
        Assert.Equal(74, after.PrNumber);
    }

    [Fact]
    public void Merged_PR_stays_pr_merged_until_the_merge_is_live_then_advances_without_asking_GitHub_again()
    {
        var g = Graph();
        var n = g.AddNode("Arch loop tools", null, null, null, 0, 0, now: 1)!;
        g.Assign(n.Id, "src-razvoj", "p-birocode", "arch", 2);
        g.RecordClaim(n.Id, null, null, "https://github.com/mirceta/birocode/pull/70", 3);
        var clone = Clone(deployedHarness: true);
        var pr = new FakePr { Ancestor = false };
        pr.Origins[clone] = "git@github.com:mirceta/birocode.git";
        pr.ByKey["mirceta/birocode#70"] = Merged(70, "m70");
        var fleet = new FakeFleet { HubLiveCommit = "hub-old" };
        var v = new BoardVerifier(g, new FakeLocal(), pr, fleet, new Logger());
        var paths = new Dictionary<string, string> { ["self"] = clone };

        v.VerifyOnce(paths, 10);
        Assert.Equal("pr-merged", g.Find(n.Id)!.Status);
        Assert.Single(pr.Asked);

        // The hub (or the peer) deploys a build that contains the merge: done, no new gh call.
        pr.Ancestor = true;
        fleet.HubLiveCommit = "hub-new";
        var r = v.VerifyOnce(paths, 20);
        Assert.Equal("done", g.Find(n.Id)!.Status);
        Assert.Single(pr.Asked);
        Assert.Single(r.Changes);
    }

    [Fact]
    public void Merged_PR_in_a_repo_that_is_not_a_deployed_harness_is_done_at_once()
    {
        var g = Graph();
        var n = g.AddNode("Game arcade sounds", null, null, null, 0, 0, now: 1)!;
        g.Assign(n.Id, "src-living", "p-arcade", "arch", 2);
        g.RecordClaim(n.Id, null, null, "https://github.com/mirceta/game-arcade/pull/3", 3);
        var clone = Clone(deployedHarness: false);
        var pr = new FakePr { Ancestor = null };
        pr.Origins[clone] = "https://github.com/mirceta/game-arcade";
        pr.ByKey["mirceta/game-arcade#3"] = Merged(3, "m3");
        var v = new BoardVerifier(g, new FakeLocal(), pr, new FakeFleet(), new Logger());

        v.VerifyOnce(new Dictionary<string, string> { ["arcade"] = clone }, 10);
        Assert.Equal("done", g.Find(n.Id)!.Status);
    }

    // ---- 3. local cards: git first, then the PR as proof when the branch vanished --------------

    [Fact]
    public void Local_card_whose_branch_vanished_is_proven_by_its_merged_PR()
    {
        var g = Graph();
        var clone = Clone(deployedHarness: true);
        var n = g.AddNode("Task filters", null, "r-self", null, 0, 0, now: 1)!;
        g.RecordClaim(n.Id, "feature/task-filters", "9d22f5c", "https://github.com/mirceta/birocode/pull/72", 2);
        var local = new FakeLocal { Next = NoFacts };                       // branch deleted locally and on origin
        var pr = new FakePr { Ancestor = true };
        pr.Origins[clone] = "https://github.com/mirceta/birocode.git";
        pr.ByKey["mirceta/birocode#72"] = Merged(72, "m72");
        var fleet = new FakeFleet { HubLiveCommit = "hub-live" };
        var v = new BoardVerifier(g, local, pr, fleet, new Logger());

        var r = v.VerifyOnce(new Dictionary<string, string> { ["r-self"] = clone }, 10);

        Assert.Equal(1, local.Calls);
        Assert.Single(pr.Asked);
        Assert.Equal("done", g.Find(n.Id)!.Status);
        Assert.Equal("m72", g.Find(n.Id)!.MergeCommit);
        Assert.Equal(2, r.Probed);
    }

    // ---- 4. never demote; done cards are not touched -----------------------------------------

    [Fact]
    public void A_pass_never_demotes_and_skips_done_cards()
    {
        var g = Graph();
        var merged = g.AddNode("Merged one", null, null, null, 0, 0, now: 1)!;
        g.Assign(merged.Id, "src-spacex", "p1", "arch", 2);
        g.RecordClaim(merged.Id, null, null, "https://github.com/mirceta/birocode/pull/69", 3);
        g.ApplyVerification(merged.Id, NoFacts with { HasCommits = true, OnOrigin = true, PrNumber = 69, PrUrl = "u", PrMerged = true, MergeCommit = "m69" }, 4);
        Assert.Equal("pr-merged", g.Find(merged.Id)!.Status);
        var done = g.AddNode("Done one", null, null, null, 0, 0, now: 5)!;
        g.UpdateNode(done.Id, null, null, null, null, "done", null, null, 6);

        var pr = new FakePr();
        pr.ByKey["mirceta/birocode#69"] = new PrFacts("u", 69, "OPEN", null, "h", "b"); // GitHub now says open (reverted merge?)
        var v = new BoardVerifier(g, new FakeLocal(), pr, new FakeFleet(), new Logger());
        var r = v.VerifyOnce(new Dictionary<string, string>(), 10);

        Assert.Equal("pr-merged", g.Find(merged.Id)!.Status);
        Assert.Equal("done", g.Find(done.Id)!.Status);
        Assert.Empty(r.Changes);
        Assert.Equal(1, r.Checked); // the done card is not even looked at
    }

    // ---- 4b. the migration warning clears once the merge is verified -----------------------------

    [Fact]
    public void A_verified_merge_clears_the_migration_warning_on_a_remote_card()
    {
        // The exact shape of the stuck cards: migrated from pre-lifecycle "done" without
        // merge evidence (→ committed + warning), assigned to a peer's agent, PR URL relayed.
        File.WriteAllText(Path.Combine(_dir, "taskgraph.json"),
            """{"Nodes":[{"Id":"bed0f74a","Title":"Stable handles","Note":null,"RepoId":"p-birocode","MachineId":null,"Status":"done","X":0,"Y":0,"CreatedAt":1,"UpdatedAt":1,"SourceId":"src-spacex","PrUrl":"https://github.com/mirceta/birocode/pull/64"}],"Edges":[],"Machines":[],"Scratch":"","Tombstones":[]}""");
        var g = Graph();
        var stuck = g.Find("bed0f74a")!;
        Assert.Equal("committed", stuck.Status);
        Assert.Contains("migrated", stuck.Warning);

        var pr = new FakePr();
        pr.ByKey["mirceta/birocode#64"] = Merged(64, "m64");
        var v = new BoardVerifier(g, new FakeLocal(), pr, new FakeFleet(), new Logger());
        v.VerifyOnce(new Dictionary<string, string>(), 10);

        var after = g.Find("bed0f74a")!;
        Assert.Equal("pr-merged", after.Status);
        Assert.Null(after.Warning);
        Assert.Equal(64, after.PrNumber);
        Assert.Equal("m64", after.MergeCommit);
    }

    [Fact]
    public void A_done_card_verified_earlier_sheds_its_leftover_warning_without_being_re_probed()
    {
        // Schema 2 board (no migration): the card reached done under the old poller while the
        // migration badge stayed on — exactly the hub's own card after PR #72.
        File.WriteAllText(Path.Combine(_dir, "taskgraph.json"),
            """{"SchemaVersion":2,"Nodes":[{"Id":"64c966f6","Title":"Task filters","Note":null,"RepoId":"r-self","MachineId":null,"Status":"done","X":0,"Y":0,"CreatedAt":1,"UpdatedAt":1,"PrUrl":"https://github.com/mirceta/birocode/pull/72","PrNumber":72,"MergeCommit":"m72","VerifiedStatus":"done","Warning":"migrated: was done, no merged PR recorded for this task"}],"Edges":[],"Machines":[],"Scratch":"","Tombstones":[]}""");
        var g = Graph();
        Assert.Equal("done", g.Find("64c966f6")!.Status);
        Assert.NotNull(g.Find("64c966f6")!.Warning);

        var pr = new FakePr();
        var local = new FakeLocal();
        var r = new BoardVerifier(g, local, pr, new FakeFleet(), new Logger()).VerifyOnce(new Dictionary<string, string> { ["r-self"] = _dir }, 10);

        Assert.Null(g.Find("64c966f6")!.Warning);
        Assert.Equal("done", g.Find("64c966f6")!.Status);
        Assert.Equal(0, r.Checked);
        Assert.Empty(r.Changes);
        Assert.Equal(0, local.Calls);
        Assert.Empty(pr.Asked);
    }

    // ---- 5. references ---------------------------------------------------------------------

    [Theory]
    [InlineData("https://github.com/mirceta/birocode/pull/72", "mirceta/birocode", 72)]
    [InlineData("https://github.com/mirceta/birocode/pull/72/files", "mirceta/birocode", 72)]
    [InlineData("  http://github.com/Some-Org/repo.name/pull/5  ", "Some-Org/repo.name", 5)]
    public void PR_urls_parse_to_owner_repo_and_number(string url, string ownerRepo, int number)
    {
        var pr = PrRef.FromUrl(url)!;
        Assert.Equal(ownerRepo, pr.OwnerRepo);
        Assert.Equal(number, pr.Number);
        Assert.Null(pr.Branch);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("https://gitlab.com/o/r/-/merge_requests/1")]
    [InlineData("https://github.com/mirceta/birocode/issues/72")]
    [InlineData("not a url")]
    public void Non_PR_urls_do_not_parse(string? url) => Assert.Null(PrRef.FromUrl(url));

    [Theory]
    [InlineData("https://github.com/mirceta/birocode.git", "mirceta/birocode")]
    [InlineData("https://github.com/mirceta/birocode", "mirceta/birocode")]
    [InlineData("git@github.com:mirceta/birocode.git", "mirceta/birocode")]
    [InlineData("ssh://git@github.com/mirceta/birocode.git", "mirceta/birocode")]
    [InlineData("https://user@github.com/mirceta/birocode/", "mirceta/birocode")]
    [InlineData("https://gitlab.com/mirceta/birocode.git", null)]
    [InlineData("C:\\repos\\local", null)]
    [InlineData("", null)]
    public void Remote_urls_reduce_to_owner_repo_for_github_only(string remote, string? expected) =>
        Assert.Equal(expected, PrRef.OwnerRepoOf(remote));

    [Theory]
    [InlineData("1.0.0+146c38e3323eada86851f97cfc963db2463c8c0e", "146c38e3323eada86851f97cfc963db2463c8c0e")]
    [InlineData("1.0.0+2d8a4d8", "2d8a4d8")]
    [InlineData("1.0.0", null)]
    [InlineData(null, null)]
    public void A_build_version_yields_its_live_commit(string? version, string? commit) =>
        Assert.Equal(commit, FleetTaskInfo.CommitOf(version));
}
