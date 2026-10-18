using System.Text.Json;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec repo-agent-subagents: the keys (never a lane or fleet separator), the record
/// (start, plan, queue, held, end with a persisted summary, delivery, continue, the per-repo cap
/// on old records), the boundaries text a subagent's loop is armed with, the tool catalogue and
/// the identity routing of the repo-agent MCP server.</summary>
public sealed class RepoSubagentTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-subagents-" + Guid.NewGuid().ToString("N"));

    public RepoSubagentTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    // ---- keys ---------------------------------------------------------------------------------

    [Fact]
    public void Keys_round_trip_and_never_collide_with_lanes_or_fleet_keys()
    {
        var key = RepoSubagentKeys.Key("abc123", "deadbeef");
        Assert.Equal("abc123~goal~deadbeef", key);
        Assert.True(RepoSubagentKeys.IsKey(key));
        Assert.Equal(("abc123", "deadbeef"), RepoSubagentKeys.Parse(key));
        Assert.DoesNotContain('#', key);       // the run-slot lane separator
        Assert.DoesNotContain('/', key);       // the fleet key separator
        Assert.False(RepoSubagentKeys.IsKey("abc123"));
        Assert.False(RepoSubagentKeys.IsKey("@arch:aaaa0001"));
        Assert.False(RepoSubagentKeys.IsKey(null));
        Assert.Null(RepoSubagentKeys.Parse("~goal~x"));
        Assert.Null(RepoSubagentKeys.Parse("abc~goal~"));
        Assert.False(ArchAgentService.IsArchKey(key));
        Assert.Null(ArchStateStore.ParseFleetKey(key));
        Assert.Equal(8, RepoSubagentKeys.NewId().Length);
    }

    // ---- the record -----------------------------------------------------------------------------

    private RepoSubagentStore Store() => new(new Logger(), _dir);

    private static List<ArchGoalPlans.Step> Plan(params string[] titles) => titles.Select(t => ArchGoalPlans.Step.New(t)).ToList();

    [Fact]
    public void Start_records_the_parent_and_persists()
    {
        var store = Store();
        var s = store.Start("repo1", "check the build", "run the tests and report", "agent", 1000, 10, false, null, "main", "tab1", "sess-parent", Plan("build", "test"), false, null);
        Assert.Equal(RepoSubagentStore.Running, s.State);
        Assert.Equal("repo1~goal~" + s.Id, s.Key);
        Assert.Equal("tab1", s.ParentTabId);
        Assert.Equal("sess-parent", s.ParentSessionId);
        Assert.Equal("main", s.Branch);
        Assert.Equal(2, s.Plan.Count);
        Assert.Equal(1, store.RunningCount("repo1"));
        Assert.Equal(0, store.RunningCount("other"));
        // A second store reads the same file: the record survives a restart.
        var again = Store().Find(s.Id);
        Assert.NotNull(again);
        Assert.Equal("run the tests and report", again!.Goal);
        Assert.Equal(s.Id, Store().FindByKey(s.Key)!.Id);
    }

    [Fact]
    public void Queue_drains_once_and_only_while_running()
    {
        var store = Store();
        var s = store.Start("repo1", "n", "g", "agent", 1, 5, false, null, null, null, null, null, false, null);
        Assert.NotNull(store.Queue(s.Id, "first", 2));
        Assert.NotNull(store.Queue(s.Id, "second", 3));
        Assert.Null(store.Queue(s.Id, "  ", 4));
        Assert.Equal(new[] { "first", "second" }, store.Drain(s.Id).Select(q => q.Text));
        Assert.Empty(store.Drain(s.Id));
        store.End(s.Id, RepoSubagentStore.Done, "verified", "summary", 5);
        Assert.Null(store.Queue(s.Id, "late", 6));
    }

    [Fact]
    public void End_persists_the_summary_until_delivered_and_is_idempotent()
    {
        var store = Store();
        var s = store.Start("repo1", "n", "g", "agent", 1, 5, false, null, null, null, null, null, false, null);
        store.SetHeld(s.Id, true);
        var ended = store.End(s.Id, RepoSubagentStore.Done, "done: verified", "[subagent …] summary", 9)!;
        Assert.Equal(RepoSubagentStore.Done, ended.State);
        Assert.False(ended.Held);
        Assert.Single(Store().UndeliveredSummaries());            // survives a restart
        var twice = store.End(s.Id, RepoSubagentStore.Stopped, "late", "other", 10)!;
        Assert.Equal(RepoSubagentStore.Done, twice.State);        // unchanged
        Assert.Equal("[subagent …] summary", twice.Summary);
        store.MarkSummaryDelivered(s.Id, 11);
        Assert.Empty(store.UndeliveredSummaries());
    }

    [Fact]
    public void Reopen_carries_the_plan_and_clears_the_summary()
    {
        var store = Store();
        var plan = Plan("a", "b");
        plan = ArchGoalPlans.Mark(plan, 0, ArchGoalPlans.Done, null, null, null, 2);
        var s = store.Start("repo1", "n", "g", "agent", 1, 5, false, null, null, null, null, plan, false, null);
        store.End(s.Id, RepoSubagentStore.Capped, "cap", "sum", 3);
        var re = store.Reopen(s.Id, 4, 7)!;
        Assert.Equal(RepoSubagentStore.Running, re.State);
        Assert.Equal(7, re.MaxIterations);
        Assert.Null(re.Summary);
        Assert.Equal(ArchGoalPlans.Done, re.Plan[0].State);       // done steps stay done
        Assert.Null(store.Reopen(s.Id, 5, 7));                    // a running one is not reopened
    }

    [Fact]
    public void Remove_refuses_a_running_subagent()
    {
        var store = Store();
        var s = store.Start("repo1", "n", "g", "agent", 1, 5, false, null, null, null, null, null, false, null);
        Assert.False(store.Remove(s.Id));
        store.End(s.Id, RepoSubagentStore.Stopped, null, null, 2);
        Assert.True(store.Remove(s.Id));
        Assert.Null(store.Find(s.Id));
    }

    [Fact]
    public void Old_ended_records_fall_off_past_the_per_repo_cap()
    {
        var store = Store();
        for (var i = 0; i < RepoSubagentStore.MaxPerRepo + 5; i++)
        {
            var s = store.Start("repo1", $"n{i}", "g", "agent", i, 5, false, null, null, null, null, null, false, null);
            store.End(s.Id, RepoSubagentStore.Done, null, null, i);
        }
        Assert.Equal(RepoSubagentStore.MaxPerRepo, store.OfRepo("repo1").Count);
    }

    [Fact]
    public void Session_ownership_is_findable()
    {
        var store = Store();
        var s = store.Start("repo1", "n", "g", "agent", 1, 5, false, null, null, null, null, null, false, null);
        store.SetSession(s.Id, "sess-sub");
        Assert.Equal(s.Id, store.OwnerOfSession("sess-sub")!.Id);
        Assert.Null(store.OwnerOfSession("sess-parent"));
    }

    // ---- the boundaries the loop is armed with ----------------------------------------------------

    private static RepositoryRegistry.RepositoryInfo Repo() =>
        new("repo1", "prg", @"C:\x\prg", true, true, false, "advanced", null, Array.Empty<RepositoryRegistry.LocalAppInfo>(), "prg");

    [Fact]
    public void A_writer_is_told_the_branch_rule_one_writer_no_nesting_and_the_markers()
    {
        var s = new RepoSubagentStore.Subagent("deadbeef", "repo1", "tests", "Run the tests.", "running", 1, null, "agent", null, null, null, null, 10, false, null, "feature/x",
            Array.Empty<ArchGoalPlans.Step>(), false, Array.Empty<RepoSubagentStore.QueuedMessage>(), false, null, null, null);
        var text = RepoSubagentService.LoopGoalText(s, Repo(), "feature/x");
        Assert.StartsWith("Run the tests.", text);
        Assert.Contains("GOAL CONVERSATION", text);
        Assert.Contains("feature/x", text);
        Assert.Contains("never switch, create, merge, rebase, push or deploy", text);
        Assert.Contains("only writer", text);
        Assert.Contains("Never start a goal conversation yourself", text);
        Assert.Contains("LOOP_DONE", text);
        Assert.Contains("NEEDS_HUMAN:", text);
        Assert.Contains("mark_step", text);
    }

    [Fact]
    public void A_helper_is_told_it_is_read_only()
    {
        var s = new RepoSubagentStore.Subagent("deadbeef", "repo1", "review", "Review the diff.", "running", 1, null, "agent", null, null, null, null, 10, true, null, "main",
            Array.Empty<ArchGoalPlans.Step>(), false, Array.Empty<RepoSubagentStore.QueuedMessage>(), false, null, null, null);
        var text = RepoSubagentService.LoopGoalText(s, Repo(), "main");
        Assert.Contains("READ-ONLY helper", text);
        Assert.DoesNotContain("only writer", text);
    }

    [Fact]
    public void Inline_step_markers_become_a_plan()
    {
        var goal = "Create notes/hello.txt and commit it. STEP 1 — create the file — done: it exists. STEP 2 — commit it — done: git log shows it. STEP 3 — mark the plan done";
        var split = RepoSubagentService.SplitInlineSteps(goal);
        var plan = ArchGoalPlans.Derive(split);
        Assert.Equal(3, plan.Count);
        Assert.StartsWith("create the file", plan[0].Title);
        Assert.Equal("it exists.", plan[0].Done?.TrimEnd());
        Assert.Equal("no markers here", RepoSubagentService.SplitInlineSteps("no markers here"));
        Assert.Empty(ArchGoalPlans.Derive(RepoSubagentService.SplitInlineSteps("STEPS are mentioned once")));
    }

    // ---- the tools ---------------------------------------------------------------------------------

    [Fact]
    public void The_catalogue_has_the_six_subagent_tools_with_their_required_args()
    {
        var tools = RepoAgentMcpServer.ToolsList().ToDictionary(t => t!["name"]!.GetValue<string>(), t => t!);
        foreach (var name in new[] { "start_goal_conversation", "list_goal_conversations", "stop_goal_conversation", "message_goal_conversation", "mark_step", "edit_goal_plan" })
            Assert.True(tools.ContainsKey(name), name);
        string[] Required(string n) => (tools[n]["inputSchema"]!["required"] as JsonArray)?.Select(x => x!.GetValue<string>()).ToArray() ?? Array.Empty<string>();
        Assert.Equal(new[] { "goal" }, Required("start_goal_conversation"));
        Assert.Equal(new[] { "id" }, Required("stop_goal_conversation"));
        Assert.Equal(new[] { "id", "text" }, Required("message_goal_conversation"));
        Assert.Equal(new[] { "step", "state" }, Required("mark_step"));
        Assert.NotNull(tools["start_goal_conversation"]["inputSchema"]!["properties"]!["steps"]);
        Assert.Contains("readOnly", tools["start_goal_conversation"]["inputSchema"]!["properties"]!.AsObject().Select(p => p.Key));
    }

    [Fact]
    public void The_preamble_teaches_when_to_use_a_subagent()
    {
        var server = new RepoAgentMcpServer(new RepoAgentToolbox(new TaskGraphService(new Logger(), _dir)));
        var init = server.Handle(JsonNode.Parse("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}"), "repo1").Body!;
        var text = init["result"]!["instructions"]!.GetValue<string>();
        Assert.Contains("start_goal_conversation", text);
        Assert.Contains("not to parallelise writes", text);
        Assert.Contains("goal-conversations-convention", text);
    }

    [Fact]
    public void Without_the_service_the_tools_answer_unavailable_and_without_identity_error()
    {
        var server = new RepoAgentMcpServer(new RepoAgentToolbox(new TaskGraphService(new Logger(), _dir)));
        JsonElement Call(string tool, string? repo, string? sub = null)
        {
            var reply = server.Handle(JsonNode.Parse($"{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{{\"name\":\"{tool}\",\"arguments\":{{\"goal\":\"x\"}}}}}}"), repo, sub).Body!;
            return JsonDocument.Parse(reply["result"]!["content"]![0]!["text"]!.GetValue<string>()).RootElement;
        }
        Assert.Equal("unavailable", Call("start_goal_conversation", "repo1").GetProperty("status").GetString());
        Assert.Equal("error", Call("start_goal_conversation", null).GetProperty("status").GetString());
        Assert.Equal("unavailable", Call("list_goal_conversations", "repo1", "deadbeef").GetProperty("status").GetString());
    }

    [Fact]
    public void The_convention_doc_is_a_harness_help_topic()
    {
        var root = AppContext.BaseDirectory;
        var dir = new DirectoryInfo(root);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "ClaudeWeb.sln"))) dir = dir.Parent;
        Assert.NotNull(dir);
        var doc = Path.Combine(dir!.FullName, "docs", "goal-conversations-convention.md");
        Assert.True(File.Exists(doc));
        var text = File.ReadAllText(doc);
        Assert.Contains("One writer at a time", text);
        Assert.Contains("When to start one", text);
    }
}
