using System.Text.Json;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Unit coverage for openspec arch-loop-tools: the Loop panel's parameter
/// schema as the tools validate it, the audit summary, the list view, who-armed-it on
/// the store and its projection, the loop transitions on the harness feed, the wake
/// composition picking them up, and the MCP catalogue. Pure or temp-dir backed.</summary>
public class ArchLoopToolsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-archloops-" + Guid.NewGuid().ToString("N"));
    public ArchLoopToolsTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private static ArchLoopTools.LoopParams P(string? kind = null, string? mode = null, string? goal = null, string? prompt = null, string? sentinel = null,
        int? cap = null, string? recipe = null, string? tabId = null, bool? verify = null, bool? footer = null) =>
        new(kind, mode, goal, prompt, sentinel, cap, recipe, tabId, verify, footer);

    // ---- parameter validation against the panel's schema ------------------------------

    [Fact]
    public void Kinds_and_modes_are_exactly_the_panels()
    {
        Assert.Equal(new[] { "suggestion", "recipe", "goal", "queue" }, ArchLoopTools.Kinds);
        Assert.Equal(new[] { "suggest", "drive" }, ArchLoopTools.Modes);
    }

    [Theory]
    [InlineData("goal", null, null, null, null, "needs a goal")]
    [InlineData("recipe", null, null, null, null, "needs a recipe")]
    [InlineData("queue", null, null, null, null, "drains a dock tab")]
    [InlineData("cron", null, null, null, null, "unknown loop kind")]
    [InlineData(null, null, null, null, null, "kind is required")]
    [InlineData("goal", "ship it", null, "loud", null, "unknown mode")]
    public void Start_is_refused_when_the_panel_would_refuse(string? kind, string? goal, string? prompt, string? mode, string? tab, string expected)
    {
        var err = ArchLoopTools.ValidateStart(P(kind: kind, goal: goal, prompt: prompt, mode: mode, tabId: tab));
        Assert.NotNull(err);
        Assert.Contains(expected, err, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(101)]
    public void Cap_outside_the_panels_range_is_refused(int cap)
    {
        Assert.Contains("1–100", ArchLoopTools.ValidateStart(P(kind: "goal", goal: "x", cap: cap)));
        Assert.Contains("1–100", ArchLoopTools.ValidateUpdate(P(cap: cap), rearm: false));
    }

    [Fact]
    public void Valid_starts_pass_and_kind_is_inferred_from_the_parameters()
    {
        Assert.Null(ArchLoopTools.ValidateStart(P(kind: "goal", goal: "green tests", mode: "drive", cap: 10)));
        Assert.Null(ArchLoopTools.ValidateStart(P(kind: "recipe", recipe: "Ship it")));
        Assert.Null(ArchLoopTools.ValidateStart(P(kind: "recipe", prompt: "run the ritual", sentinel: "DONE")));
        Assert.Null(ArchLoopTools.ValidateStart(P(kind: "queue", tabId: "t1", verify: false)));
        Assert.Null(ArchLoopTools.ValidateStart(P(kind: "suggestion")));
        Assert.Null(ArchLoopTools.ValidateStart(P(kind: "GOAL", goal: "case-insensitive")));
        Assert.Equal("goal", ArchLoopTools.InferKind(P(goal: "g")));
        Assert.Equal("recipe", ArchLoopTools.InferKind(P(recipe: "r")));
        Assert.Equal("recipe", ArchLoopTools.InferKind(P(prompt: "p")));
        Assert.Equal("queue", ArchLoopTools.InferKind(P(tabId: "t")));
        Assert.Null(ArchLoopTools.InferKind(P()));
    }

    [Fact]
    public void Update_needs_something_to_change_unless_rearming()
    {
        Assert.Contains("nothing to change", ArchLoopTools.ValidateUpdate(P(), rearm: false));
        Assert.Null(ArchLoopTools.ValidateUpdate(P(), rearm: true));
        Assert.Null(ArchLoopTools.ValidateUpdate(P(cap: 20), rearm: false));
        Assert.Null(ArchLoopTools.ValidateUpdate(P(mode: "suggest"), rearm: false));
        Assert.Contains("unknown mode", ArchLoopTools.ValidateUpdate(P(mode: "fast"), rearm: false));
    }

    // ---- audit summary: who is the actor, this is the what ----------------------------------

    [Fact]
    public void Summary_names_kind_mode_cap_and_the_head_of_the_text_only()
    {
        var s = ArchLoopTools.Summary("start", "goal", P(kind: "goal", mode: "drive", cap: 10, goal: new string('g', 200)));
        Assert.StartsWith("start · goal · drive · cap 10 · \"", s);
        Assert.Contains("…", s);
        Assert.True(s.Length < 140, s);
        Assert.Contains("recipe \"Ship it\"", ArchLoopTools.Summary("start", "recipe", P(recipe: "Ship it")));
        Assert.Contains("verify off", ArchLoopTools.Summary("start", "queue", P(tabId: "t1", verify: false)));
    }

    // ---- the store: who armed it, stop by whom, and the feed events --------------------------

    [Fact]
    public void Armed_by_round_trips_and_defaults_to_operator()
    {
        var feed = new HarnessEventFeed();
        var store = new LoopConfigStore(new Logger(), _dir, feed);
        var s = store.StartGoal("r1", "green tests", 10, "drive", "sess", null, LoopConfigStore.ArmedByArch);
        Assert.Equal("arch", s.ArmedBy);
        Assert.Equal("arch", new LoopConfigStore(new Logger(), _dir).Get("r1")!.ArmedBy);
        var op = store.StartGoal("r2", "as the operator does", null);
        Assert.Equal("operator", op.ArmedBy);
        var fleet = store.Start("r3", "ritual", null, null, armedBy: "arch@MONSTER");
        Assert.Equal("arch@MONSTER", fleet.ArmedBy);
    }

    [Fact]
    public void Stop_by_the_arch_names_it_and_keeps_the_record()
    {
        var store = new LoopConfigStore(new Logger(), _dir);
        store.StartGoal("r1", "g", 5, "drive", null, null, "arch");
        var s = store.Stop("r1", "arch")!;
        Assert.False(s.Active);
        Assert.Equal("stopped", s.Status);
        Assert.Equal("arch", s.StopReason);
        Assert.Equal("stopped by arch", s.StopDetail);
        Assert.NotNull(store.Get("r1"));                  // stopped, not deleted
        var user = store.StartGoal("r2", "g", 5, "drive").RepoId;
        Assert.Equal("user", store.Stop(user)!.StopReason);  // the button's wording is unchanged
    }

    [Fact]
    public void Loop_transitions_reach_the_harness_feed_with_the_repo_as_source()
    {
        var feed = new HarnessEventFeed();
        var store = new LoopConfigStore(new Logger(), _dir, feed);
        store.StartGoal("r1", "g", 3, "drive", null, null, "arch");
        store.RecordSend("r1", 1000);
        store.Resolve("r1", "escalate", "needs-human", "which branch?");
        store.StartGoal("r1", "g", 3, "drive", null, null, "arch");
        store.RecordSend("r1", 2000);
        store.Resolve("r1", "capped", "cap", "3/3");
        store.Stop("r1", "arch");
        var (events, _) = feed.Read(0);
        var types = events.Select(e => e.Type).ToList();
        Assert.Equal(new[] { "loop.armed", "loop.fired", "loop.escalated", "loop.armed", "loop.fired", "loop.capped", "loop.stopped" }, types);
        Assert.Equal("r1", ArchAgentService.RepoIdOf(events[0].Source));
        var esc = JsonSerializer.SerializeToElement(events[2].Data);
        Assert.Equal("goal", esc.GetProperty("kind").GetString());
        Assert.Equal("arch", esc.GetProperty("armedBy").GetString());
        Assert.Equal("which branch?", esc.GetProperty("detail").GetString());
        Assert.Equal(1, esc.GetProperty("iterationsDone").GetInt32());
    }

    [Theory]
    [InlineData("escalate", "loop.escalated")]
    [InlineData("capped", "loop.capped")]
    [InlineData("done", "loop.done")]
    [InlineData("error", "loop.error")]
    [InlineData("stopped", "loop.stopped")]
    [InlineData("weird", "loop.resolved")]
    public void Terminal_statuses_map_to_event_types(string status, string type) => Assert.Equal(type, LoopConfigStore.EventTypeFor(status));

    // ---- the list view --------------------------------------------------------------------

    [Fact]
    public void View_reports_state_pacing_next_fire_and_creator()
    {
        var store = new LoopConfigStore(new Logger(), _dir);
        var armed = store.StartGoal("r1", "green tests", 10, "drive", "sess", null, "arch");
        var now = armed.ArmedAt + 5_000;
        var v = JsonSerializer.SerializeToElement(ArchLoopTools.View(armed, "r1", "birocode", "self", "living room/birocode#1", null, now));
        Assert.Equal("r1", v.GetProperty("loopId").GetString());
        Assert.Equal("armed", v.GetProperty("state").GetString());
        Assert.Equal("arch", v.GetProperty("createdBy").GetString());
        Assert.Equal(10, v.GetProperty("cap").GetInt32());
        Assert.Equal("green tests", v.GetProperty("goal").GetString());
        Assert.Contains("idle after", v.GetProperty("nextFire").GetString());
        Assert.Contains("engine tick", v.GetProperty("pacing").GetString());
        Assert.Equal(JsonValueKind.Null, v.GetProperty("lastFireAt").ValueKind);

        var fired = store.RecordSend("r1", now)!;
        var v2 = JsonSerializer.SerializeToElement(ArchLoopTools.View(fired, "r1", "birocode", "self", null, null, now + 60_000));
        Assert.Equal("active", v2.GetProperty("state").GetString());
        Assert.Equal(now, v2.GetProperty("lastFireAt").GetInt64());
        Assert.Equal("1 min 00 s", v2.GetProperty("lastFireAgo").GetString());

        var esc = store.Resolve("r1", "escalate", "needs-human", "which branch?")!;
        var v3 = JsonSerializer.SerializeToElement(ArchLoopTools.View(esc, "r1", "birocode", "self", null, null, now));
        Assert.Equal("escalate", v3.GetProperty("state").GetString());
        Assert.Equal(JsonValueKind.Null, v3.GetProperty("nextFire").ValueKind);
        Assert.Equal("which branch?", v3.GetProperty("stopDetail").GetString());

        var sug = store.StartSuggestion("r2", "suggest");
        var v4 = JsonSerializer.SerializeToElement(ArchLoopTools.View(sug, "r2", "prg", "self", null, null, now));
        Assert.Contains("pends", v4.GetProperty("nextFire").GetString());
        Assert.Equal(JsonValueKind.Null, v4.GetProperty("sentinel").ValueKind);
    }

    // ---- the wake-up ------------------------------------------------------------------------

    private static CollectorService.CollectorEvent Ev(int seq, string type, string repoId, long at, object data) =>
        new(seq, at, type, new { repoId, repoName = repoId }, data, CollectorService.SelfId, "self");

    private static ArchAgentService.AgentView View(string id) => new("self", id, id, "", "main", "main", false, "available", "none", null, null, true);

    [Fact]
    public void Loop_escalation_and_cap_wake_the_arch_and_are_narrated()
    {
        var managed = new HashSet<string>(StringComparer.Ordinal) { "r1" };
        var events = new[]
        {
            Ev(1, "loop.escalated", "r1", 1000, new { kind = "goal", mode = "drive", status = "escalate", iterationsDone = 2, maxIterations = 10, armedBy = "arch", reason = "needs-human", detail = "which branch?" }),
            Ev(2, "loop.capped", "r1", 2000, new { kind = "recipe", mode = "drive", status = "capped", iterationsDone = 5, maxIterations = 5, armedBy = "operator", reason = "cap", detail = "5/5" }),
            Ev(3, "loop.fired", "other", 3000, new { kind = "goal", iterationsDone = 1, maxIterations = 3, armedBy = "arch" }),
        };
        var draft = ArchAgentService.ComposeWakeCore(events, 0, 3, managed, id => "name-" + id, new[] { View("r1") }, 10_000);
        Assert.NotNull(draft);
        Assert.Contains("name-r1: goal loop ESCALATED after 2/10 (armed by arch) — which branch?", draft!.Prompt);
        Assert.Contains("name-r1: recipe loop hit its cap (5/5)", draft.Prompt);
        Assert.DoesNotContain("(armed by operator)", draft.Prompt);
        Assert.DoesNotContain("other", draft.Prompt);   // unmanaged repo's loop is not a wake
        Assert.Contains("list_loops", draft.Prompt);
        Assert.Equal(new[] { "r1" }, draft.RepoIds);
    }

    [Fact]
    public void Arming_a_loop_is_not_a_wake_but_firing_and_stopping_are()
    {
        var managed = new HashSet<string>(StringComparer.Ordinal) { "r1" };
        var armed = new[] { Ev(1, "loop.armed", "r1", 1000, new { kind = "goal", armedBy = "arch" }) };
        Assert.Null(ArchAgentService.ComposeWakeCore(armed, 0, 1, managed, id => id, Array.Empty<ArchAgentService.AgentView>(), 5000));
        var moved = new[]
        {
            Ev(1, "loop.fired", "r1", 1000, new { kind = "goal", iterationsDone = 1, maxIterations = 10, armedBy = "arch" }),
            Ev(2, "loop.stopped", "r1", 2000, new { kind = "goal", iterationsDone = 1, maxIterations = 10, armedBy = "arch", reason = "arch", detail = "stopped by arch" }),
        };
        var draft = ArchAgentService.ComposeWakeCore(moved, 0, 2, managed, id => id, Array.Empty<ArchAgentService.AgentView>(), 5000);
        Assert.NotNull(draft);
        Assert.Contains("r1: goal loop fired (1/10) (armed by arch)", draft!.Prompt);
        Assert.Contains("r1: goal loop stopped (1/10) (armed by arch) — stopped by arch", draft.Prompt);
        Assert.True(ArchLoopTools.IsWakeLoopEvent("loop.done"));
        Assert.True(ArchLoopTools.IsWakeLoopEvent("loop.error"));
        Assert.False(ArchLoopTools.IsWakeLoopEvent("loop.armed"));
        Assert.False(ArchLoopTools.IsWakeLoopEvent("turn.ended"));
    }

    // ---- the MCP catalogue --------------------------------------------------------------------

    [Fact]
    public void Mcp_catalogue_offers_the_four_loop_tools_with_the_panels_parameters()
    {
        var tools = ArchMcpServer.ToolsList();
        string[] Req(string name) => tools.First(t => t!["name"]!.GetValue<string>() == name)!["inputSchema"]!["required"]?.AsArray().Select(n => n!.GetValue<string>()).ToArray() ?? Array.Empty<string>();
        IEnumerable<string> Props(string name) => tools.First(t => t!["name"]!.GetValue<string>() == name)!["inputSchema"]!["properties"]!.AsObject().Select(kv => kv.Key);
        Assert.Empty(Req("list_loops"));
        Assert.Equal(new[] { "repoId", "kind" }, Req("start_loop"));
        Assert.Equal(new[] { "repoId" }, Req("update_loop"));
        Assert.Equal(new[] { "repoId" }, Req("stop_loop"));
        foreach (var p in new[] { "machine", "kind", "mode", "goal", "recipe", "prompt", "sentinel", "maxIterations", "tabId", "verifyEnabled", "includeFooterClauses", "operatorAsked" })
            Assert.Contains(p, Props("start_loop"));
        Assert.Contains("rearm", Props("update_loop"));
        Assert.Contains("loopId", Props("stop_loop"));
        Assert.Contains("no-peer-api", tools.First(t => t!["name"]!.GetValue<string>() == "start_loop")!["description"]!.GetValue<string>());
    }

    [Fact]
    public void Role_prompt_teaches_loops_only_on_the_operators_ask()
    {
        var role = ArchAgentService.RolePrompt();
        Assert.Contains("## Loops on repo agents", role);
        foreach (var t in new[] { "list_loops", "start_loop", "update_loop", "stop_loop" }) Assert.Contains(t, role);
        Assert.Contains("only when the Operator asks", role);
        Assert.Contains("never start a loop on your own", role);
        Assert.Contains("no-peer-api", role);
    }
}
