using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// The arch chat keeps its tool calls and the History lane loads the recent N (openspec
/// arch-chat-tool-calls-history): the tool-call history folded onto the assistant message that
/// answered each turn, in the live step shape, over the same transcript both readers parse; and
/// the recent-N window with its total and truncated flag.
/// </summary>
public sealed class ArchChatToolCallsTests : IDisposable
{
    private readonly string _workingDir;
    private readonly string _projectsDir;
    private readonly string _sessionId;
    private readonly SessionService _service;

    public ArchChatToolCallsTests()
    {
        _workingDir = @"C:\cwtest-archchat-" + Guid.NewGuid().ToString("N");
        _projectsDir = SessionService.ProjectsDirectoryFor(_workingDir);
        Directory.CreateDirectory(_projectsDir);
        _sessionId = Guid.NewGuid().ToString();
        _service = new SessionService(new Logger());
        var lines = new[]
        {
            // Turn 1: the operator asks; two arch calls; the reply.
            """{"type":"user","sessionId":"SID","timestamp":"2026-09-21T10:00:00Z","message":{"role":"user","content":"drive repo a to green"}}""",
            """{"type":"assistant","timestamp":"2026-09-21T10:00:02Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"mcp__arch__list_agents","input":{}}]}}""",
            """{"type":"user","timestamp":"2026-09-21T10:00:03Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":[{"type":"text","text":"{\"ok\":true,\"status\":\"ok\",\"detail\":\"1 agent\"}"}]}]}}""",
            """{"type":"assistant","timestamp":"2026-09-21T10:00:04Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"t2","name":"mcp__arch__send_task","input":{"machine":"self","repoId":"a","text":"make the tests pass"}}]}}""",
            """{"type":"user","timestamp":"2026-09-21T10:00:09Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t2","content":"{\"ok\":true,\"status\":\"sent\",\"detail\":\"queued on a\"}"}]}}""",
            """{"type":"assistant","timestamp":"2026-09-21T10:00:10Z","message":{"role":"assistant","content":[{"type":"text","text":"Sent."}]}}""",
            // Turn 2: a wake prompt; a built-in call fails; the reply.
            """{"type":"user","timestamp":"2026-09-21T10:05:00Z","message":{"role":"user","content":[{"type":"text","text":"[wake] repo a turn ended"}]}}""",
            """{"type":"assistant","timestamp":"2026-09-21T10:05:01Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"t3","name":"Read","input":{"file_path":"C:\\x.txt"}}]}}""",
            """{"type":"user","timestamp":"2026-09-21T10:05:02Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t3","is_error":true,"content":"Read is not allowed"}]}}""",
            """{"type":"assistant","timestamp":"2026-09-21T10:05:03Z","message":{"role":"assistant","content":[{"type":"text","text":"Could not read."}]}}""",
            // Turn 3: a question with no tool calls at all.
            """{"type":"user","timestamp":"2026-09-21T10:06:00Z","message":{"role":"user","content":"thanks"}}""",
            """{"type":"assistant","timestamp":"2026-09-21T10:06:01Z","message":{"role":"assistant","content":[{"type":"text","text":"Welcome."}]}}""",
        };
        File.WriteAllLines(Path.Combine(_projectsDir, _sessionId + ".jsonl"), lines.Select(l => l.Replace("SID", _sessionId)));
    }

    public void Dispose() { try { Directory.Delete(_projectsDir, true); } catch { /* best effort */ } }

    [Fact]
    public void Tool_calls_ride_with_the_assistant_message_that_answered_their_turn_in_the_live_step_shape()
    {
        var messages = _service.GetMessages(_workingDir, _sessionId);
        var records = _service.GetToolCallHistory(_workingDir, _sessionId);
        Assert.Equal(3, records.Count);
        var views = ArchTranscriptViews.AttachToolCalls(messages, records);
        Assert.Equal(messages.Count, views.Count);
        Assert.Equal(messages.Select(m => m.Role), views.Select(v => v.Role));
        Assert.Equal(messages.Select(m => m.Text), views.Select(v => v.Text));

        var replies = views.Where(v => v.Role == "assistant").ToList();
        Assert.Equal(3, replies.Count);
        // Turn 1's reply carries both arch calls, in order, as done steps with input and result.
        var first = replies[0].ToolCalls!;
        Assert.Equal(new[] { "t1", "t2" }, first.Select(s => s.Id));
        Assert.All(first, s => Assert.Equal("tool", s.Kind));
        Assert.Equal("mcp__arch__send_task", first[1].Name);
        Assert.Equal("send_task", first[1].Tool);
        Assert.Equal("done", first[1].Status);
        Assert.True(first[1].Ok);
        Assert.Contains("make the tests pass", first[1].Detail);
        Assert.Contains("queued on a", first[1].Preview);
        Assert.NotNull(first[1].StartedAt);
        Assert.Equal(5000, first[1].DurationMs);
        // Turn 2's reply carries the failed built-in call as an error step; turn 3's reply carries nothing.
        var second = replies[1].ToolCalls!;
        Assert.Single(second);
        Assert.Equal("Read", second[0].Tool);
        Assert.Equal("error", second[0].Status);
        Assert.False(second[0].Ok);
        Assert.Null(replies[2].ToolCalls);
        // User messages never carry calls.
        Assert.All(views.Where(v => v.Role == "user"), v => Assert.Null(v.ToolCalls));
    }

    [Fact]
    public void Calls_before_the_first_message_land_on_the_first_reply_and_a_missing_reply_drops_nothing_else()
    {
        var records = new List<ToolCallRecord>
        {
            new("z1", "mcp__arch__recall", "memory", null, true, "notes", false, 5, null, null, 0, "", null),
            new("a1", "mcp__arch__list_agents", "", null, true, "ok", false, 2, null, null, 1, "hi", null),
        };
        var messages = new List<ChatMessage>
        {
            new("assistant", "boot note"),
            new("user", "hi"),
            new("assistant", "hello", Synthetic: true),
            new("user", "again"),
            new("assistant", "yes"),
        };
        var views = ArchTranscriptViews.AttachToolCalls(messages, records);
        Assert.Equal("z1", Assert.Single(views[0].ToolCalls!).Id);          // turn 0 → the first reply
        Assert.Equal("a1", Assert.Single(views[2].ToolCalls!).Id);          // turn 1 → the reply after "hi", synthetic or not
        Assert.Null(views[4].ToolCalls);                                      // turn 2 had no calls
        Assert.Equal("done", views[0].ToolCalls![0].Status);                 // an unknown result reads as done, not error
    }

    [Fact]
    public void The_history_window_is_the_most_recent_n_with_the_total_and_a_truncated_flag()
    {
        var all = Enumerable.Range(1, 120).ToList();
        var (items, total, truncated) = ArchTranscriptViews.LimitRecent(all, ArchTranscriptViews.DefaultHistoryLimit);
        Assert.Equal(50, ArchTranscriptViews.DefaultHistoryLimit);
        Assert.Equal(50, items.Count);
        Assert.Equal(71, items[0]);
        Assert.Equal(120, items[^1]);
        Assert.Equal(120, total);
        Assert.True(truncated);
        var (every, t2, tr2) = ArchTranscriptViews.LimitRecent(all, 0);
        Assert.Equal(120, every.Count);
        Assert.Equal(120, t2);
        Assert.False(tr2);
        var (few, _, tr3) = ArchTranscriptViews.LimitRecent(all.Take(10).ToList(), 50);
        Assert.Equal(10, few.Count);
        Assert.False(tr3);
        Assert.Equal(120, ArchTranscriptViews.LimitRecent(all, null).Items.Count);
    }
}
