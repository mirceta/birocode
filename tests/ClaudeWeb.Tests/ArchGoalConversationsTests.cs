using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Goal conversations (openspec arch-goal-conversations): a goal drives repos and
/// tasks while it runs and releases them when it ends; a goal conversation is the arch on a
/// timer — busy while its loop is armed, never woken by a repo agent, its repeats paced by
/// the quiet floor alone; Operator messages to a busy goal are queued and carried by the
/// next poll; the tools exist; the role prompt teaches the passive-agent model.</summary>
public sealed class ArchGoalConversationsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-archgoal-" + Guid.NewGuid().ToString("N"));
    private static readonly TimeSpan Floor = TimeSpan.FromMinutes(5);

    public ArchGoalConversationsTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    private static ArchStateStore.ArchGoal Goal(params string[] repos) =>
        new("g1", "@arch:aaaa0001", "ship it", repos, Array.Empty<string>(), ArchGoals.Running, 1, null, "operator", null, Array.Empty<ArchStateStore.QueuedMessage>());

    // ---- ownership in the store --------------------------------------------------------------

    [Fact]
    public void A_goal_drives_its_repos_and_tasks_while_running_and_releases_them_when_ended()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        var conv = store.AddConversation("goal: ship it");
        var g = store.StartGoal(conv.Id, "ship it", new[] { "r1", "src-b/r9", "r1" }, new[] { "t1" }, by: "operator", now: 50);
        Assert.True(g.Running);
        Assert.Equal(new[] { "r1", "src-b/r9" }, g.Repos);
        Assert.Equal(new[] { "t1" }, g.Tasks);
        Assert.Equal(conv.Id, store.OwnerOfRepo("r1"));
        Assert.Equal(conv.Id, store.OwnerOfRepo("src-b/r9"));
        Assert.Null(store.OwnerOfRepo("r2"));
        Assert.Equal(conv.Id, store.OwnerOfTask("t1"));
        Assert.Equal(g.Id, store.FindGoal(g.Id)!.Id);

        // Persists.
        var again = new ArchStateStore(new Logger(), _dir);
        Assert.Equal(conv.Id, again.OwnerOfRepo("r1"));
        Assert.Equal("ship it", again.GoalOf(conv.Id)!.Text);

        // Ending releases, keeps the record, is idempotent.
        var ended = again.EndGoal(conv.Id, ArchGoals.Done, "verified", 99)!;
        Assert.Equal(ArchGoals.Done, ended.State);
        Assert.Equal(99, ended.EndedAt);
        Assert.False(ended.Running);
        Assert.Null(again.OwnerOfRepo("r1"));
        Assert.Null(again.OwnerOfTask("t1"));
        Assert.Equal(new[] { "r1", "src-b/r9" }, ended.Repos); // still listed for the summary
        Assert.Equal(ArchGoals.Done, again.EndGoal(conv.Id, ArchGoals.Stopped, "x", 100)!.State);
        Assert.Null(again.EndGoal("@arch:nope", ArchGoals.Stopped, null, 1));
    }

    [Fact]
    public void The_default_conversation_never_runs_a_goal_and_a_running_goal_is_exclusive()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        Assert.Throws<InvalidOperationException>(() => store.StartGoal("@arch", "x", new[] { "r1" }, Array.Empty<string>(), null, 1));
        var conv = store.AddConversation("a");
        store.StartGoal(conv.Id, "x", new[] { "r1" }, Array.Empty<string>(), null, 1);
        Assert.Throws<InvalidOperationException>(() => store.StartGoal(conv.Id, "y", new[] { "r2" }, Array.Empty<string>(), null, 2));
        Assert.Throws<InvalidOperationException>(() => store.StartGoal("@arch:nope", "y", new[] { "r2" }, Array.Empty<string>(), null, 2));
        // Ended → the conversation can take a new goal.
        store.EndGoal(conv.Id, ArchGoals.Stopped, null, 3);
        var next = store.StartGoal(conv.Id, "y", new[] { "r2" }, Array.Empty<string>(), null, 4);
        Assert.Equal(8, next.Id.Length);
        Assert.Equal(conv.Id, store.OwnerOfRepo("r2"));
        Assert.Null(store.OwnerOfRepo("r1"));
        Assert.True(store.ExtendGoal(conv.Id, new[] { "r1" }, new[] { "t9" }));
        Assert.Equal(conv.Id, store.OwnerOfRepo("r1"));
        Assert.Equal(conv.Id, store.OwnerOfTask("t9"));
        Assert.False(store.ExtendGoal("@arch", new[] { "r1" }, null));
    }

    [Fact]
    public void Queued_operator_messages_wait_for_the_next_poll_and_drain_once()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        var conv = store.AddConversation("a");
        Assert.Null(store.QueueGoalMessage(conv.Id, "hi", 1)); // no goal yet
        store.StartGoal(conv.Id, "x", new[] { "r1" }, Array.Empty<string>(), null, 1);
        Assert.Equal(1, store.QueueGoalMessage(conv.Id, " first ", 2)!.Queue.Count);
        Assert.Equal(2, store.QueueGoalMessage(conv.Id, "second", 3)!.Queue.Count);
        Assert.Null(store.QueueGoalMessage(conv.Id, "  ", 4));
        var drained = store.DrainGoalQueue(conv.Id);
        Assert.Equal(new[] { "first", "second" }, drained.Select(q => q.Text).ToArray());
        Assert.Empty(store.DrainGoalQueue(conv.Id));
        Assert.Empty(store.GoalOf(conv.Id)!.Queue);
    }

    // ---- the arch on a timer -------------------------------------------------------------------

    [Fact]
    public void A_goal_conversation_polls_only_its_repeats_wait_for_the_quiet_floor_never_for_a_wake()
    {
        Assert.True(ArchGoals.PollsOnly(Goal("r1")));
        Assert.False(ArchGoals.PollsOnly(null));
        Assert.False(ArchGoals.PollsOnly(Goal("r1") with { State = ArchGoals.Done }));

        var loops = new LoopConfigStore(new Logger(), _dir);
        var inst = loops.StartGoal("@arch:aaaa0001", "ship it", 5, "drive", "sess");
        loops.RecordSend("@arch:aaaa0001", inst.ArmedAt + 1000);
        inst = loops.Get("@arch:aaaa0001")!;
        var repeat = new LoopDecision.Propose(inst.Prompt);
        // No wake ever (a goal conversation's HasWake is false): before the floor it holds…
        var held = Assert.IsType<LoopDecision.Hold>(ArchDrivenPolicy.Apply(repeat, inst, inst.Prompt, inst.LastSentAt + 60_000, Floor, () => false));
        Assert.StartsWith(ArchDrivenPolicy.WaitingForWake, held.Reason);
        // …and once the floor elapsed the poll goes out.
        Assert.Same(repeat, ArchDrivenPolicy.Apply(repeat, inst, inst.Prompt, inst.LastSentAt + (long)Floor.TotalMilliseconds, Floor, () => false));
        // The first send of an arm, a verification prompt and a phase change go at once.
        var fresh = loops.StartGoal("@arch:aaaa0002", "x", 5, "drive", "sess");
        Assert.Same(repeat, ArchDrivenPolicy.Apply(repeat, fresh, null, 0, Floor, () => false));
        var verify = new LoopDecision.Propose(inst.VerifyPrompt!, EnterPhase: LoopConfigStore.PhaseVerify);
        Assert.Same(verify, ArchDrivenPolicy.Apply(verify, inst, inst.Prompt, inst.LastSentAt + 1, Floor, () => false));
    }

    [Fact]
    public void A_goal_conversation_is_busy_while_its_goal_runs_and_its_loop_is_armed()
    {
        var loops = new LoopConfigStore(new Logger(), _dir);
        var armed = loops.StartGoal("@arch:aaaa0001", "ship it", 5, "drive", null, null, "operator");
        Assert.True(ArchGoals.IsBusy(Goal("r1"), armed));
        Assert.False(ArchGoals.IsBusy(null, armed));
        Assert.False(ArchGoals.IsBusy(Goal("r1") with { State = ArchGoals.Stopped }, armed));
        var stopped = loops.Stop("@arch:aaaa0001", "operator");
        Assert.False(ArchGoals.IsBusy(Goal("r1"), stopped));
        Assert.False(ArchGoals.IsBusy(Goal("r1"), null));
        Assert.Equal(ArchGoals.Done, ArchGoals.StateFor("done"));
        Assert.Equal(ArchGoals.Capped, ArchGoals.StateFor("capped"));
        Assert.Equal(ArchGoals.Error, ArchGoals.StateFor("error"));
        Assert.Equal(ArchGoals.Stopped, ArchGoals.StateFor("stopped"));
        Assert.Equal(ArchGoals.Stopped, ArchGoals.StateFor("escalate"));
    }

    [Fact]
    public void A_goal_conversation_is_named_after_its_goal_and_its_loop_text_says_nobody_calls_it()
    {
        Assert.Equal("goal: ship the thing", ArchGoals.ConversationName("  ship the thing \n\n"));
        Assert.StartsWith("goal: ", ArchGoals.ConversationName(new string('x', 200)));
        Assert.True(ArchGoals.ConversationName(new string('x', 200)).Length <= 60);
        var text = ArchGoals.LoopGoalText("ship it", "g1", new[] { "spacex/prg", "living room/birocode" }, new[] { "\"task a\" (abcd1234)" });
        Assert.StartsWith("ship it", text);
        Assert.Contains("(arch goal g1)", text);
        Assert.Contains("drives: spacex/prg, living room/birocode", text);
        Assert.Contains("board tasks: \"task a\" (abcd1234)", text);
        Assert.Contains("Nobody calls you", text);
        Assert.Equal(8, ArchGoals.NewId().Length);
    }

    // ---- tools + role prompt -------------------------------------------------------------------------

    [Fact]
    public void The_goal_tools_are_in_the_catalogue_and_the_role_prompt_teaches_the_passive_agent_model()
    {
        var tools = ArchMcpServer.ToolsList();
        var names = tools.Select(t => t!["name"]!.GetValue<string>()).ToList();
        Assert.Contains("start_arch_goal", names);
        Assert.Contains("list_arch_goals", names);
        Assert.Contains("stop_arch_goal", names);
        Assert.Equal(23, names.Count);
        var start = tools.First(t => t!["name"]!.GetValue<string>() == "start_arch_goal")!;
        Assert.Equal(new[] { "goal" }, start["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()).ToArray());
        foreach (var p in new[] { "repos", "tasks", "maxIterations" })
            Assert.NotNull(start["inputSchema"]!["properties"]![p]);
        Assert.Null(start["inputSchema"]!["properties"]!["requireMerged"]);
        Assert.Equal(new[] { "id" }, tools.First(t => t!["name"]!.GetValue<string>() == "stop_arch_goal")!["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()).ToArray());

        var role = ArchAgentService.RolePrompt();
        Assert.Equal("<!-- arch-role v7 -->", ArchAgentService.RoleVersionMarker);
        Assert.Contains("## Goal conversations", role);
        Assert.Contains("start_arch_goal", role);
        Assert.Contains("never call you", role);
        Assert.Contains("check your agents yourself", role);
        Assert.Contains("Never touch an agent or task you do not drive", role);
        Assert.Contains("NEEDS_HUMAN: <the blocker>", role);
        Assert.DoesNotContain("pr-opened", role);
    }
}
