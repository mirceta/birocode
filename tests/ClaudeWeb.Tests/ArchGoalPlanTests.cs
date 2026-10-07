using System.Text.Json.Nodes;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Goal step plans (openspec goal-step-plan, fleet task 94c722e7): a goal is an
/// orchestration — its plan is declared or derived, marked by the arch with the one-active
/// rule and the relay-loop counter, blocked by a NEEDS_HUMAN ending and cleared by the
/// Operator's answer, carried over when a goal is continued, editable mid-flight, persisted
/// on the goal record, carried into the work / verify sends, and offered as tools.</summary>
public sealed class ArchGoalPlanTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-goalplan-" + Guid.NewGuid().ToString("N"));

    public ArchGoalPlanTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    private static List<ArchGoalPlans.Step> Three() => new()
    {
        ArchGoalPlans.Step.New("send brief A to prg", "prg's closing line", "send", 1),
        ArchGoalPlans.Step.New("wait for A's closing line, verify with hub_files", "the file is on the hub", "wait", 1),
        ArchGoalPlans.Step.New("relay fluent's questions to prg", null, "relay-loop", 1),
    };

    // ---- derive / parse -------------------------------------------------------------------------

    [Fact]
    public void A_plan_is_derived_from_STEP_lines_and_numbered_lines_with_their_done_clauses()
    {
        var text = "Ship the exporter.\n\nSTEP 1 — send the brief to spacex/prg — done: prg answers with its closing line\nSTEP 2: wait for prg, verify with hub_files (done when the file is listed)\nStep 3) hub_transfer prg → fluent, poll the job\n4. send brief B to fluent\nDONE when fluent's PR is open.";
        var steps = ArchGoalPlans.Derive(text, 5);
        Assert.Equal(4, steps.Count);
        Assert.Equal("send the brief to spacex/prg", steps[0].Title);
        Assert.Equal("prg answers with its closing line", steps[0].Done);
        Assert.Equal(ArchGoalPlans.KindSend, steps[0].Kind);
        Assert.Equal("wait for prg, verify with hub_files", steps[1].Title);
        Assert.Equal("the file is listed", steps[1].Done);
        Assert.Equal(ArchGoalPlans.KindWait, steps[1].Kind);
        Assert.Equal(ArchGoalPlans.KindTransfer, steps[2].Kind);
        Assert.Equal("send brief B to fluent", steps[3].Title);
        Assert.All(steps, s => Assert.Equal(ArchGoalPlans.Pending, s.State));
        // One numbered line is not a plan; prose without numbers is not a plan.
        Assert.Empty(ArchGoalPlans.Derive("1. the only step\nand some prose"));
        Assert.Empty(ArchGoalPlans.Derive("Make the build green on every machine."));
        // Duplicate numbers keep the first.
        Assert.Equal(2, ArchGoalPlans.Derive("1. a\n2. b\n1. a again").Count);
    }

    [Fact]
    public void The_steps_argument_parses_as_an_array_of_objects_a_json_string_or_lines()
    {
        var arr = JsonNode.Parse("""[{"title":"send A","done":"closing line","kind":"send"},{"title":"wait A"},"verify on the hub"]""");
        var fromArray = ArchGoalPlans.ParseSteps(arr);
        Assert.Equal(3, fromArray.Count);
        Assert.Equal("closing line", fromArray[0].Done);
        Assert.Equal(ArchGoalPlans.KindWait, fromArray[1].Kind);   // guessed from the words
        Assert.Equal(ArchGoalPlans.KindVerify, fromArray[2].Kind);
        var fromJsonString = ArchGoalPlans.ParseSteps(JsonValue.Create("""[{"title":"x","kind":"RELAY_LOOP"}]"""));
        Assert.Single(fromJsonString);
        Assert.Equal(ArchGoalPlans.KindRelayLoop, fromJsonString[0].Kind);
        var fromLines = ArchGoalPlans.ParseSteps(JsonValue.Create("1. send A — done: its closing line\n- wait for A\n\nask the Operator to decide the DB"));
        Assert.Equal(3, fromLines.Count);
        Assert.Equal("send A", fromLines[0].Title);
        Assert.Equal("its closing line", fromLines[0].Done);
        Assert.Equal("wait for A", fromLines[1].Title);
        Assert.Equal(ArchGoalPlans.KindHuman, fromLines[2].Kind);
        Assert.Empty(ArchGoalPlans.ParseSteps(null));
        Assert.Empty(ArchGoalPlans.ParseSteps(JsonValue.Create("  ")));
    }

    [Fact]
    public void Evidence_parses_from_text_a_bare_url_or_a_typed_object()
    {
        Assert.Null(ArchGoalPlans.ParseEvidence(null));
        Assert.Equal("https://github.com/x/y/pull/7", ArchGoalPlans.ParseEvidence(JsonValue.Create("https://github.com/x/y/pull/7"))!.Url);
        Assert.Equal("prg said done", ArchGoalPlans.ParseEvidence(JsonValue.Create("prg said done"))!.Text);
        var obj = ArchGoalPlans.ParseEvidence(JsonNode.Parse("""{"hubPath":"prg/out.csv","size":1234,"jobId":"j-9","closingLine":"TASK COMMITTED","extra":"x"}"""))!;
        Assert.Equal("prg/out.csv", obj.HubPath);
        Assert.Equal(1234, obj.Size);
        Assert.Equal("j-9", obj.JobId);
        Assert.Equal("TASK COMMITTED", obj.ClosingLine);
        Assert.Contains("extra: x", obj.Text);
        Assert.Contains("hub prg/out.csv (1234 bytes)", obj.Line());
        // A JSON object sent as a string is understood too.
        Assert.Equal("abc123", ArchGoalPlans.ParseEvidence(JsonValue.Create("""{"commit":"abc123"}"""))!.Commit);
    }

    // ---- find / mark ------------------------------------------------------------------------------

    [Fact]
    public void A_step_is_found_by_number_or_title_and_an_ambiguous_title_is_refused()
    {
        var steps = Three();
        Assert.Equal(0, ArchGoalPlans.FindIndex(steps, "1"));
        Assert.Equal(2, ArchGoalPlans.FindIndex(steps, "#3"));
        Assert.Equal(-1, ArchGoalPlans.FindIndex(steps, "4"));
        Assert.Equal(1, ArchGoalPlans.FindIndex(steps, "wait for A"));        // unique prefix
        Assert.Equal(2, ArchGoalPlans.FindIndex(steps, "fluent's questions")); // unique contains
        Assert.Equal(-1, ArchGoalPlans.FindIndex(steps, "nothing like it"));
        steps.Add(ArchGoalPlans.Step.New("send brief B to fluent"));
        Assert.Equal(-2, ArchGoalPlans.FindIndex(steps, "send brief"));       // two match
        Assert.Equal(-1, ArchGoalPlans.FindIndex(steps, ""));
    }

    [Fact]
    public void Marking_keeps_one_step_active_counts_relay_loops_and_records_evidence()
    {
        var steps = Three();
        var a = ArchGoalPlans.Mark(steps, 0, ArchGoalPlans.Active, null, null, null, 10);
        Assert.Equal(ArchGoalPlans.Active, a[0].State);
        var b = ArchGoalPlans.Mark(a, 1, ArchGoalPlans.Active, "prg is working", null, null, 11);
        Assert.Equal(ArchGoalPlans.Pending, b[0].State);   // only one active
        Assert.Equal(ArchGoalPlans.Active, b[1].State);
        Assert.Equal("prg is working", b[1].Note);
        // A relay-loop step may run beside the active step; re-activating it counts a relay.
        var c = ArchGoalPlans.Mark(b, 2, ArchGoalPlans.Active, null, null, null, 12);
        Assert.Equal(ArchGoalPlans.Active, c[1].State);
        Assert.Equal(ArchGoalPlans.Active, c[2].State);
        Assert.Equal(0, c[2].Counter);
        var d = ArchGoalPlans.Mark(c, 2, ArchGoalPlans.Active, null, null, null, 13);
        Assert.Equal(1, d[2].Counter);
        var e = ArchGoalPlans.Mark(d, 2, ArchGoalPlans.Active, null, null, 7, 14);
        Assert.Equal(7, e[2].Counter);
        // Done with evidence; the note of a done step is what was given.
        var ev = new ArchGoalPlans.Evidence(ClosingLine: "TASK PR … #7", Url: "https://github.com/x/y/pull/7");
        var f = ArchGoalPlans.Mark(e, 1, ArchGoalPlans.Done, "merged", ev, null, 15);
        Assert.Equal(ArchGoalPlans.Done, f[1].State);
        Assert.Equal("merged", f[1].Note);
        Assert.Equal("https://github.com/x/y/pull/7", f[1].Evidence!.Url);
        Assert.Equal(15, f[1].UpdatedAt);
        Assert.Equal((1, 3), ArchGoalPlans.Progress(f));
        // Skipped counts as progress; blocked counts as blocked.
        var g = ArchGoalPlans.Mark(f, 0, ArchGoalPlans.Skipped, null, null, null, 16);
        Assert.Equal((2, 3), ArchGoalPlans.Progress(g));
        var h = ArchGoalPlans.Mark(g, 2, ArchGoalPlans.Blocked, "which DB?", null, null, 17);
        Assert.Equal(1, ArchGoalPlans.BlockedCount(h));
        Assert.False(h[2].AwaitsHuman);   // the arch's own block is not the harness's NEEDS_HUMAN block
        Assert.Equal("", ArchGoalPlans.NormalizeState("bogus"));
        Assert.Equal(ArchGoalPlans.Done, ArchGoalPlans.NormalizeState("Completed"));
    }

    [Fact]
    public void A_NEEDS_HUMAN_ending_blocks_the_active_step_and_the_answer_clears_it()
    {
        var steps = ArchGoalPlans.Mark(Three(), 1, ArchGoalPlans.Active, null, null, null, 1);
        var blocked = ArchGoalPlans.BlockOnHuman(steps, "which staging DB may I drop?", 2);
        Assert.Equal(ArchGoalPlans.Blocked, blocked[1].State);
        Assert.True(blocked[1].AwaitsHuman);
        Assert.Equal("which staging DB may I drop?", blocked[1].Note);
        Assert.True(ArchGoalPlans.AwaitsHuman(blocked));
        var cleared = ArchGoalPlans.ClearHumanBlock(blocked, 3);
        Assert.Equal(ArchGoalPlans.Active, cleared[1].State);
        Assert.False(cleared[1].AwaitsHuman);
        Assert.Null(cleared[1].Note);
        Assert.False(ArchGoalPlans.AwaitsHuman(cleared));
        // No active step: the first pending one is blocked. No steps at all: a human step is added.
        var noActive = ArchGoalPlans.BlockOnHuman(Three(), "q", 4);
        Assert.Equal(ArchGoalPlans.Blocked, noActive[0].State);
        var empty = ArchGoalPlans.BlockOnHuman(Array.Empty<ArchGoalPlans.Step>(), "q", 5);
        Assert.Single(empty);
        Assert.Equal(ArchGoalPlans.KindHuman, empty[0].Kind);
        Assert.True(empty[0].AwaitsHuman);
        // Clearing an untouched plan changes nothing.
        Assert.Equal(Three().Select(s => s.State), ArchGoalPlans.ClearHumanBlock(Three(), 6).Select(s => s.State));
    }

    [Fact]
    public void A_continued_goal_keeps_done_and_skipped_steps_and_resets_the_rest()
    {
        var steps = Three();
        steps = ArchGoalPlans.Mark(steps, 0, ArchGoalPlans.Done, null, new ArchGoalPlans.Evidence(Text: "sent"), null, 1);
        steps = ArchGoalPlans.Mark(steps, 1, ArchGoalPlans.Active, "polling", null, null, 2);
        steps = ArchGoalPlans.BlockOnHuman(steps, "?", 3);
        var carried = ArchGoalPlans.CarryOver(steps, 9);
        Assert.Equal(ArchGoalPlans.Done, carried[0].State);
        Assert.Equal("sent", carried[0].Evidence!.Text);
        Assert.Equal(ArchGoalPlans.Pending, carried[1].State);
        Assert.Null(carried[1].Note);
        Assert.False(carried[1].AwaitsHuman);
        Assert.Equal(ArchGoalPlans.Pending, carried[2].State);
    }

    // ---- edit ----------------------------------------------------------------------------------------

    [Fact]
    public void The_plan_is_editable_mid_flight_set_keeps_states_by_title_add_rename_remove_move()
    {
        var steps = ArchGoalPlans.Mark(Three(), 0, ArchGoalPlans.Done, null, new ArchGoalPlans.Evidence(Text: "ok"), null, 1);
        // set: a step with the same title keeps its state and evidence; new ones are pending.
        var (set, e1) = ArchGoalPlans.Edit(steps, "set", null, null, null, null, null,
            new[] { ArchGoalPlans.Step.New("send brief A to prg"), ArchGoalPlans.Step.New("probe prg's build"), ArchGoalPlans.Step.New("probe fluent's build") }, 2);
        Assert.Null(e1);
        Assert.Equal(3, set!.Count);
        Assert.Equal(ArchGoalPlans.Done, set[0].State);
        Assert.Equal("ok", set[0].Evidence!.Text);
        Assert.Equal(ArchGoalPlans.Pending, set[1].State);
        // add at a position, rename, move, remove.
        var (added, e2) = ArchGoalPlans.Edit(set, "add", null, "send brief B to fluent", "fluent's closing line", "send", 2, null, 3);
        Assert.Null(e2);
        Assert.Equal("send brief B to fluent", added![1].Title);
        Assert.Equal("fluent's closing line", added[1].Done);
        var (renamed, e3) = ArchGoalPlans.Edit(added, "rename", "probe prg", "probe prg's build on main", null, "verify", null, null, 4);
        Assert.Null(e3);
        Assert.Equal("probe prg's build on main", renamed![2].Title);
        Assert.Equal(ArchGoalPlans.KindVerify, renamed[2].Kind);
        var (moved, e4) = ArchGoalPlans.Edit(renamed, "move", "4", null, null, null, 1, null, 5);
        Assert.Null(e4);
        Assert.Equal("probe fluent's build", moved![0].Title);
        var (removed, e5) = ArchGoalPlans.Edit(moved, "remove", "probe fluent", null, null, null, null, null, 6);
        Assert.Null(e5);
        Assert.Equal(3, removed!.Count);
        Assert.Equal("send brief A to prg", removed[0].Title);
        // Errors are words, never exceptions.
        Assert.NotNull(ArchGoalPlans.Edit(removed, "set", null, null, null, null, null, null, 7).Error);
        Assert.NotNull(ArchGoalPlans.Edit(removed, "add", null, "", null, null, null, null, 7).Error);
        Assert.NotNull(ArchGoalPlans.Edit(removed, "remove", "99", null, null, null, null, null, 7).Error);
        Assert.NotNull(ArchGoalPlans.Edit(removed, "move", "1", null, null, null, null, null, 7).Error);
        Assert.NotNull(ArchGoalPlans.Edit(removed, "explode", null, null, null, null, null, null, 7).Error);
    }

    // ---- the words the sends and the summary carry -------------------------------------------------

    [Fact]
    public void The_work_send_carries_the_plan_and_its_rules_and_the_verify_send_the_plan_to_check()
    {
        var steps = ArchGoalPlans.Mark(Three(), 0, ArchGoalPlans.Done, null, new ArchGoalPlans.Evidence(ClosingLine: "TASK COMMITTED x"), null, 1);
        steps = ArchGoalPlans.Mark(steps, 1, ArchGoalPlans.Active, null, null, null, 2);
        var work = ArchGoalPlans.WorkBlock(steps, derived: true, "g1", null);
        Assert.Contains("step plan of goal g1", work);
        Assert.Contains("derived from the goal text", work);
        Assert.Contains("1. ✓ send brief A to prg [send] — done", work);
        Assert.Contains("closing line: \"TASK COMMITTED x\"", work);
        Assert.Contains("2. ▶ wait for A's closing line", work);
        Assert.Contains("1/3 done. You are on step 2.", work);
        Assert.Contains("never re-send its brief", work);
        var continued = ArchGoalPlans.WorkBlock(steps, false, "g2", "g1");
        Assert.Contains("CONTINUES goal g1", continued);
        Assert.Contains("must not receive it again", continued);
        var none = ArchGoalPlans.WorkBlock(Array.Empty<ArchGoalPlans.Step>(), false, "g3", null);
        Assert.Contains("No plan yet", none);
        Assert.Contains("edit_goal_plan(action: \"set\"", none);
        var verify = ArchGoalPlans.VerifyBlock(steps, "g1");
        Assert.Contains("verify against it", verify);
        Assert.Contains("A step without evidence is not done", verify);
        var lines = ArchGoalPlans.SummaryLines(steps);
        Assert.Equal(3, lines.Count);
        Assert.StartsWith("- 1. ✓", lines[0]);
        var views = ArchGoalPlans.Views(steps);
        Assert.Equal(3, views.Count);
    }

    // ---- the store ---------------------------------------------------------------------------------------

    [Fact]
    public void The_plan_lives_on_the_goal_record_persists_and_survives_the_goal_ending()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        var conv = store.AddConversation("goal: ship it");
        var g = store.StartGoal(conv.Id, "ship it", new[] { "r1" }, Array.Empty<string>(), "operator", 50, Three(), planDerived: true, continuesGoalId: "old-goal");
        Assert.Equal(3, g.Steps.Count);
        Assert.True(g.PlanDerived);
        Assert.Equal("old-goal", g.ContinuesGoalId);
        var marked = ArchGoalPlans.Mark(g.Steps, 0, ArchGoalPlans.Done, null, new ArchGoalPlans.Evidence(Url: "https://x/pr/1"), null, 60);
        Assert.NotNull(store.SetGoalPlan(conv.Id, marked, derived: false));
        var again = new ArchStateStore(new Logger(), _dir);
        var loaded = again.FindGoal(g.Id)!;
        Assert.Equal(ArchGoalPlans.Done, loaded.Steps[0].State);
        Assert.Equal("https://x/pr/1", loaded.Steps[0].Evidence!.Url);
        Assert.False(loaded.PlanDerived);
        Assert.Equal("old-goal", loaded.ContinuesGoalId);
        // Ending keeps the plan; a plan can still be written on an ended goal (the record).
        var ended = again.EndGoal(conv.Id, ArchGoals.Capped, "cap", 70)!;
        Assert.Equal(3, ended.Steps.Count);
        Assert.NotNull(again.SetGoalPlan(conv.Id, ArchGoalPlans.CarryOver(ended.Steps, 71)));
        Assert.Null(again.SetGoalPlan("@arch", Three()));   // the default runs no goal
        // The plain overload starts without a plan.
        var plain = again.StartGoal(again.AddConversation("b").Id, "x", new[] { "r2" }, Array.Empty<string>(), null, 80);
        Assert.Empty(plain.Steps);
        Assert.Null(plain.ContinuesGoalId);
    }

    [Fact]
    public void A_held_goal_loop_resumes_in_place_only_from_escalate()
    {
        var loops = new LoopConfigStore(new Logger(), _dir);
        var key = "@arch:aaaa0001";
        loops.StartGoal(key, "ship it", 5, "drive", "sess", null, "operator");
        loops.RecordSend(key, 1000);
        loops.RecordSend(key, 2000);
        loops.Resolve(key, "escalate", "needs-human", "which DB?");
        var before = loops.Get(key)!;
        Assert.False(before.Active);
        var resumed = loops.ResumeGoal(key)!;
        Assert.True(resumed.Active);
        Assert.Equal("looping", resumed.Status);
        Assert.Equal(0, resumed.IterationsDone);
        Assert.Equal(LoopConfigStore.PhaseWork, resumed.Phase);
        Assert.Equal(5, resumed.MaxIterations);
        Assert.True(resumed.ArmedAt > before.ArmedAt);
        Assert.Null(loops.ResumeGoal(key));   // already active
        loops.Resolve(key, "capped", "cap", "cap reached");
        Assert.Null(loops.ResumeGoal(key));   // capped is not a hold
        loops.StartArch("@arch:aaaa0002", "drive", 3, null);
        loops.Resolve("@arch:aaaa0002", "escalate", "needs-human", "?");
        Assert.Null(loops.ResumeGoal("@arch:aaaa0002"));   // not a goal loop
    }

    // ---- tools + role prompt ------------------------------------------------------------------------------

    [Fact]
    public void The_plan_tools_are_in_the_catalogue_and_the_role_prompt_teaches_the_orchestration()
    {
        var tools = ArchMcpServer.ToolsList();
        var byName = tools.ToDictionary(t => t!["name"]!.GetValue<string>(), t => t!);
        Assert.True(byName.ContainsKey("mark_step"));
        Assert.True(byName.ContainsKey("edit_goal_plan"));
        var mark = byName["mark_step"];
        Assert.Equal(new[] { "step", "state" }, mark["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()).ToArray());
        foreach (var p in new[] { "goalId", "note", "evidence", "counter" }) Assert.NotNull(mark["inputSchema"]!["properties"]![p]);
        Assert.Contains("only from the goal conversation that owns the goal", mark["description"]!.GetValue<string>());
        var edit = byName["edit_goal_plan"];
        Assert.Equal(new[] { "action" }, edit["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()).ToArray());
        Assert.NotNull(edit["inputSchema"]!["properties"]!["steps"]!["items"]);
        var start = byName["start_arch_goal"];
        Assert.NotNull(start["inputSchema"]!["properties"]!["steps"]);
        Assert.NotNull(start["inputSchema"]!["properties"]!["continuesGoalId"]);
        Assert.Equal(new[] { "goal" }, start["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()).ToArray());
        Assert.Contains("STEP PLAN", byName["list_arch_goals"]["description"]!.GetValue<string>());
        Assert.True(ArchMcpServer.IsKnownTool("mark_step"));

        var role = ArchAgentService.RolePrompt();
        Assert.Contains("<!-- arch-role v", ArchAgentService.RoleVersionMarker); // the exact version is pinned in ArchAgentTests
        Assert.Contains("EVERY GOAL IS AN ORCHESTRATION", role);
        Assert.Contains("mark_step(step,", role);
        Assert.Contains("edit_goal_plan(action:", role);
        Assert.Contains("never re-send a brief", role);
        Assert.Contains("continuesGoalId", role);
        Assert.Contains("the goal is HELD", role);
        Assert.Contains("relay-loop", role);
    }

    [Fact]
    public void The_mcp_server_hands_the_calling_conversation_to_the_tools()
    {
        // tools/list answers the same catalogue whatever the conversation; the conv parameter
        // only matters for tools/call (the owner rule) — the binding is covered end to end.
        var listed = new ArchMcpServer(null!).Handle(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = 1, ["method"] = "tools/list" }, "@arch:aaaa0001");
        Assert.Equal(200, listed.Status);
        Assert.Equal(ArchMcpServer.ToolsList().Count, (listed.Body?["result"]?["tools"] as JsonArray)?.Count);
        Assert.Equal(202, new ArchMcpServer(null!).Handle(new JsonObject { ["jsonrpc"] = "2.0", ["method"] = "notifications/initialized" }, "@arch:aaaa0001").Status);
    }
}
