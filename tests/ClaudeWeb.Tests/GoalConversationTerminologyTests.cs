using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>The Operator's terminology decision (openspec repo-agent-subagents): "subagent" is a Claude
/// Code word (its built-in Agent tool), so the harness calls ours GOAL CONVERSATIONS everywhere an
/// agent reads. The ONLY place the word "subagent" may appear in what a repo agent is told is the
/// explicit disclaimer that a goal conversation is NOT Claude Code's built-in subagent.</summary>
public sealed class GoalConversationTerminologyTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-gcterm-" + Guid.NewGuid().ToString("N"));
    public GoalConversationTerminologyTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    // "built-in subagent" is the disclaimer itself; anything else is the clash the Operator ruled out.
    private static readonly Regex Clash = new(@"subagent", RegexOptions.IgnoreCase);
    private static int ClashesOutsideDisclaimer(string text) =>
        Clash.Matches(text).Count(m => !text.Substring(Math.Max(0, m.Index - 9), Math.Min(m.Index, 9)).EndsWith("built-in ", StringComparison.Ordinal));

    [Fact]
    public void No_repo_agent_tool_is_named_subagent_and_the_goal_conversation_tools_exist()
    {
        var names = RepoAgentMcpServer.ToolsList().Select(t => t!["name"]!.GetValue<string>()).ToList();
        Assert.DoesNotContain(names, n => n.Contains("subagent", StringComparison.OrdinalIgnoreCase));
        foreach (var n in new[] { "start_goal_conversation", "list_goal_conversations", "stop_goal_conversation", "message_goal_conversation", "mark_step", "edit_goal_plan" })
            Assert.Contains(n, names);
    }

    [Fact]
    public void Tool_descriptions_say_goal_conversation_and_mention_subagent_only_to_rule_out_the_builtin()
    {
        foreach (var t in RepoAgentMcpServer.ToolsList())
        {
            var desc = t!["description"]!.GetValue<string>() + " " + t["inputSchema"]!.ToJsonString();
            Assert.True(ClashesOutsideDisclaimer(desc) == 0, $"{t["name"]}: says \"subagent\" outside the built-in disclaimer");
        }
        var start = RepoAgentMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "start_goal_conversation")!["description"]!.GetValue<string>();
        Assert.Contains("GOAL CONVERSATION", start);
        Assert.Contains("not Claude Code's built-in subagent", start);
    }

    [Fact]
    public void The_instructions_name_goal_conversations_and_rule_out_the_builtin_subagent_tool()
    {
        var server = new RepoAgentMcpServer(new RepoAgentToolbox(new TaskGraphService(new Logger(), _dir)));
        var text = server.Handle(JsonNode.Parse("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}"), "repo1").Body!["result"]!["instructions"]!.GetValue<string>();
        Assert.Contains("GOAL CONVERSATIONS", text);
        Assert.Contains("when the Operator asks for a \"goal conversation\", this is it", text);
        Assert.Contains("NOT Claude Code's built-in subagent", text);
        Assert.Contains("never use that for this", text);
        Assert.Equal(0, ClashesOutsideDisclaimer(text));
    }

    [Fact]
    public void What_a_goal_conversation_and_its_parent_read_never_says_subagent()
    {
        var repo = new RepositoryRegistry.RepositoryInfo("repo1", "prg", @"C:\x\prg", true, true, false, "advanced", null, Array.Empty<RepositoryRegistry.LocalAppInfo>(), "prg");
        foreach (var (ro, conc) in new[] { (false, false), (true, false), (false, true) })
        {
            var s = new RepoSubagentStore.Subagent("deadbeef", "repo1", "n", "Do it.", "running", 1, null, "agent", null, null, null, null, 10, ro, null, "main",
                Array.Empty<ArchGoalPlans.Step>(), false, Array.Empty<RepoSubagentStore.QueuedMessage>(), false, null, null, null, Concurrent: conc);
            Assert.Equal(0, ClashesOutsideDisclaimer(RepoSubagentService.LoopGoalText(s, repo, "main")));
        }
        Assert.Equal("goal-conversation", RepoSubagentService.ActorSubagent);
        Assert.Equal("repo1~goal~deadbeef", RepoSubagentKeys.Key("repo1", "deadbeef"));
    }

    [Fact]
    public void The_routes_and_the_data_file_are_named_goal_conversations_with_no_spaces()
    {
        // The rename once turned "api/subagents" into "api/goal conversations" (a space) and every call 404'd —
        // the loop-eval caught it; this pins the names.
        string Route(Type t, string? method = null)
        {
            if (method is null) return ((Microsoft.AspNetCore.Mvc.RouteAttribute)Attribute.GetCustomAttribute(t, typeof(Microsoft.AspNetCore.Mvc.RouteAttribute))!).Template;
            var m = t.GetMethod(method)!;
            return ((Microsoft.AspNetCore.Mvc.HttpGetAttribute)Attribute.GetCustomAttribute(m, typeof(Microsoft.AspNetCore.Mvc.HttpGetAttribute))!).Template!;
        }
        Assert.Equal("api/goal-conversations", Route(typeof(ClaudeWeb.Controllers.SubagentsController)));
        Assert.Equal("fleet/goal-conversations", Route(typeof(ClaudeWeb.Controllers.ArchController), "FleetSubagents"));
        var store = new RepoSubagentStore(new Logger(), _dir);
        Assert.EndsWith("goal-conversations.json", store.FilePath);
    }

    [Fact]
    public void A_goal_conversation_started_before_the_rename_survives_the_upgrade()
    {
        // An older build wrote subagents.json and keyed the loop <repo>~sub~<id>; both carry over.
        File.WriteAllText(Path.Combine(_dir, "subagents.json"), "{\"Subagents\":[{\"Id\":\"367147d9\",\"RepoId\":\"repo1\",\"Name\":\"n\",\"Goal\":\"g\",\"State\":\"running\"}]}");
        File.WriteAllText(Path.Combine(_dir, "loops.json"), "{\"Loops\":{\"repo1~sub~367147d9\":{\"Kind\":\"goal\",\"Goal\":\"g\",\"Mode\":\"drive\"}}}");

        var store = new RepoSubagentStore(new Logger(), _dir);
        Assert.Equal("running", store.Find("367147d9")?.State);
        Assert.False(File.Exists(Path.Combine(_dir, "subagents.json")));

        var loops = new LoopConfigStore(new Logger(), _dir);
        Assert.NotNull(loops.Get("repo1~goal~367147d9"));
        Assert.Null(loops.Get("repo1~sub~367147d9"));
        Assert.DoesNotContain("~sub~", File.ReadAllText(Path.Combine(_dir, "loops.json")));
    }

    [Fact]
    public void The_convention_doc_is_the_goal_conversations_topic_and_rules_out_the_builtin()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "ClaudeWeb.sln"))) dir = dir.Parent;
        var doc = Path.Combine(dir!.FullName, "docs", "goal-conversations-convention.md");
        Assert.True(File.Exists(doc));
        Assert.False(File.Exists(Path.Combine(dir.FullName, "docs", "repo-agent-subagents-convention.md")));
        var text = File.ReadAllText(doc);
        Assert.Contains("# Goal conversations", text);
        Assert.Contains("built-in", text);
    }
}
