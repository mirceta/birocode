using System.Text.Json;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// The three self-service tools of the repo-agent server (openspec repo-agent-harness-tools):
/// harness_help over a docs folder of the test's own (and the embedded fallback), stash_prompt
/// on the agent's own dock tab, arm_my_loop through the shared LoopArmer with the gate, and the
/// MCP catalogue naming all five tools.
/// </summary>
public sealed class RepoAgentHarnessToolsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cw-agent-tools-" + Guid.NewGuid().ToString("N"));

    public RepoAgentHarnessToolsTests() { Directory.CreateDirectory(_dir); }
    public void Dispose() { try { Directory.Delete(_dir, true); } catch { /* best effort */ } }

    private const string UnderstandingDoc = @"# The Understanding-app convention

This is the **canonical, agent-agnostic statement** of the convention.

## What to do

Whenever you explain something non-trivial, also build a small single-page app.

## The four-line contract

1. Build-less & self-contained.
2. Relative URLs only.
3. Overwrite the rolling-latest entry: understanding-app/index.html.
4. Let the harness serve it.

## The Goal app

The twin: goal-app/goal.json.
";

    private const string LoopDoc = @"# The loop-driven-agent convention

You are being driven by an autopilot loop.

## The output contract — two markers

End with LOOP_DONE or NEEDS_HUMAN: <question>.
";

    private string WriteDocs()
    {
        var root = Path.Combine(_dir, "self");
        Directory.CreateDirectory(Path.Combine(root, "docs"));
        File.WriteAllText(Path.Combine(root, "docs", "understanding-app-convention.md"), UnderstandingDoc);
        File.WriteAllText(Path.Combine(root, "docs", "loop-driven-agent-convention.md"), LoopDoc);
        return root;
    }

    private static JsonElement Json(object? o) => JsonSerializer.SerializeToElement(o);

    [Fact]
    public void Knowledge_index_is_the_docs_structure_and_finds_topics_sections_and_questions()
    {
        var topics = HarnessKnowledge.Build(new[] { ("understanding-app-convention.md", UnderstandingDoc), ("loop-driven-agent-convention.md", LoopDoc) });
        Assert.Equal(new[] { "understanding-app-convention", "loop-driven-agent-convention" }, topics.Select(t => t.Id));
        var u = topics[0];
        Assert.Equal("The Understanding-app convention", u.Title);
        Assert.StartsWith("This is the", u.Summary);
        Assert.Equal(new[] { "what-to-do", "the-four-line-contract", "the-goal-app" }, u.Sections.Select(s => s.Slug));
        Assert.StartsWith("## The four-line contract", u.Sections[1].Text);
        Assert.Contains("Relative URLs only", u.Sections[1].Text);
        Assert.DoesNotContain("Goal app", u.Sections[1].Text);

        // By id, by a loose name, by id#section, and by the -convention suffix dropped.
        Assert.Equal("understanding-app-convention", HarnessKnowledge.Lookup(topics, "understanding-app-convention")!.Topic.Id);
        Assert.Equal("understanding-app-convention", HarnessKnowledge.Lookup(topics, "understanding app")!.Topic.Id);
        Assert.Equal("loop-driven-agent-convention", HarnessKnowledge.Lookup(topics, "loop-driven-agent")!.Topic.Id);
        var sec = HarnessKnowledge.Lookup(topics, "understanding-app-convention#the-four-line-contract")!;
        Assert.Equal("the-four-line-contract", sec.Section!.Slug);
        Assert.StartsWith("## The four-line contract", sec.Text);
        Assert.Null(HarnessKnowledge.Lookup(topics, "no-such-topic"));

        // A question finds the doc; a question naming a section finds the section.
        Assert.Equal("understanding-app-convention", HarnessKnowledge.Search(topics, "how do I update the understanding app")!.Topic.Id);
        Assert.Equal("loop-driven-agent-convention", HarnessKnowledge.Search(topics, "what markers must a loop-driven agent end with")!.Topic.Id);
        var contract = HarnessKnowledge.Search(topics, "the four-line contract of the understanding app")!;
        Assert.Equal("the-four-line-contract", contract.Section?.Slug);
        Assert.Null(HarnessKnowledge.Search(topics, "zzz qqq"));
    }

    [Fact]
    public void Knowledge_reads_the_live_docs_folder_and_falls_back_to_the_embedded_copy()
    {
        var root = WriteDocs();
        var live = new HarnessKnowledge(() => root).Load();
        Assert.Equal(HarnessKnowledge.SourceLive, live.Source);
        Assert.Equal(Path.Combine(root, "docs"), live.Folder);
        Assert.Equal(2, live.Topics.Count);
        // A doc added later is a topic on the next load — nothing to register.
        File.WriteAllText(Path.Combine(root, "docs", "new-feature.md"), "# New feature\n\nJust landed.\n");
        Assert.Contains("new-feature", new HarnessKnowledge(() => root).Load().Topics.Select(t => t.Id));

        var embedded = new HarnessKnowledge(() => null).Load();
        Assert.Equal(HarnessKnowledge.SourceEmbedded, embedded.Source);
        Assert.Contains("understanding-app-convention", embedded.Topics.Select(t => t.Id));
        Assert.Contains("agents", embedded.Topics.Select(t => t.Id));
        Assert.Contains(embedded.Topics, t => t.Id == "understanding-app-convention" && t.Sections.Any(s => s.Slug == "the-four-line-contract"));
    }

    private RepoAgentToolbox Toolbox(RepoAgentEnvironment env)
    {
        var g = new TaskGraphService(new Logger(), Path.Combine(_dir, "graph"));
        return new RepoAgentToolbox(g, (src, repo) => src is null ? "spacex/" + repo : src + "/" + repo, () => 100) { Environment = env };
    }

    private static RepoFacts? Prg(string id) => id == "r-prg" ? new RepoFacts("r-prg", "prg", @"C:\repos\prg", "prg") : null;

    [Fact]
    public void Harness_help_answers_for_this_repo_from_the_live_docs()
    {
        var root = WriteDocs();
        var tb = Toolbox(new RepoAgentEnvironment { Repo = Prg, Knowledge = new HarnessKnowledge(() => root) });

        var index = tb.HarnessHelp("r-prg", null, null);
        Assert.True(index.Ok);
        Assert.Equal("index", index.Status);
        var ij = Json(index.Data);
        Assert.Equal("live", ij.GetProperty("source").GetString());
        Assert.Equal(2, ij.GetProperty("topics").GetArrayLength());
        var uTopic = ij.GetProperty("topics").EnumerateArray().First(t => t.GetProperty("id").GetString() == "understanding-app-convention");
        Assert.Contains("understanding-app-convention#the-four-line-contract", uTopic.GetProperty("sections").EnumerateArray().Select(s => s.GetString()));

        var q = tb.HarnessHelp("r-prg", null, "how do I update the understanding app");
        Assert.True(q.Ok);
        Assert.Equal("found", q.Status);
        var qj = Json(q.Data);
        Assert.Equal("understanding-app-convention.md", qj.GetProperty("file").GetString());
        var text = qj.GetProperty("text").GetString()!;
        Assert.StartsWith("[for this repo — prg at C:\\repos\\prg]", text);
        Assert.Contains(@"C:\repos\prg\understanding-app\index.html", text);
        Assert.Contains("/api/localview/r-prg/app/understanding/", text);
        Assert.Contains("## The four-line contract", text);
        Assert.Equal("/api/localview/r-prg/app/understanding/", qj.GetProperty("forThisRepo").GetProperty("understandingApp").GetProperty("servedAt").GetString());

        var sec = tb.HarnessHelp("r-prg", "understanding-app-convention#the-goal-app", null);
        Assert.Equal("the-goal-app", Json(sec.Data).GetProperty("section").GetString());
        Assert.Contains("goal-app/goal.json", Json(sec.Data).GetProperty("text").GetString());

        var miss = tb.HarnessHelp("r-prg", "nothing-like-this", null);
        Assert.False(miss.Ok);
        Assert.Equal("not-found", miss.Status);
        Assert.Contains("understanding-app-convention", miss.Detail);

        var none = Toolbox(new RepoAgentEnvironment { Repo = Prg }).HarnessHelp("r-prg", null, null);
        Assert.Equal("unavailable", none.Status);
    }

    [Fact]
    public void Stash_prompt_queues_on_the_agents_own_tab_and_first_puts_it_at_the_head()
    {
        var dock = new DockRegistry(new Logger(), Path.Combine(_dir, "dock"));
        var other = dock.Add("r-other", "other");
        var tab = dock.Add("r-prg", "prg", sessionId: "sess-running");
        var older = dock.Add("r-prg", "prg-2", sessionId: "sess-old");
        var env = new RepoAgentEnvironment { Repo = Prg, Dock = dock, RunningSession = id => id == "r-prg" ? "sess-running" : null };
        var tb = Toolbox(env);

        Assert.Equal(tab.Id, tb.OwnTab("r-prg")!.Id);   // the tab of the running session wins over the newer one

        var a = tb.StashPrompt("r-prg", "Task 1 of 3: the settings tab");
        Assert.True(a.Ok);
        Assert.Equal("stashed", a.Status);
        var aj = Json(a.Data);
        Assert.Equal(1, aj.GetProperty("position").GetInt32());
        Assert.Equal(1, aj.GetProperty("count").GetInt32());
        Assert.Equal(tab.Id, aj.GetProperty("tabId").GetString());

        var b = tb.StashPrompt("r-prg", "Task 2 of 3: the tests");
        Assert.Equal(2, Json(b.Data).GetProperty("position").GetInt32());
        var c = tb.StashPrompt("r-prg", "Task 0: read the brief first", first: true);
        Assert.Equal(1, Json(c.Data).GetProperty("position").GetInt32());
        Assert.Equal(3, Json(c.Data).GetProperty("count").GetInt32());
        var queue = dock.GetStash(tab.Id)!;
        Assert.Equal(new[] { "Task 0: read the brief first", "Task 1 of 3: the settings tab", "Task 2 of 3: the tests" }, queue.Select(s => s.Text));
        Assert.Empty(dock.GetStash(other.Id)!);
        Assert.Empty(dock.GetStash(older.Id)!);

        Assert.Equal("error", tb.StashPrompt("r-prg", "  ").Status);
        Assert.Equal("no-tab", tb.StashPrompt("r-none", "x").Status);
        Assert.Equal("error", tb.StashPrompt(null, "x").Status);
    }

    private (RepoAgentToolbox Tools, LoopConfigStore Loops, DockRegistry Dock, List<string> Audit, Func<bool> Gate) LoopRig(bool gateOpen)
    {
        var loops = new LoopConfigStore(new Logger(), Path.Combine(_dir, "loops"));
        var dock = new DockRegistry(new Logger(), Path.Combine(_dir, "dock2"));
        var audit = new List<string>();
        var gate = gateOpen;
        var armer = new LoopArmer(loops, () => false, dock.GetStash, id => LoopArmer.ResolveQueueTab(dock, id), _ => null);
        var env = new RepoAgentEnvironment
        {
            Repo = Prg, Dock = dock, Loops = loops, Armer = armer, GateOpen = () => gate, Machine = "spacex",
            NewestSession = _ => "sess-newest",
            Audit = (tool, repoId, name, outcome) => audit.Add($"{tool} {repoId} {outcome}"),
        };
        return (Toolbox(env), loops, dock, audit, () => gate);
    }

    [Fact]
    public void Arm_my_loop_is_refused_while_the_gate_is_closed_and_status_still_answers()
    {
        var (tb, loops, _, audit, _) = LoopRig(gateOpen: false);
        var r = tb.ArmMyLoop("r-prg", "start", new ArchLoopTools.LoopParams(Goal: "all queue items done"));
        Assert.False(r.Ok);
        Assert.Equal("not-accepting", r.Status);
        Assert.Contains("nothing was changed", r.Detail);
        Assert.Null(loops.Get("r-prg"));
        Assert.Equal(new[] { "arm_my_loop r-prg gate-closed" }, audit);
        var st = tb.ArmMyLoop("r-prg", "status", new ArchLoopTools.LoopParams());
        Assert.True(st.Ok);
        Assert.Equal("no-loop", st.Status);
        Assert.False(Json(st.Data).GetProperty("gateOpen").GetBoolean());
    }

    [Fact]
    public void Arm_my_loop_arms_a_goal_loop_by_agent_pinned_to_its_session_then_updates_and_stops_it()
    {
        var (tb, loops, _, audit, _) = LoopRig(gateOpen: true);
        var r = tb.ArmMyLoop("r-prg", null, new ArchLoopTools.LoopParams(Goal: "all queue items done", MaxIterations: 5));
        Assert.True(r.Ok);
        Assert.Equal("armed", r.Status);
        Assert.Contains("goal loop armed on prg (drive, cap 5)", r.Detail);
        Assert.Contains("armed by agent", r.Detail);
        Assert.Contains("harness_help topic loop-driven-agent-convention", r.Detail);
        var s = loops.Get("r-prg")!;
        Assert.Equal(LoopConfigStore.KindGoal, s.Kind);
        Assert.Equal(LoopConfigStore.ArmedByAgent, s.ArmedBy);
        Assert.Equal(5, s.MaxIterations);
        Assert.Equal("sess-newest", s.SessionId);
        Assert.True(s.Active);
        var view = Json(r.Data);
        Assert.Equal("agent", view.GetProperty("createdBy").GetString());
        Assert.Equal("armed", view.GetProperty("state").GetString());
        Assert.Equal("r-prg", view.GetProperty("loopId").GetString());
        Assert.Contains(audit, a => a.StartsWith("arm_my_loop r-prg start · goal"));

        var st = tb.ArmMyLoop("r-prg", "status", new ArchLoopTools.LoopParams());
        Assert.Equal("armed", st.Status);
        Assert.Contains("armed by agent", st.Detail);

        var up = tb.ArmMyLoop("r-prg", "update", new ArchLoopTools.LoopParams(MaxIterations: 9));
        Assert.True(up.Ok);
        Assert.Equal("updated", up.Status);
        Assert.Equal(9, loops.Get("r-prg")!.MaxIterations);

        var bad = tb.ArmMyLoop("r-prg", "start", new ArchLoopTools.LoopParams(Kind: "goal", MaxIterations: 500));
        Assert.False(bad.Ok);
        Assert.Contains("maxIterations must be 1–100", bad.Detail);
        Assert.Equal(9, loops.Get("r-prg")!.MaxIterations);   // nothing was changed

        var stop = tb.ArmMyLoop("r-prg", "stop", new ArchLoopTools.LoopParams());
        Assert.True(stop.Ok);
        Assert.Equal("stopped", stop.Status);
        Assert.False(loops.Get("r-prg")!.Active);
        Assert.Equal("agent", loops.Get("r-prg")!.StopReason);
        Assert.Equal("already-stopped", tb.ArmMyLoop("r-prg", "stop", new ArchLoopTools.LoopParams()).Status);
        Assert.Equal("error", tb.ArmMyLoop("r-prg", "dance", new ArchLoopTools.LoopParams()).Status);
    }

    [Fact]
    public void Arm_my_loop_queue_kind_drains_the_agents_own_stash_and_refuses_an_empty_one()
    {
        var (tb, loops, dock, _, _) = LoopRig(gateOpen: true);
        var tab = dock.Add("r-prg", "prg", sessionId: "sess-1");
        var empty = tb.ArmMyLoop("r-prg", "start", new ArchLoopTools.LoopParams(Kind: "queue"));
        Assert.False(empty.Ok);
        Assert.Contains("queue", empty.Detail);
        Assert.Null(loops.Get("r-prg"));

        tb.StashPrompt("r-prg", "Task 1");
        tb.StashPrompt("r-prg", "Task 2");
        var r = tb.ArmMyLoop("r-prg", "start", new ArchLoopTools.LoopParams(Kind: "queue", MaxIterations: 10));
        Assert.True(r.Ok);
        var s = loops.Get("r-prg")!;
        Assert.Equal(LoopConfigStore.KindQueue, s.Kind);
        Assert.Equal(tab.Id, s.QueueTabId);
        Assert.Equal("sess-1", s.SessionId);   // pinned to the tab's session
        Assert.Equal(2, Json(r.Data).GetProperty("queue").GetProperty("remaining").GetInt32());
    }

    [Fact]
    public void The_server_lists_five_tools_and_dispatches_the_new_ones()
    {
        var names = RepoAgentMcpServer.ToolsList().Select(t => t!["name"]!.GetValue<string>()).ToList();
        Assert.Equal(new[] { "my_effort", "report_leg", "harness_help", "stash_prompt", "arm_my_loop", "hub_upload", "hub_download", "hub_files", "my_local_apps" }, names);   // + the hub file system (openspec hub-file-system)
        foreach (var t in RepoAgentMcpServer.ToolsList())
        {
            Assert.False(string.IsNullOrWhiteSpace(t!["description"]!.GetValue<string>()));
            Assert.Equal("object", t["inputSchema"]!["type"]!.GetValue<string>());
        }
        var arm = RepoAgentMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "arm_my_loop")!;
        Assert.Equal("integer", arm["inputSchema"]!["properties"]!["maxIterations"]!["type"]!.GetValue<string>());
        Assert.Null(arm["inputSchema"]!["required"]);   // nothing required: action defaults to start
        var stash = RepoAgentMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "stash_prompt")!;
        Assert.Equal("text", stash["inputSchema"]!["required"]![0]!.GetValue<string>());

        var (tb, _, _, _, _) = LoopRig(gateOpen: true);
        var server = new RepoAgentMcpServer(tb);
        var init = server.Handle(JsonNode.Parse("""{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"""), "r-prg");
        Assert.Contains("harness_help", init.Body!["result"]!["instructions"]!.GetValue<string>());
        var call = server.Handle(JsonNode.Parse("""{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"arm_my_loop","arguments":{"action":"start","goal":"ship it","maxIterations":3,"mode":"suggest"}}}"""), "r-prg");
        var text = call.Body!["result"]!["content"]![0]!["text"]!.GetValue<string>();
        var outcome = JsonDocument.Parse(text).RootElement;
        Assert.True(outcome.GetProperty("ok").GetBoolean());
        Assert.Equal("armed", outcome.GetProperty("status").GetString());
        Assert.Equal("suggest", outcome.GetProperty("data").GetProperty("mode").GetString());
        Assert.Equal(3, outcome.GetProperty("data").GetProperty("cap").GetInt32());
        var help = server.Handle(JsonNode.Parse("""{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"harness_help","arguments":{}}}"""), "r-prg");
        Assert.Contains("unavailable", help.Body!["result"]!["content"]![0]!["text"]!.GetValue<string>());
    }
}
