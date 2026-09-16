using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec kanban-lifecycle-columns, amended by board-claims-advisory: the
/// delivery-lifecycle status machine — a claim moves the card exactly where it says
/// (no clamp), the badge says what the harness has not verified, observations move
/// forward only and clear the badge when they catch up, pre-lifecycle boards keep
/// their statuses, parked hand-off states go stale.</summary>
public class TaskLifecycleTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-lifecycle-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    private static TaskGraphService.Node Node(string status = "todo", string? verified = null, long updatedAt = 1) =>
        new("t1", "Ship it", null, "r1", null, status, 0, 0, 1, updatedAt, VerifiedStatus: verified);

    private static readonly TaskLifecycle.Facts NoFacts = new(false, null, false, false, null, null, false, null, false);

    // ---- 1. the status machine -----------------------------------------------------------

    [Fact]
    public void Statuses_are_the_six_lifecycle_columns_in_order()
    {
        Assert.Equal(new[] { "todo", "doing", "committed", "pr-opened", "pr-merged", "done" }, TaskGraphService.Statuses);
        Assert.True(TaskLifecycle.Rank("doing") < TaskLifecycle.Rank("committed"));
        Assert.True(TaskLifecycle.Rank("pr-opened") < TaskLifecycle.Rank("pr-merged"));
        Assert.Equal(0, TaskLifecycle.Rank("something-newer")); // unknown degrades to todo, never throws
    }

    [Theory]
    [InlineData("todo", null, false)]              // conversational: never a badge
    [InlineData("doing", null, false)]
    [InlineData("committed", null, true)]          // above doing with nothing verified
    [InlineData("done", null, true)]
    [InlineData("committed", "committed", false)]  // verified covers it
    [InlineData("done", "committed", true)]        // claim above the verified state
    [InlineData("pr-merged", "done", false)]       // verified beyond the claim: fine
    [InlineData("done", "done", false)]
    public void A_card_is_unverified_when_its_status_is_above_max_doing_verified(string status, string? verified, bool expectUnverified)
    {
        Assert.Equal(expectUnverified, TaskLifecycle.IsUnverified(status, verified));
        Assert.Equal(expectUnverified, TaskLifecycle.WarningFor(status, verified, null) is not null);
    }

    [Fact]
    public void The_badge_names_the_claim_the_verified_state_and_the_reason()
    {
        Assert.Equal("claimed pr-merged, verified: doing — branch not on origin", TaskLifecycle.WarningFor("pr-merged", "doing", pushed: false));
        Assert.Equal("claimed done, verified: nothing — no facts observed yet", TaskLifecycle.WarningFor("done", null, pushed: null));
        Assert.Equal("claimed done, verified: pr-merged", TaskLifecycle.WarningFor("done", "pr-merged", pushed: true));
        Assert.Null(TaskLifecycle.WarningFor("doing", null, pushed: false));
    }

    [Fact]
    public void A_claim_moves_the_card_exactly_where_it_says_and_the_badge_follows_the_verified_state()
    {
        var g = new TaskGraphService(new Logger(), _dir);
        var n = g.AddNode("Ship it", null, "r1", null, 0, 0, now: 1)!;
        // The arch relays "TASK PR": pr-opened with nothing verified → moved, badged.
        var opened = g.UpdateNode(n.Id, null, null, null, null, "pr-opened", null, null, 2)!;
        Assert.Equal("pr-opened", opened.Status);
        Assert.Equal("claimed pr-opened, verified: nothing — no facts observed yet", opened.Warning);
        // A merged PR the arch knows of: pr-merged, still badged — never clamped.
        var merged = g.UpdateNode(n.Id, null, null, null, null, "pr-merged", null, null, 3)!;
        Assert.Equal("pr-merged", merged.Status);
        Assert.StartsWith("claimed pr-merged, verified: nothing", merged.Warning);
        // Backward is free and clears the badge.
        var back = g.UpdateNode(n.Id, null, null, null, null, "doing", null, null, 4)!;
        Assert.Equal("doing", back.Status);
        Assert.Null(back.Warning);
        // Verification catching up clears it; verification exceeding it advances the card.
        g.UpdateNode(n.Id, null, null, null, null, "pr-merged", null, null, 5);
        var verified = g.ApplyVerification(n.Id, NoFacts with { PrMerged = true, MergeCommit = "m1" }, 6)!;
        Assert.Equal("pr-merged", verified.Status);
        Assert.Equal("pr-merged", verified.VerifiedStatus);
        Assert.Null(verified.Warning);
        var live = g.ApplyVerification(n.Id, NoFacts with { PrMerged = true, MergeCommit = "m1", MergeLive = true }, 7)!;
        Assert.Equal("done", live.Status);
        Assert.Null(live.Warning);
    }

    [Fact]
    public void Verification_below_the_claim_records_the_facts_and_keeps_the_badge_without_demoting()
    {
        var g = new TaskGraphService(new Logger(), _dir);
        var n = g.AddNode("Ship it", null, "r1", null, 0, 0, now: 1)!;
        g.RecordClaim(n.Id, "feature/x", "abc", null, 2);
        g.UpdateNode(n.Id, null, null, null, null, "pr-merged", null, null, 3);
        var seen = g.ApplyVerification(n.Id, NoFacts with { BranchExists = true, HeadCommit = "abc", HasCommits = true, OnOrigin = false }, 4)!;
        Assert.Equal("pr-merged", seen.Status);             // the claim stands
        Assert.Equal("committed", seen.VerifiedStatus);     // the facts are recorded
        Assert.Equal("claimed pr-merged, verified: committed — branch not on origin", seen.Warning);
    }

    // ---- 2. observed facts ---------------------------------------------------------------

    [Fact]
    public void Facts_map_to_the_highest_supported_status()
    {
        Assert.Null(TaskLifecycle.FromFacts(NoFacts));
        Assert.Equal("committed", TaskLifecycle.FromFacts(NoFacts with { BranchExists = true, HasCommits = true }));
        Assert.Equal("pr-opened", TaskLifecycle.FromFacts(NoFacts with { BranchExists = true, HasCommits = true, OnOrigin = true, PrNumber = 7, PrUrl = "u" }));
        Assert.Equal("pr-merged", TaskLifecycle.FromFacts(NoFacts with { PrMerged = true, MergeCommit = "abc" }));
        Assert.Equal("done", TaskLifecycle.FromFacts(NoFacts with { PrMerged = true, MergeCommit = "abc", MergeLive = true }));
    }

    [Fact]
    public void Verification_advances_forward_and_never_demotes()
    {
        var g = new TaskGraphService(new Logger(), _dir);
        var n = g.AddNode("Ship it", null, "r1", null, 0, 0, now: 1)!;
        g.RecordClaim(n.Id, "feature/x", "abc12345", null, 2);

        var committed = g.ApplyVerification(n.Id, NoFacts with { BranchExists = true, HeadCommit = "abc12345", HasCommits = true }, 3)!;
        Assert.Equal("committed", committed.Status);
        Assert.Equal("committed", committed.VerifiedStatus);
        Assert.False(committed.Pushed);

        var merged = g.ApplyVerification(n.Id, NoFacts with { BranchExists = true, HasCommits = true, OnOrigin = true, PrNumber = 9, PrUrl = "u", PrMerged = true, MergeCommit = "m1", MergeLive = true }, 4)!;
        Assert.Equal("done", merged.Status);
        Assert.Equal("m1", merged.MergeCommit);

        // The branch disappears locally after the merge — the card stays done.
        var after = g.ApplyVerification(n.Id, NoFacts, 5)!;
        Assert.Equal("done", after.Status);
        Assert.Equal("done", after.VerifiedStatus);
    }

    [Fact]
    public void Dispatch_never_demotes_a_verified_card()
    {
        var g = new TaskGraphService(new Logger(), _dir);
        var n = g.AddNode("Ship it", null, "r1", null, 0, 0, now: 1)!;
        g.ApplyVerification(n.Id, NoFacts with { BranchExists = true, HasCommits = true }, 2);
        var pinged = g.MarkDispatched(n.Id, 3)!;
        Assert.Equal("committed", pinged.Status); // re-ping must not pull it back to doing
    }

    // ---- 3. migration --------------------------------------------------------------------

    [Fact]
    public void Legacy_done_without_evidence_keeps_done_and_gets_the_badge_once()
    {
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, "taskgraph.json");
        File.WriteAllText(path, """{"Nodes":[{"Id":"a","Title":"old","Note":null,"RepoId":"r1","MachineId":null,"Status":"done","X":0,"Y":0,"CreatedAt":1,"UpdatedAt":1}],"Edges":[],"Machines":[],"Scratch":"","Tombstones":[]}""");

        var g = new TaskGraphService(new Logger(), _dir);
        var n = g.Find("a")!;
        Assert.Equal("done", n.Status);                    // never downgraded
        Assert.Equal("claimed done, verified: nothing — no facts observed yet", n.Warning);

        // Idempotent: a reload does not touch the card again.
        var again = new TaskGraphService(new Logger(), _dir).Find("a")!;
        Assert.Equal("done", again.Status);
    }

    [Fact]
    public void Legacy_done_with_merge_evidence_stays_done_without_a_badge()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, "taskgraph.json"),
            """{"Nodes":[{"Id":"a","Title":"old","Note":null,"RepoId":"r1","MachineId":null,"Status":"done","X":0,"Y":0,"CreatedAt":1,"UpdatedAt":1,"MergeCommit":"m1"}],"Edges":[],"Machines":[],"Scratch":"","Tombstones":[]}""");
        var n = new TaskGraphService(new Logger(), _dir).Find("a")!;
        Assert.Equal("done", n.Status);
        Assert.Null(n.Warning);
    }

    [Fact]
    public void Todo_and_doing_migrate_unchanged_and_fresh_boards_skip_migration()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, "taskgraph.json"),
            """{"Nodes":[{"Id":"a","Title":"t","Note":null,"RepoId":null,"MachineId":null,"Status":"doing","X":0,"Y":0,"CreatedAt":1,"UpdatedAt":1}],"Edges":[],"Machines":[],"Scratch":"","Tombstones":[]}""");
        Assert.Equal("doing", new TaskGraphService(new Logger(), _dir).Find("a")!.Status);

        var fresh = new TaskGraphService(new Logger(), Path.Combine(_dir, "fresh"));
        var n = fresh.AddNode("new", null, null, null, 0, 0, now: 1)!;
        Assert.Equal("todo", n.Status);
        Assert.Null(n.Warning);
    }

    // ---- 4. stale + blocked --------------------------------------------------------------

    [Theory]
    [InlineData("committed", true)]
    [InlineData("pr-opened", true)]
    [InlineData("doing", false)]
    [InlineData("pr-merged", false)]
    [InlineData("done", false)]
    public void Only_the_handoff_states_go_stale(string status, bool expectStale)
    {
        var day = 24 * 3600_000L;
        Assert.Equal(expectStale, TaskLifecycle.IsStale(status, updatedAt: 0, now: day + 1, staleAfterMs: day));
        Assert.False(TaskLifecycle.IsStale(status, updatedAt: 0, now: day - 1, staleAfterMs: day)); // inside the window: never
    }

    [Fact]
    public void Prerequisites_are_satisfied_from_pr_merged_on()
    {
        var g = new TaskGraphService(new Logger(), _dir);
        var pre = g.AddNode("first", null, null, null, 0, 0, now: 1)!;
        var task = g.AddNode("second", null, null, null, 0, 0, now: 1)!;
        g.AddEdge(task.Id, pre.Id, 2);
        Assert.True(g.IsBlocked(task.Id));
        g.UpdateNode(pre.Id, null, null, null, null, "committed", null, null, 3);
        Assert.True(g.IsBlocked(task.Id)); // committed work is not delivered yet
        g.UpdateNode(pre.Id, null, null, null, null, "pr-merged", null, null, 4);
        Assert.False(g.IsBlocked(task.Id));
    }

    // ---- 5. record compatibility ---------------------------------------------------------

    [Fact]
    public void Old_node_json_without_lifecycle_fields_reads_back_with_defaults()
    {
        const string json = "{\"Id\":\"a\",\"Title\":\"t\",\"Note\":null,\"RepoId\":null,\"MachineId\":null,\"Status\":\"todo\",\"X\":1,\"Y\":2,\"CreatedAt\":3,\"UpdatedAt\":4}";
        var n = JsonSerializer.Deserialize<TaskGraphService.Node>(json)!;
        Assert.Null(n.Branch);
        Assert.Null(n.Pushed);
        Assert.Null(n.PrNumber);
        Assert.Null(n.VerifiedStatus);
        Assert.Null(n.Warning);
        var again = JsonSerializer.Deserialize<TaskGraphService.Node>(JsonSerializer.Serialize(n with { Branch = "b", Pushed = true, PrNumber = 3 }))!;
        Assert.Equal("b", again.Branch);
        Assert.True(again.Pushed);
        Assert.Equal(3, again.PrNumber);
    }
}
