using System.Text.Json;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Events;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Unit coverage for openspec arch-branch-handover: the claimed rule keyed on
/// activity (hand-over, revoke, pin, the window), the assignments record (adopted
/// branches, task branches, round trip through JSON as the home file), the
/// dispatch branch watch, the name-the-branch rule for unassigned branches, the
/// adopt_branch gate, and the audit wording. All pure — no harness.</summary>
public class ArchHandoverTests
{
    private const long Now = 1_000_000_000_000; // arbitrary epoch ms
    private static readonly TimeSpan Window = ArchClaims.DefaultHumanWindow;
    private static readonly string[] None = Array.Empty<string>();

    private static ArchClaims.Verdict Classify(string branch, IReadOnlyCollection<string> archBranches, bool pinned = false, long? lastHumanAt = null, TimeSpan? window = null)
        => ArchClaims.Classify(managed: true, busy: false, branch, "main", archBranches, pinned, lastHumanAt, Now, window ?? Window);

    // ---- 6: hand-over makes a claimed repo readable / sendable; revoke restores claimed ----

    [Fact]
    public void Operator_branch_with_recent_human_turn_is_claimed_human_active()
    {
        var v = Classify("feature/x", None, lastHumanAt: Now - TimeSpan.FromMinutes(30).Ticks / TimeSpan.TicksPerMillisecond);
        Assert.Equal("claimed", v.Availability);
        Assert.Equal(ArchClaims.ReasonHumanActive, v.ClaimedReason);
        Assert.True(v.OnUnassignedBranch);
    }

    [Fact]
    public void Hand_over_makes_the_same_repo_available_and_revoke_claims_it_again()
    {
        var a = new ArchClaims.Assignment("r1", "birocode", new(), null, 0, null).Normalized();
        var recentHuman = Now - 60_000;
        Assert.Equal("claimed", Classify("feature/arch-conversations", a.ArchBranches, lastHumanAt: recentHuman).Availability);

        var handed = a.Adopt("feature/arch-conversations", "operator", Now);
        var v = Classify("feature/arch-conversations", handed.ArchBranches, lastHumanAt: recentHuman);
        Assert.Equal("available", v.Availability);
        Assert.Null(v.ClaimedReason);            // an adopted branch is the arch's: no caveat
        Assert.True(handed.IsAdopted("feature/arch-conversations"));
        Assert.Equal("operator", handed.AdoptedBy);

        var back = handed.Revoke("feature/arch-conversations");
        Assert.False(back.IsAdopted("feature/arch-conversations"));
        Assert.Equal("claimed", Classify("feature/arch-conversations", back.ArchBranches, lastHumanAt: recentHuman).Availability);
    }

    [Fact]
    public void Hand_over_is_per_branch()
    {
        var a = new ArchClaims.Assignment("r1", "birocode", new(), null, 0, null).Adopt("feature/x", "operator", Now);
        Assert.Equal("available", Classify("feature/x", a.ArchBranches, lastHumanAt: Now - 1000).Availability);
        // A new Operator branch is claimed again by default.
        Assert.Equal("claimed", Classify("feature/next", a.ArchBranches, lastHumanAt: Now - 1000).Availability);
    }

    // ---- 6: pinned ---------------------------------------------------------------------

    [Fact]
    public void Pinned_repo_is_claimed_whatever_the_branch_until_unpinned()
    {
        var a = new ArchClaims.Assignment("r1", "prg", new(), null, 0, null).WithPinned(true);
        var v = Classify("main", a.ArchBranches, pinned: a.Pinned);
        Assert.Equal("claimed", v.Availability);
        Assert.Equal(ArchClaims.ReasonPinned, v.ClaimedReason);
        Assert.False(v.OnUnassignedBranch);
        Assert.Equal("available", Classify("main", a.ArchBranches, pinned: a.WithPinned(false).Pinned).Availability);
    }

    [Fact]
    public void Busy_and_unmanaged_still_win_over_pinned()
    {
        Assert.Equal("busy", ArchClaims.Classify(true, true, "main", "main", None, true, null, Now, Window).Availability);
        Assert.Equal("unmanaged", ArchClaims.Classify(false, false, "main", "main", None, true, null, Now, Window).Availability);
    }

    // ---- 6: activity window expiry -----------------------------------------------------

    [Fact]
    public void Unassigned_branch_becomes_available_on_branch_once_the_window_passed()
    {
        var justInside = Now - (long)Window.TotalMilliseconds + 1;
        var justOutside = Now - (long)Window.TotalMilliseconds;
        Assert.Equal("claimed", Classify("feature/x", None, lastHumanAt: justInside).Availability);
        var v = Classify("feature/x", None, lastHumanAt: justOutside);
        Assert.Equal("available", v.Availability);
        Assert.Equal(ArchClaims.ReasonUnassignedBranch, v.ClaimedReason);
        Assert.True(v.OnUnassignedBranch);
    }

    [Fact]
    public void No_human_turn_at_all_means_available_on_branch()
    {
        var v = Classify("feature/x", None, lastHumanAt: null);
        Assert.Equal("available", v.Availability);
        Assert.Equal(ArchClaims.ReasonUnassignedBranch, v.ClaimedReason);
    }

    [Fact]
    public void The_window_is_operator_configurable_with_a_two_hour_default()
    {
        Assert.Equal(TimeSpan.FromHours(2), ArchClaims.Window(0));
        Assert.Equal(TimeSpan.FromMinutes(15), ArchClaims.Window(15));
        var human = Now - TimeSpan.FromMinutes(30).Ticks / TimeSpan.TicksPerMillisecond;
        Assert.Equal("claimed", Classify("feature/x", None, lastHumanAt: human, window: ArchClaims.Window(0)).Availability);
        Assert.Equal("available", Classify("feature/x", None, lastHumanAt: human, window: ArchClaims.Window(15)).Availability);
    }

    [Fact]
    public void Default_branch_and_arch_branches_never_carry_a_reason()
    {
        Assert.Null(Classify("main", None, lastHumanAt: Now - 1).ClaimedReason);
        Assert.Null(Classify("feature/y", new[] { "feature/y" }, lastHumanAt: Now - 1).ClaimedReason);
    }

    // ---- human activity from the feed ---------------------------------------------------

    private static CollectorService.CollectorEvent Ev(int seq, long at, string type, string repoId, string sourceId = CollectorService.SelfId) =>
        new(seq, at, type, new { repoId, repoName = repoId }, new { turnId = $"t{seq}" }, sourceId, "self");

    [Fact]
    public void Last_human_turn_skips_the_turns_that_follow_an_arch_send()
    {
        var archSend = Now - 100_000;
        var events = new List<CollectorService.CollectorEvent>
        {
            Ev(1, Now - 500_000, "turn.start", "r1"),                 // a human, long ago
            Ev(2, archSend + 2_000, "turn.start", "r1"),               // the arch's own turn (2 s after its send)
            Ev(3, archSend + 3_000, "turn.start", "r2"),               // another repo
            Ev(4, Now - 50_000, "turn.start", "r1", sourceId: "peer"), // another machine's feed
            Ev(5, Now - 40_000, "turn.ended", "r1"),                   // not a start
        };
        Assert.Equal(Now - 500_000, ArchClaims.LastHumanTurnStart(events, "r1", new[] { archSend }));
        events.Add(Ev(6, Now - 10_000, "turn.start", "r1"));           // a human, now
        Assert.Equal(Now - 10_000, ArchClaims.LastHumanTurnStart(events, "r1", new[] { archSend }));
        Assert.Null(ArchClaims.LastHumanTurnStart(events, "r3", None.Select(long.Parse).ToArray()));
    }

    // ---- unassigned branch: the arch must name the branch ---------------------------------

    [Fact]
    public void A_send_to_an_unassigned_branch_must_name_it()
    {
        var v = Classify("feature/x", None, lastHumanAt: null);
        Assert.False(ArchClaims.SendNamesBranch(v, "feature/x", "merge main in and run the tests", null));
        Assert.True(ArchClaims.SendNamesBranch(v, "feature/x", "on feature/x: merge main in and run the tests", null));
        Assert.True(ArchClaims.SendNamesBranch(v, "feature/x", "merge main in", "feature/x"));
        // A claimed or plainly available repo is not subject to the rule.
        Assert.True(ArchClaims.SendNamesBranch(Classify("main", None), "main", "anything", null));
        Assert.True(ArchClaims.SendNamesBranch(Classify("feature/x", None, lastHumanAt: Now - 1), "feature/x", "anything", null));
    }

    // ---- 6: dispatch branch recording ----------------------------------------------------

    [Fact]
    public void Dispatch_branch_watch_records_the_assignees_new_branch_once()
    {
        var a = new ArchClaims.Assignment("r1", "spacex", new(), null, 0, null).Normalized();
        // Doing + dispatched + on a non-default branch the arch does not know → record it.
        Assert.Equal("feature/handles", ArchClaims.TaskBranchToRecord("doing", Now, "feature/handles", "main", a.ArchBranches));
        var recorded = a.WithTaskBranch("task-1", "feature/handles");
        Assert.Equal("feature/handles", recorded.TaskBranches!["task-1"]);
        // Known now: nothing more to record; the repo is available on its own task branch.
        Assert.Null(ArchClaims.TaskBranchToRecord("doing", Now, "feature/handles", "main", recorded.ArchBranches));
        Assert.Equal("available", Classify("feature/handles", recorded.ArchBranches, lastHumanAt: Now - 1).Availability);
        // Not doing, not dispatched, on main, or unknown → nothing.
        Assert.Null(ArchClaims.TaskBranchToRecord("todo", Now, "feature/other", "main", a.ArchBranches));
        Assert.Null(ArchClaims.TaskBranchToRecord("doing", null, "feature/other", "main", a.ArchBranches));
        Assert.Null(ArchClaims.TaskBranchToRecord("doing", Now, "main", "main", a.ArchBranches));
        Assert.Null(ArchClaims.TaskBranchToRecord("doing", Now, "unknown", "main", a.ArchBranches));
    }

    [Fact]
    public void Revoking_a_branch_also_drops_its_task_record()
    {
        var a = new ArchClaims.Assignment("r1", "spacex", new(), null, 0, null).WithTaskBranch("task-1", "feature/handles");
        Assert.Contains("feature/handles", a.ArchBranches);
        var back = a.Revoke("feature/handles");
        Assert.DoesNotContain("feature/handles", back.ArchBranches);
        Assert.Empty(back.TaskBranches!);
    }

    [Fact]
    public void Dispatch_brief_names_the_branch_when_given()
    {
        var node = new ClaudeWeb.Services.TaskGraph.TaskGraphService.Node("t1", "Do it", null, "r1", null, "todo", 0, 0, 0, 0, AssignedBy: "operator");
        var text = ArchAgentService.DispatchMessage(node, Array.Empty<ClaudeWeb.Services.TaskGraph.TaskGraphService.Node>(), "arch", "living room", "spacex", "feature/handles");
        Assert.Contains("Branch: work on `feature/handles`", text);
        Assert.DoesNotContain("Branch:", ArchAgentService.DispatchMessage(node, Array.Empty<ClaudeWeb.Services.TaskGraph.TaskGraphService.Node>(), "arch", "living room", "spacex"));
    }

    // ---- 6: adopt_branch refused without the Operator's ask; audit wording ---------------

    [Fact]
    public void Adopt_branch_is_refused_without_the_operators_ask()
    {
        var refused = ArchAgentService.AdoptGate(operatorAsked: false);
        Assert.NotNull(refused);
        Assert.False(refused!.Ok);
        Assert.Equal("not-asked", refused.Status);
        Assert.Contains("Nothing was changed", refused.Detail);
        Assert.Null(ArchAgentService.AdoptGate(operatorAsked: true));
    }

    [Fact]
    public void Handover_audit_lines_name_the_branch_and_who_asked()
    {
        Assert.Equal("adopted feature/x (handed over by operator)", ArchClaims.HandoverOutcome(true, "feature/x", "operator"));
        Assert.Equal("revoked feature/x (taken back by operator)", ArchClaims.HandoverOutcome(false, "feature/x", "operator"));
        Assert.Contains("arch (the Operator asked)", ArchClaims.HandoverOutcome(true, "feature/x", "arch (the Operator asked)"));
    }

    // ---- the assignments file --------------------------------------------------------------

    [Fact]
    public void Assignment_round_trips_through_json_and_reads_old_files()
    {
        var a = new ArchClaims.Assignment("r1", "birocode", new() { "feature/asked" }, "arch", 5, "do x")
            .Adopt("feature/handed", "operator", Now).WithTaskBranch("task-9", "feature/task").WithPinned(true);
        var json = JsonSerializer.Serialize(a);
        var back = JsonSerializer.Deserialize<ArchClaims.Assignment>(json)!.Normalized();
        Assert.Equal(new[] { "feature/asked", "feature/handed", "feature/task" }, back.ArchBranches.OrderBy(x => x));
        Assert.True(back.Pinned);
        Assert.Equal("operator", back.AdoptedBy);
        Assert.Equal("feature/task", back.TaskBranches!["task-9"]);

        // A file written before hand-over existed (only the six original fields) still reads.
        var legacy = JsonSerializer.Deserialize<ArchClaims.Assignment>("""{"RepoId":"r1","Name":"birocode","Branches":["feature/asked"],"LastActor":"arch","LastSentAt":5,"LastText":"do x"}""")!.Normalized();
        Assert.Equal(new[] { "feature/asked" }, legacy.ArchBranches);
        Assert.False(legacy.Pinned);
        Assert.Empty(legacy.Adopted!);
        Assert.Empty(legacy.TaskBranches!);
    }
}
