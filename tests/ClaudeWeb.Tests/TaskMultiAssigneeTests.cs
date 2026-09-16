using System.Text.Json;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec task-multi-assignee: a task owned by several repo agents — the
/// assignee set with per-assignee lifecycle state, the aggregate rule for the card,
/// back-compat with single-assignee cards (legacy fields mirror the primary, old JSON
/// reads back as one assignee), per-assignee dispatch / claims / verification, the
/// stale guard, any-assignee matching for list_tasks, and the brief's co-assignee lines.</summary>
public sealed class TaskMultiAssigneeTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-multi-" + Guid.NewGuid().ToString("N"));
    private static readonly TaskLifecycle.Facts NoFacts = new(false, null, false, false, null, null, false, null, false);

    public TaskMultiAssigneeTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private TaskGraphService Graph() => new(new Logger(), _dir);
    private static string Key(string? src, string repo) => TaskGraphService.AssigneeKey(src, repo);

    // Two repos on two machines: prg on spacex + skratek on this hub.
    private static readonly (string? SourceId, string RepoId)[] Two = { ("src-spacex", "p-prg"), (null, "r-skratek") };

    // ---- 1. the aggregate rule ----------------------------------------------------------------

    [Theory]
    [InlineData("todo,todo", "todo")]
    [InlineData("doing,todo", "doing")]          // out of todo once anyone started
    [InlineData("done,todo", "doing")]           // the slowest has not started: the card is doing, not done
    [InlineData("done,doing", "doing")]
    [InlineData("pr-merged,committed", "committed")]
    [InlineData("pr-merged,pr-merged", "pr-merged")]
    [InlineData("done,pr-merged", "pr-merged")]
    [InlineData("done,done", "done")]
    [InlineData("committed", "committed")]       // one assignee reads as itself
    [InlineData("todo", "todo")]
    public void The_card_is_as_far_as_its_slowest_assignee_and_out_of_todo_once_any_started(string statuses, string expected)
    {
        var list = statuses.Split(',').Select((st, i) => new TaskGraphService.Assignee(null, "r" + i, st)).ToList();
        Assert.Equal(expected, TaskGraphService.AggregateStatus(list));
        Assert.Null(TaskGraphService.AggregateStatus(Array.Empty<TaskGraphService.Assignee>()));
    }

    // ---- 2. the set, the mirror, back-compat ----------------------------------------------------

    [Fact]
    public void Assigning_several_agents_keeps_the_legacy_fields_on_the_primary_and_the_status_aggregated()
    {
        var g = Graph();
        var n = g.AddNode("DLL-mode invoice lock", null, null, null, 0, 0, now: 1)!;
        var set = g.SetAssignees(n.Id, Two, "arch", 2)!;
        var list = TaskGraphService.AssigneesOf(set);
        Assert.Equal(2, list.Count);
        Assert.Equal(new[] { Key("src-spacex", "p-prg"), Key(null, "r-skratek") }, list.Select(a => a.Key));
        Assert.All(list, a => { Assert.Equal("todo", a.Status); Assert.Equal("arch", a.AssignedBy); Assert.Equal(2, a.AssignedAt); });
        // The legacy fields mirror the FIRST assignee; the card's status is the aggregate.
        Assert.Equal("p-prg", set.RepoId);
        Assert.Equal("src-spacex", set.SourceId);
        Assert.Equal("arch", set.AssignedBy);
        Assert.Equal("todo", set.Status);
        // Add / remove keep the others' state.
        var three = g.AddAssignee(n.Id, "src-living", "r-webflow", "arch", 3)!;
        Assert.Equal(3, TaskGraphService.AssigneesOf(three).Count);
        var two = g.RemoveAssignee(n.Id, "src-spacex", "p-prg", "arch", 4)!;
        Assert.Equal(new[] { Key(null, "r-skratek"), Key("src-living", "r-webflow") }, TaskGraphService.AssigneesOf(two).Select(a => a.Key));
        Assert.Equal("r-skratek", two.RepoId);   // the new primary
        Assert.Null(two.SourceId);
        // Removing the last one unassigns; the status stays.
        g.RemoveAssignee(n.Id, null, "r-skratek", "arch", 5);
        var none = g.RemoveAssignee(n.Id, "src-living", "r-webflow", "arch", 6)!;
        Assert.Empty(TaskGraphService.AssigneesOf(none));
        Assert.Null(none.RepoId);
        Assert.Equal("todo", none.Status);
    }

    [Fact]
    public void A_single_assignee_card_reads_and_behaves_exactly_as_before()
    {
        var g = Graph();
        var n = g.AddNode("Ship it", null, "r1", null, 0, 0, now: 1, sourceId: null, createdBy: "human")!;
        Assert.Single(TaskGraphService.AssigneesOf(n));
        Assert.Equal("r1", n.RepoId);
        // Legacy Assign replaces the single assignee and resets the dispatch record.
        g.MarkDispatched(n.Id, 2);
        var moved = g.Find(n.Id)!;
        Assert.Equal("doing", moved.Status);
        Assert.Equal(1, moved.DispatchCount);
        var re = g.Assign(n.Id, "src-spacex", "p2", "arch", 3)!;
        Assert.Equal("p2", re.RepoId);
        Assert.Equal("src-spacex", re.SourceId);
        Assert.Equal(0, re.DispatchCount);
        Assert.Null(re.DispatchedAt);
        Assert.Equal("doing", re.Status); // assignment is who, status is where
        // A status set on the card moves its one assignee (they are the same thing).
        var done = g.UpdateNode(n.Id, null, null, null, null, "done", null, null, 4)!;
        Assert.Equal("done", done.Status);
        Assert.Equal("done", TaskGraphService.AssigneesOf(done)[0].Status);
        Assert.Equal("claimed done, verified: nothing — no facts observed yet", done.Warning);
        // The legacy repoId write on PATCH (the graph's picker) replaces the assignee on this harness.
        var picked = g.UpdateNode(n.Id, null, null, "r9", null, null, null, null, 5)!;
        Assert.Equal("r9", picked.RepoId);
        Assert.Null(picked.SourceId);
        Assert.Single(TaskGraphService.AssigneesOf(picked));
        var cleared = g.UpdateNode(n.Id, null, null, "", null, null, null, null, 6)!;
        Assert.Null(cleared.RepoId);
        Assert.Empty(TaskGraphService.AssigneesOf(cleared));
    }

    [Fact]
    public void Old_json_without_the_assignee_list_reads_back_as_one_assignee_and_round_trips()
    {
        File.WriteAllText(Path.Combine(_dir, "taskgraph.json"),
            """{"SchemaVersion":2,"Nodes":[{"Id":"a","Title":"old","Note":null,"RepoId":"r1","MachineId":null,"Status":"pr-opened","X":0,"Y":0,"CreatedAt":1,"UpdatedAt":7,"SourceId":"src-spacex","AssignedBy":"arch","AssignedAt":2,"DispatchedAt":3,"DispatchCount":1,"Branch":"feature/x","PrUrl":"https://github.com/o/r/pull/1","PrNumber":1,"VerifiedStatus":"pr-opened","Pushed":true}],"Edges":[],"Machines":[],"Scratch":"","Tombstones":[]}""");
        var g = Graph();
        var n = g.Find("a")!;
        var a = Assert.Single(TaskGraphService.AssigneesOf(n));
        Assert.Equal(("src-spacex", "r1", "pr-opened", "feature/x", 1, 7L), (a.SourceId, a.RepoId, a.Status, a.Branch, a.PrNumber, a.UpdatedAt));
        Assert.Equal(7, n.UpdatedAt); // normalisation never stamps
        // Round trip through JSON keeps both the list and the mirror.
        var json = JsonSerializer.Serialize(n);
        var back = JsonSerializer.Deserialize<TaskGraphService.Node>(json)!;
        Assert.Equal(n, back);
        Assert.Single(back.Assignees!);
        // A node from an older peer (no list) equals its normalised self by value once normalised on merge.
        var legacy = new TaskGraphService.Node("b", "t", null, "r1", null, "doing", 0, 0, 1, 1);
        Assert.Null(legacy.Assignees);
        Assert.Single(TaskGraphService.AssigneesOf(legacy));
    }

    [Fact]
    public void A_status_set_on_the_card_broadcasts_and_a_named_assignee_moves_alone()
    {
        var g = Graph();
        var n = g.AddNode("Two repos", null, null, null, 0, 0, now: 1)!;
        g.SetAssignees(n.Id, Two, "arch", 2);
        var all = g.UpdateNode(n.Id, null, null, null, null, "doing", null, null, 3)!;
        Assert.All(TaskGraphService.AssigneesOf(all), a => Assert.Equal("doing", a.Status));
        Assert.Equal("doing", all.Status);

        var one = g.SetAssigneeStatus(n.Id, Key("src-spacex", "p-prg"), "pr-merged", 4)!;
        var list = TaskGraphService.AssigneesOf(one);
        Assert.Equal("pr-merged", list[0].Status);
        Assert.Equal("doing", list[1].Status);
        Assert.Equal("doing", one.Status); // the slowest assignee
        Assert.Equal("p-prg: claimed pr-merged, verified: nothing — no facts observed yet", one.Warning);
        Assert.True(TaskGraphService.IsUnverified(one));
        Assert.Null(g.SetAssigneeStatus(n.Id, Key(null, "nope"), "done", 5));
    }

    // ---- 3. dispatch / claims / verification per assignee ----------------------------------

    [Fact]
    public void Dispatch_and_claims_land_on_the_named_assignee_only()
    {
        var g = Graph();
        var n = g.AddNode("Two repos", null, null, null, 0, 0, now: 1)!;
        g.SetAssignees(n.Id, Two, "arch", 2);
        var pinged = g.MarkDispatched(n.Id, Key("src-spacex", "p-prg"), 3)!;
        var list = TaskGraphService.AssigneesOf(pinged);
        Assert.Equal(("doing", 1), (list[0].Status, list[0].DispatchCount));
        Assert.Equal(("todo", 0), (list[1].Status, list[1].DispatchCount));
        Assert.Equal("doing", pinged.Status);

        var claimed = g.RecordClaim(n.Id, Key(null, "r-skratek"), "feature/lock-race", "abc1234", null, 4)!;
        list = TaskGraphService.AssigneesOf(claimed);
        Assert.Null(list[0].Branch);
        Assert.Equal(("feature/lock-race", "abc1234"), (list[1].Branch, list[1].HeadCommit));
        Assert.Null(g.RecordClaim(n.Id, Key(null, "nope"), "b", null, null, 5));
        // The legacy call (no key) lands on the primary.
        var primary = g.RecordClaim(n.Id, "feature/prg-lock", null, "https://github.com/o/prg/pull/9", 6)!;
        Assert.Equal("feature/prg-lock", TaskGraphService.AssigneesOf(primary)[0].Branch);
        Assert.Equal("feature/prg-lock", primary.Branch);
    }

    [Fact]
    public void Verification_runs_per_assignee_the_card_aggregates_and_nothing_demotes()
    {
        var g = Graph();
        var n = g.AddNode("Two repos", null, null, null, 0, 0, now: 1)!;
        g.SetAssignees(n.Id, Two, "arch", 2);
        g.UpdateNode(n.Id, null, null, null, null, "doing", null, null, 3);
        var kPrg = Key("src-spacex", "p-prg");
        var kSk = Key(null, "r-skratek");

        // prg's PR merged and live; skratek only committed.
        var v1 = g.ApplyVerification(n.Id, kPrg, NoFacts with { BranchExists = true, HasCommits = true, OnOrigin = true, PrNumber = 9, PrUrl = "u9", PrMerged = true, MergeCommit = "m9", MergeLive = true }, 4)!;
        var v2 = g.ApplyVerification(n.Id, kSk, NoFacts with { BranchExists = true, HeadCommit = "abc", HasCommits = true }, 5)!;
        var list = TaskGraphService.AssigneesOf(v2);
        Assert.Equal(("done", "done", 9, "m9"), (list[0].Status, list[0].VerifiedStatus, list[0].PrNumber, list[0].MergeCommit));
        Assert.Equal(("committed", "committed", false), (list[1].Status, list[1].VerifiedStatus, list[1].Pushed));
        Assert.Equal("committed", v2.Status);        // the slowest
        Assert.Null(v2.Warning);                       // both verified as far as they claim
        Assert.False(TaskGraphService.IsUnverified(v2));

        // A claim beyond the facts on skratek badges that assignee and the card.
        var over = g.SetAssigneeStatus(n.Id, kSk, "pr-merged", 6)!;
        Assert.Equal("r-skratek: claimed pr-merged, verified: committed — branch not on origin", over.Warning);
        Assert.Equal("pr-merged", over.Status);      // aggregate of done + pr-merged

        // Facts never demote: GitHub says the prg PR is open again → prg stays done.
        var again = g.ApplyVerification(n.Id, kPrg, NoFacts with { HasCommits = true, OnOrigin = true, PrNumber = 9 }, 7)!;
        Assert.Equal("done", TaskGraphService.AssigneesOf(again)[0].Status);
        Assert.Null(g.ApplyVerification(n.Id, Key(null, "nope"), NoFacts, 8));

        // Skratek's PR lands merged + live: every assignee done → the card is done.
        var fin = g.ApplyVerification(n.Id, kSk, NoFacts with { BranchExists = true, HasCommits = true, OnOrigin = true, PrNumber = 10, PrMerged = true, MergeCommit = "m10", MergeLive = true }, 9)!;
        Assert.Equal("done", fin.Status);
        Assert.Null(fin.Warning);
    }

    [Fact]
    public void The_verifier_pass_checks_every_assignee_of_a_card()
    {
        var g = Graph();
        var n = g.AddNode("Two repos", null, null, null, 0, 0, now: 1)!;
        g.SetAssignees(n.Id, Two, "arch", 2);
        g.RecordClaim(n.Id, Key("src-spacex", "p-prg"), null, null, "https://github.com/mirceta/prg/pull/5", 3);
        g.RecordClaim(n.Id, Key(null, "r-skratek"), null, null, "https://github.com/mirceta/skratek/pull/6", 3);
        var pr = new FakePr();
        pr.ByKey["mirceta/prg#5"] = new PrFacts("https://github.com/mirceta/prg/pull/5", 5, "MERGED", "m5", null, "b");
        pr.ByKey["mirceta/skratek#6"] = new PrFacts("https://github.com/mirceta/skratek/pull/6", 6, "OPEN", null, "h6", "b");
        var r = new BoardVerifier(g, new FakeLocal(), pr, new FakeFleet(), new Logger()).VerifyOnce(new Dictionary<string, string>(), 10);

        Assert.Equal(2, r.Checked);
        Assert.Equal(2, pr.Asked.Count);
        var list = TaskGraphService.AssigneesOf(g.Find(n.Id)!);
        Assert.Equal("pr-merged", list[0].Status);
        Assert.Equal("pr-opened", list[1].Status);
        Assert.Equal("pr-opened", g.Find(n.Id)!.Status);
        Assert.Contains(r.Changes, c => c.Assignee == "p-prg" && c.To == "pr-merged");
        Assert.Contains(r.Changes, c => c.Assignee == "r-skratek" && c.To == "pr-opened");
        Assert.Contains(r.Changes, c => c.Assignee is null && c.From == "todo" && c.To == "pr-opened"); // the card's own move
    }

    [Fact]
    public void Stale_is_judged_per_assignee()
    {
        var g = Graph();
        g.StaleAfterMs = 1000;
        var n = g.AddNode("Two repos", null, null, null, 0, 0, now: 1)!;
        g.SetAssignees(n.Id, Two, "arch", 2);
        g.SetAssigneeStatus(n.Id, Key("src-spacex", "p-prg"), "committed", 3);   // parked since 3
        g.SetAssigneeStatus(n.Id, Key(null, "r-skratek"), "doing", 5_000);        // active recently
        var node = g.Find(n.Id)!;
        Assert.True(g.IsStale(node, 6_000));                                        // prg is stale
        var list = TaskGraphService.AssigneesOf(node);
        Assert.True(g.IsStale(list[0], 6_000));
        Assert.False(g.IsStale(list[1], 6_000));
    }

    // ---- 4. tools: any-assignee matching, the brief -------------------------------------------

    [Fact]
    public void List_tasks_filters_match_any_assignee()
    {
        var n = new TaskGraphService.Node("t", "Two", null, "p-prg", null, "doing", 0, 0, 1, 1, SourceId: "src-spacex",
            Assignees: new List<TaskGraphService.Assignee> { new("src-spacex", "p-prg", "doing"), new(null, "r-skratek", "todo") });
        Assert.True(ArchAgentService.TaskMatches(n, null, false, true, "src-spacex", null));   // by machine spacex
        Assert.True(ArchAgentService.TaskMatches(n, null, false, true, null, null));           // by machine self (the second assignee)
        Assert.False(ArchAgentService.TaskMatches(n, null, false, true, "src-other", null));
        Assert.True(ArchAgentService.TaskMatches(n, null, false, false, null, "r-skratek"));   // by agent
        Assert.False(ArchAgentService.TaskMatches(n, null, false, false, "src-spacex", "r-skratek"));
        Assert.False(ArchAgentService.TaskMatches(n, null, true, false, null, null));          // not unassigned
    }

    [Fact]
    public void The_brief_names_the_agents_own_repo_and_its_co_assignees()
    {
        var node = new TaskGraphService.Node("t1", "DLL-mode invoice lock", "Race across repos.", "p-prg", null, "todo", 0, 0, 1, 1, SourceId: "src-spacex", AssignedBy: "arch");
        var text = ArchAgentService.DispatchMessage(node, Array.Empty<TaskGraphService.Node>(), "arch", "spacex", "prg", null,
            coAssignees: new[] { "MONSTER/skratek-projects", "living room/web-flow-autodev" }, ownLabel: "spacex/prg");
        Assert.Contains("YOUR part is prg on spacex (spacex/prg)", text);
        Assert.Contains("MONSTER/skratek-projects, living room/web-flow-autodev", text);
        Assert.Contains("Your closing line reports YOUR repo's branch/PR only.", text);
        Assert.Contains("TASK COMMITTED t1", text);
        // A single-assignee brief is unchanged.
        Assert.DoesNotContain("YOUR part", ArchAgentService.DispatchMessage(node, Array.Empty<TaskGraphService.Node>(), "arch", "spacex", "prg"));
    }

    // ---- fakes -----------------------------------------------------------------------------

    private sealed class FakeLocal : ITaskFactsProbe
    {
        public TaskLifecycle.Facts Probe(string repoPath, string branch) => NoFacts;
    }

    private sealed class FakePr : IPrFactsProbe
    {
        public readonly Dictionary<string, PrFacts?> ByKey = new(StringComparer.OrdinalIgnoreCase);
        public readonly List<PrRef> Asked = new();
        public PrFacts? ProbePr(PrRef pr)
        {
            Asked.Add(pr);
            var key = pr.Number is { } n ? $"{pr.OwnerRepo}#{n}" : $"{pr.OwnerRepo}@{pr.Branch}";
            return ByKey.TryGetValue(key, out var f) ? f : null;
        }
        public bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits) => null;
        public string? OriginUrl(string clonePath) => null;
    }

    private sealed class FakeFleet : ITaskFleetInfo
    {
        public string? HubLiveCommit => null;
        public (string? RemoteUrl, string? LiveCommit) Assignee(string sourceId, string repoId) => (null, null);
    }
}
