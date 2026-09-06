using System.Text.Json;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Goal-scoped arch conversations (openspec arch-goal-conversations): a goal owns
/// repos and tasks while it runs and releases them when it ends; events route to the
/// owning conversation only (the default gets nothing unless the legacy setting is on);
/// a goal conversation is busy while its loop is armed; the board gates completion; the
/// tools exist; the role prompt teaches it.</summary>
public sealed class ArchGoalConversationsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-archgoal-" + Guid.NewGuid().ToString("N"));
    private static readonly TimeSpan Floor = TimeSpan.FromMinutes(5);

    public ArchGoalConversationsTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    private static readonly HashSet<string> Managed = new(StringComparer.Ordinal) { "r1", "r2", "src-b/r9" };

    private static CollectorService.CollectorEvent Turn(int seq, string sourceId, string repoId, string type = "turn.ended") =>
        new(seq, 1000 + seq, type, JsonSerializer.SerializeToElement(new { repoId, repoName = repoId }),
            JsonSerializer.SerializeToElement(new { status = "completed", numTurns = 1, costUsd = 0.01 }), sourceId, sourceId == "self" ? "self" : "B");

    private static CollectorService.CollectorEvent TaskEv(int seq, string taskId, string? repoId, string? sourceId) =>
        new(seq, 1000 + seq, "task.status", JsonSerializer.SerializeToElement(new { taskId, title = "t-" + taskId, repoId, sourceId }),
            JsonSerializer.SerializeToElement(new { status = "done", previous = "doing", by = "arch" }), "self", "self");

    private static ArchStateStore.ArchGoal Goal(params string[] repos) =>
        new("g1", "@arch:aaaa0001", "ship it", repos, Array.Empty<string>(), false, ArchGoalRouting.Running, 1, null, "operator", null, 0, null, Array.Empty<ArchStateStore.QueuedMessage>());

    // ---- ownership in the store --------------------------------------------------------------

    [Fact]
    public void A_goal_owns_its_repos_and_tasks_while_running_and_releases_them_when_ended()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        var conv = store.AddConversation("goal: ship it");
        var g = store.StartGoal(conv.Id, "ship it", new[] { "r1", "src-b/r9", "r1" }, new[] { "t1" }, requireMerged: true, by: "operator", now: 50);
        Assert.True(g.Running);
        Assert.Equal(new[] { "r1", "src-b/r9" }, g.Repos);
        Assert.Equal(new[] { "t1" }, g.Tasks);
        Assert.True(g.RequireMerged);
        Assert.Equal(conv.Id, store.OwnerOfRepo("r1"));
        Assert.Equal(conv.Id, store.OwnerOfRepo("src-b/r9"));
        Assert.Null(store.OwnerOfRepo("r2"));
        Assert.Equal(conv.Id, store.OwnerOfTask("t1"));
        Assert.Same(g.Id, store.FindGoal(g.Id)!.Id);

        // Persists.
        var again = new ArchStateStore(new Logger(), _dir);
        Assert.Equal(conv.Id, again.OwnerOfRepo("r1"));
        Assert.Equal("ship it", again.GoalOf(conv.Id)!.Text);

        // Ending releases, keeps the record, is idempotent.
        var ended = again.EndGoal(conv.Id, ArchGoalRouting.Done, "verified", 99)!;
        Assert.Equal(ArchGoalRouting.Done, ended.State);
        Assert.Equal(99, ended.EndedAt);
        Assert.False(ended.Running);
        Assert.Null(again.OwnerOfRepo("r1"));
        Assert.Null(again.OwnerOfTask("t1"));
        Assert.Equal(new[] { "r1", "src-b/r9" }, ended.Repos); // still listed for the summary
        Assert.Equal(ArchGoalRouting.Done, again.EndGoal(conv.Id, ArchGoalRouting.Stopped, "x", 100)!.State);
        Assert.Null(again.EndGoal("@arch:nope", ArchGoalRouting.Stopped, null, 1));
    }

    [Fact]
    public void The_default_conversation_never_runs_a_goal_and_a_running_goal_is_exclusive()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        Assert.Throws<InvalidOperationException>(() => store.StartGoal("@arch", "x", new[] { "r1" }, Array.Empty<string>(), false, null, 1));
        var conv = store.AddConversation("a");
        store.StartGoal(conv.Id, "x", new[] { "r1" }, Array.Empty<string>(), false, null, 1);
        Assert.Throws<InvalidOperationException>(() => store.StartGoal(conv.Id, "y", new[] { "r2" }, Array.Empty<string>(), false, null, 2));
        Assert.Throws<InvalidOperationException>(() => store.StartGoal("@arch:nope", "y", new[] { "r2" }, Array.Empty<string>(), false, null, 2));
        // Ended → the conversation can take a new goal.
        store.EndGoal(conv.Id, ArchGoalRouting.Stopped, null, 3);
        var next = store.StartGoal(conv.Id, "y", new[] { "r2" }, Array.Empty<string>(), false, null, 4);
        Assert.NotEqual("g?", next.Id);
        Assert.Equal(conv.Id, store.OwnerOfRepo("r2"));
        Assert.Null(store.OwnerOfRepo("r1"));
        Assert.True(store.ExtendGoal(conv.Id, new[] { "r1" }, new[] { "t9" }));
        Assert.Equal(conv.Id, store.OwnerOfRepo("r1"));
        Assert.Equal(conv.Id, store.OwnerOfTask("t9"));
        Assert.False(store.ExtendGoal("@arch", new[] { "r1" }, null));
    }

    [Fact]
    public void Queued_operator_messages_wait_for_the_next_wake_and_drain_once()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        var conv = store.AddConversation("a");
        Assert.Null(store.QueueGoalMessage(conv.Id, "hi", 1)); // no goal yet
        store.StartGoal(conv.Id, "x", new[] { "r1" }, Array.Empty<string>(), false, null, 1);
        Assert.Equal(1, store.QueueGoalMessage(conv.Id, " first ", 2)!.Queue.Count);
        Assert.Equal(2, store.QueueGoalMessage(conv.Id, "second", 3)!.Queue.Count);
        Assert.Null(store.QueueGoalMessage(conv.Id, "  ", 4));
        var drained = store.DrainGoalQueue(conv.Id);
        Assert.Equal(new[] { "first", "second" }, drained.Select(q => q.Text).ToArray());
        Assert.Empty(store.DrainGoalQueue(conv.Id));
        Assert.Empty(store.GoalOf(conv.Id)!.Queue);
    }

    // ---- routing ------------------------------------------------------------------------------

    [Fact]
    public void A_goal_conversation_is_woken_by_its_owned_repos_only()
    {
        var scope = ArchGoalRouting.ScopeFor(Goal("r1", "src-b/r9"), legacyBroadcast: false, Managed);
        Assert.Equal(new[] { "r1", "src-b/r9" }, scope.OrderBy(x => x).ToArray());
        var events = new[] { Turn(1, "self", "r1"), Turn(2, "self", "r2"), Turn(3, "src-b", "r9"), Turn(4, "src-c", "r1") };
        var draft = ArchAgentService.ComposeWakeCore(events, 0, 4, scope, k => k, Array.Empty<ArchAgentService.AgentView>(), 5000);
        Assert.NotNull(draft);
        Assert.Equal(new[] { "r1", "src-b/r9" }, draft!.RepoIds);
        Assert.DoesNotContain("r2", draft.Prompt);
        // Only unowned events → nothing (the inbox gets them).
        Assert.Null(ArchAgentService.ComposeWakeCore(new[] { Turn(5, "self", "r2") }, 4, 5, scope, k => k, Array.Empty<ArchAgentService.AgentView>(), 5000));
    }

    [Fact]
    public void The_default_conversation_gets_no_repo_wakes_unless_legacy_broadcast_is_on()
    {
        var none = ArchGoalRouting.ScopeFor(null, legacyBroadcast: false, Managed);
        Assert.Empty(none);
        Assert.Null(ArchAgentService.ComposeWakeCore(new[] { Turn(1, "self", "r1") }, 0, 1, none, k => k, Array.Empty<ArchAgentService.AgentView>(), 5000));

        var legacy = ArchGoalRouting.ScopeFor(null, legacyBroadcast: true, Managed);
        Assert.Equal(Managed, legacy);
        Assert.NotNull(ArchAgentService.ComposeWakeCore(new[] { Turn(1, "self", "r1") }, 0, 1, legacy, k => k, Array.Empty<ArchAgentService.AgentView>(), 5000));

        // An ended goal's conversation is goal-less for routing.
        var ended = Goal("r1") with { State = ArchGoalRouting.Done };
        Assert.Empty(ArchGoalRouting.ScopeFor(ended, false, Managed));
        Assert.Empty(ArchGoalRouting.TasksFor(ended));
    }

    [Fact]
    public void A_task_status_change_wakes_the_owner_of_the_task_or_of_its_assignee()
    {
        var scope = new HashSet<string>(StringComparer.Ordinal) { "r1" };
        var tasks = new HashSet<string>(StringComparer.Ordinal) { "t1" };
        var byTask = ArchAgentService.ComposeWakeCore(new[] { TaskEv(1, "t1", null, null) }, 0, 1, scope, k => k, Array.Empty<ArchAgentService.AgentView>(), 5000, tasks);
        Assert.NotNull(byTask);
        Assert.Contains("task \"t-t1\"", byTask!.Prompt);
        Assert.Contains("doing → done", byTask.Prompt);
        var byAssignee = ArchAgentService.ComposeWakeCore(new[] { TaskEv(2, "t7", "r1", null) }, 1, 2, scope, k => k, Array.Empty<ArchAgentService.AgentView>(), 5000, tasks);
        Assert.NotNull(byAssignee);
        Assert.Contains("r1", byAssignee!.RepoIds);
        Assert.Null(ArchAgentService.ComposeWakeCore(new[] { TaskEv(3, "t8", "r2", null) }, 2, 3, scope, k => k, Array.Empty<ArchAgentService.AgentView>(), 5000, tasks));
    }

    [Fact]
    public void The_task_graph_publishes_task_status_on_the_feed()
    {
        var feed = new HarnessEventFeed();
        var graph = new TaskGraphService(new Logger(), _dir, null, feed);
        var n = graph.AddNode("do it", null, null, null, 0, 0, 1)!;
        graph.UpdateNode(n.Id, null, null, null, null, "doing", null, null, 2);
        graph.UpdateNode(n.Id, "renamed", null, null, null, null, null, null, 3); // no status change → no event
        graph.MarkDispatched(n.Id, 4); // already doing → no event
        var (events, _) = feed.Read(0);
        var statusEvents = events.Where(e => e.Type == "task.status").ToList();
        Assert.Single(statusEvents);
        var data = JsonSerializer.SerializeToElement(statusEvents[0].Data);
        Assert.Equal("doing", data.GetProperty("status").GetString());
        Assert.Equal("todo", data.GetProperty("previous").GetString());
        Assert.Equal(n.Id, JsonSerializer.SerializeToElement(statusEvents[0].Source).GetProperty("taskId").GetString());
    }

    [Fact]
    public void Unowned_events_land_in_the_inbox_which_is_bounded_and_persisted()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        Assert.Equal(-1, store.InboxWatermark);
        store.AddInbox(Array.Empty<ArchStateStore.InboxEntry>(), 10);
        Assert.Equal(10, store.InboxWatermark);
        var entries = Enumerable.Range(1, ArchStateStore.MaxInbox + 5).Select(i => new ArchStateStore.InboxEntry(10 + i, 1000 + i, "turn.ended", "r2", "repo two", $"repo two: turn ended {i}"));
        store.AddInbox(entries, 10 + ArchStateStore.MaxInbox + 5);
        Assert.Equal(ArchStateStore.MaxInbox, store.Inbox().Count);
        Assert.Equal(16, store.Inbox().First().Seq); // the oldest five dropped
        Assert.Equal(3, store.Inbox(3).Count);
        var again = new ArchStateStore(new Logger(), _dir);
        Assert.Equal(ArchStateStore.MaxInbox, again.Inbox().Count);
        Assert.Equal(10 + ArchStateStore.MaxInbox + 5, again.InboxWatermark);
        again.ClearInbox();
        Assert.Empty(again.Inbox());
        Assert.Equal("repo two: turn.ended · completed", ArchGoalRouting.InboxLine("turn.ended", "repo two", "completed"));
    }

    [Fact]
    public void The_legacy_broadcast_setting_defaults_off_and_persists()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        Assert.False(store.LegacyBroadcast);
        store.SetLegacyBroadcast(true);
        Assert.True(new ArchStateStore(new Logger(), _dir).LegacyBroadcast);
        store.SetLegacyBroadcast(false);
        Assert.False(new ArchStateStore(new Logger(), _dir).LegacyBroadcast);
    }

    // ---- busy state ----------------------------------------------------------------------------

    [Fact]
    public void A_goal_conversation_is_busy_while_its_goal_runs_and_its_loop_is_armed()
    {
        var loops = new LoopConfigStore(new Logger(), _dir);
        var armed = loops.StartGoal("@arch:aaaa0001", "ship it", 5, "drive", null, null, "operator");
        Assert.True(ArchGoalRouting.IsBusy(Goal("r1"), armed));
        Assert.False(ArchGoalRouting.IsBusy(null, armed));
        Assert.False(ArchGoalRouting.IsBusy(Goal("r1") with { State = ArchGoalRouting.Stopped }, armed));
        var stopped = loops.Stop("@arch:aaaa0001", "operator");
        Assert.False(ArchGoalRouting.IsBusy(Goal("r1"), stopped));
        Assert.False(ArchGoalRouting.IsBusy(Goal("r1"), null));
        Assert.Equal(ArchGoalRouting.Done, ArchGoalRouting.StateFor("done"));
        Assert.Equal(ArchGoalRouting.Capped, ArchGoalRouting.StateFor("capped"));
        Assert.Equal(ArchGoalRouting.Error, ArchGoalRouting.StateFor("error"));
        Assert.Equal(ArchGoalRouting.Stopped, ArchGoalRouting.StateFor("stopped"));
        Assert.Equal(ArchGoalRouting.Stopped, ArchGoalRouting.StateFor("escalate"));
    }

    [Fact]
    public void A_goal_conversation_is_named_after_its_goal_and_its_loop_text_names_its_scope()
    {
        Assert.Equal("goal: ship the thing", ArchGoalRouting.ConversationName("  ship the thing \n\n"));
        Assert.StartsWith("goal: ", ArchGoalRouting.ConversationName(new string('x', 200)));
        Assert.True(ArchGoalRouting.ConversationName(new string('x', 200)).Length <= 60);
        var text = ArchGoalRouting.LoopGoalText("ship it", "g1", new[] { "spacex/prg", "living room/birocode" }, new[] { "\"task a\" (abcd1234)" });
        Assert.StartsWith("ship it", text);
        Assert.Contains("(arch goal g1)", text);
        Assert.Contains("owns: spacex/prg, living room/birocode", text);
        Assert.Contains("board tasks: \"task a\" (abcd1234)", text);
        Assert.Equal(8, ArchGoalRouting.NewId().Length);
    }

    // ---- completion -----------------------------------------------------------------------------

    [Fact]
    public void The_lifecycle_check_names_tasks_short_of_the_floor()
    {
        Assert.True(TaskLifecycle.IsAtLeast("done", TaskLifecycle.PrOpened));
        Assert.True(TaskLifecycle.IsAtLeast("pr-merged", TaskLifecycle.PrOpened));
        Assert.True(TaskLifecycle.IsAtLeast("pr-opened", TaskLifecycle.PrOpened));
        Assert.False(TaskLifecycle.IsAtLeast("pr-opened", TaskLifecycle.PrMerged));
        Assert.False(TaskLifecycle.IsAtLeast("doing", TaskLifecycle.PrOpened));
        Assert.False(TaskLifecycle.IsAtLeast("weird", TaskLifecycle.PrOpened));
        Assert.False(TaskLifecycle.IsAtLeast(null, TaskLifecycle.PrOpened));

        Assert.Null(TaskLifecycle.Blocker(Array.Empty<(string, string, string?)>(), false));
        Assert.Null(TaskLifecycle.Blocker(new[] { ("a1234567890", "A", (string?)"done") }, true));
        var blocker = TaskLifecycle.Blocker(new[] { ("a1234567890", "A", (string?)"done"), ("b1234567890", "B", (string?)"doing"), ("c1234567890", "C", (string?)null) }, false);
        Assert.NotNull(blocker);
        Assert.Contains("2 owned task(s) short of pr-opened", blocker);
        Assert.Contains("\"B\" (b1234567: doing)", blocker);
        Assert.Contains("\"C\" (c1234567: ?)", blocker);
        Assert.DoesNotContain("\"A\"", blocker);
        Assert.Contains("short of pr-merged", TaskLifecycle.Blocker(new[] { ("a", "A", (string?)"pr-opened") }, true)!);
    }

    [Fact]
    public void A_done_verdict_the_board_refuses_goes_back_to_work_and_an_accepted_one_stands()
    {
        var loops = new LoopConfigStore(new Logger(), _dir);
        var inst = loops.StartGoal("@arch:aaaa0001", "ship it", 5, "drive", "sess");
        loops.RecordSend("@arch:aaaa0001", inst.ArmedAt + 1000);
        inst = loops.Get("@arch:aaaa0001")!;
        var done = new LoopDecision.Stop("done", "verified", "GOAL_VERIFIED");

        var refused = ArchDrivenPolicy.Apply(done, inst, "work", 0, Floor, () => false, () => "the board still shows 1 owned task(s) short of pr-opened");
        var propose = Assert.IsType<LoopDecision.Propose>(refused);
        Assert.Equal(inst.Prompt, propose.Prompt);
        Assert.Equal(LoopConfigStore.PhaseWork, propose.EnterPhase);

        Assert.Same(done, ArchDrivenPolicy.Apply(done, inst, "work", 0, Floor, () => false, () => null));
        Assert.Same(done, ArchDrivenPolicy.Apply(done, inst, "work", 0, Floor, () => false)); // no gate: other arch loops
        // A NEEDS_HUMAN stop still holds; the gate never runs for it.
        var asked = false;
        var hold = Assert.IsType<LoopDecision.Hold>(ArchDrivenPolicy.Apply(new LoopDecision.Stop("escalate", "needs-human", "merge?"), inst, "work", 0, Floor, () => false, () => { asked = true; return "x"; }));
        Assert.True(hold.Escalate);
        Assert.False(asked);
    }

    // ---- tools + role prompt -------------------------------------------------------------------------

    [Fact]
    public void The_goal_tools_are_in_the_catalogue_and_the_role_prompt_teaches_goal_conversations()
    {
        var tools = ArchMcpServer.ToolsList();
        var names = tools.Select(t => t!["name"]!.GetValue<string>()).ToList();
        Assert.Contains("start_arch_goal", names);
        Assert.Contains("list_arch_goals", names);
        Assert.Contains("stop_arch_goal", names);
        Assert.Equal(23, names.Count);
        var start = tools.First(t => t!["name"]!.GetValue<string>() == "start_arch_goal")!;
        Assert.Equal(new[] { "goal" }, start["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()).ToArray());
        foreach (var p in new[] { "repos", "tasks", "maxIterations", "requireMerged" })
            Assert.NotNull(start["inputSchema"]!["properties"]![p]);
        Assert.Equal(new[] { "id" }, tools.First(t => t!["name"]!.GetValue<string>() == "stop_arch_goal")!["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()).ToArray());

        var role = ArchAgentService.RolePrompt();
        Assert.Equal("<!-- arch-role v7 -->", ArchAgentService.RoleVersionMarker);
        Assert.Contains("## Goal conversations", role);
        Assert.Contains("start_arch_goal", role);
        Assert.Contains("never woken by repo events", role);
        Assert.Contains("Never touch a repo or task you", role);
        Assert.Contains("pr-opened", role);
        Assert.Contains("NEEDS_HUMAN: <the blocker>", role);
    }
}
