using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec kanban-lifecycle-columns: the delivery-lifecycle status
/// machine — claims clamp to the verified state, observations move forward only,
/// pre-lifecycle boards migrate by evidence, parked hand-off states go stale.</summary>
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
    [InlineData("todo", null, "doing", "doing", false)]         // conversational forward: free
    [InlineData("todo", null, "committed", "doing", true)]      // no facts: clamps to doing
    [InlineData("doing", null, "done", "doing", true)]          // agent says done, harness saw nothing
    [InlineData("doing", "committed", "done", "committed", true)]  // claims stop at the verified state
    [InlineData("doing", "committed", "committed", "committed", false)] // claim matching facts: free
    [InlineData("pr-merged", null, "todo", "todo", false)]      // backward always free (blocked → todo)
    [InlineData("done", "done", "done", "done", false)]         // same status: free
    public void Claims_clamp_to_the_verified_state(string current, string? verified, string requested, string expected, bool expectClamped)
    {
        var (applied, clamped) = TaskLifecycle.ClampClaim(Node(current, verified), requested);
        Assert.Equal(expected, applied);
        Assert.Equal(expectClamped, clamped);
    }

    [Fact]
    public void Claim_done_past_verified_pr_merged_clamps_to_pr_merged()
    {
        var (applied, clamped) = TaskLifecycle.ClampClaim(Node("committed", verified: "pr-merged"), "done");
        Assert.Equal("pr-merged", applied);
        Assert.True(clamped);
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
    public void Legacy_done_without_evidence_migrates_to_committed_with_warning_once()
    {
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, "taskgraph.json");
        File.WriteAllText(path, """{"Nodes":[{"Id":"a","Title":"old","Note":null,"RepoId":"r1","MachineId":null,"Status":"done","X":0,"Y":0,"CreatedAt":1,"UpdatedAt":1}],"Edges":[],"Machines":[],"Scratch":"","Tombstones":[]}""");

        var g = new TaskGraphService(new Logger(), _dir);
        var n = g.Find("a")!;
        Assert.Equal("committed", n.Status);
        Assert.Contains("migrated", n.Warning);

        // Idempotent: a reload does not re-stage the card.
        var again = new TaskGraphService(new Logger(), _dir).Find("a")!;
        Assert.Equal("committed", again.Status);
    }

    [Fact]
    public void Legacy_done_with_merge_evidence_migrates_to_pr_merged()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, "taskgraph.json"),
            """{"Nodes":[{"Id":"a","Title":"old","Note":null,"RepoId":"r1","MachineId":null,"Status":"done","X":0,"Y":0,"CreatedAt":1,"UpdatedAt":1,"MergeCommit":"m1"}],"Edges":[],"Machines":[],"Scratch":"","Tombstones":[]}""");
        var n = new TaskGraphService(new Logger(), _dir).Find("a")!;
        Assert.Equal("pr-merged", n.Status);
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
