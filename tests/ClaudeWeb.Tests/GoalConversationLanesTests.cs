using System.Text.Json;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Chat;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>A goal conversation's History lane (openspec repo-agent-subagents) reads its session's tool
/// calls through the SAME payload builder as the arch's History lane, tagged by server: the harness's
/// own MCP tools vs Claude Code's built-ins.</summary>
public sealed class GoalConversationLanesTests
{
    private static ToolCallRecord Call(string id, string name, int turn, bool? ok = true) =>
        new(id, name, $"{name} summary", null, ok, "result", false, 6, new DateTime(2026, 10, 14, 10, 0, turn, DateTimeKind.Utc),
            new DateTime(2026, 10, 14, 10, 0, turn + 1, DateTimeKind.Utc), turn, $"prompt {turn}", new DateTime(2026, 10, 14, 10, 0, turn, DateTimeKind.Utc));

    private static JsonElement Payload(IReadOnlyList<ToolCallRecord> calls, int? limit = null, string prefix = "mcp__claude-web__", string server = "harness") =>
        JsonSerializer.SerializeToElement(ArchTranscriptViews.ToolCallsPayload("s1", calls, limit, prefix, server,
            Array.Empty<AutopilotAuditLog.Entry>(), "repo1~goal~deadbeef", ArchAgentService.ActorHuman));

    [Fact]
    public void Harness_tools_are_tagged_by_server_and_builtins_stay_builtin()
    {
        var p = Payload(new[] { Call("a", $"mcp__{RepoAgentMcpServer.ServerName}__mark_step", 1), Call("b", "Bash", 1), Call("c", "Read", 2, ok: false) });
        var calls = p.GetProperty("calls").EnumerateArray().ToList();
        Assert.Equal("mark_step", calls[0].GetProperty("tool").GetString());
        Assert.Equal("harness", calls[0].GetProperty("server").GetString());
        Assert.Equal("builtin", calls[1].GetProperty("server").GetString());
        Assert.Equal("Bash", calls[1].GetProperty("tool").GetString());
        Assert.False(calls[2].GetProperty("ok").GetBoolean());
        Assert.Equal(1000, calls[0].GetProperty("durationMs").GetInt64());
        var turns = p.GetProperty("turns").EnumerateArray().ToList();
        Assert.Equal(2, turns.Count);
        Assert.Equal(2, turns[0].GetProperty("calls").GetInt32());
        Assert.Equal("s1", p.GetProperty("sessionId").GetString());
    }

    [Fact]
    public void The_limit_keeps_the_most_recent_calls_and_says_it_truncated()
    {
        var p = Payload(Enumerable.Range(1, 5).Select(i => Call($"c{i}", "Bash", i)).ToList(), limit: 2);
        Assert.Equal(5, p.GetProperty("total").GetInt32());
        Assert.True(p.GetProperty("truncated").GetBoolean());
        Assert.Equal(new[] { "c4", "c5" }, p.GetProperty("calls").EnumerateArray().Select(c => c.GetProperty("id").GetString()).ToArray());
    }

    [Fact]
    public void The_arch_prefix_still_reads_as_the_arch_server()
    {
        var p = Payload(new[] { Call("a", "mcp__arch__send_task", 1) }, prefix: "mcp__arch__", server: "arch");
        var c = p.GetProperty("calls")[0];
        Assert.Equal("send_task", c.GetProperty("tool").GetString());
        Assert.Equal("arch", c.GetProperty("server").GetString());
    }
}
