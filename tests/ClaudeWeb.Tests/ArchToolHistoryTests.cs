using System.Text.Json;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// The full-fidelity tool-call reader behind the Arch tab's History lane
/// (openspec: add-arch-tool-history, task 3.1): complete input, full result,
/// ok flag, both timestamps, and the user turn each call belongs to — with the
/// same resilience as the step-shaped reader.
/// </summary>
public sealed class ArchToolHistoryTests : IDisposable
{
    private readonly string _workingDir;
    private readonly string _projectsDir;
    private readonly string _sessionId;
    private readonly SessionService _service;

    public ArchToolHistoryTests()
    {
        _workingDir = @"C:\cwtest-archhist-" + Guid.NewGuid().ToString("N");
        _projectsDir = SessionService.ProjectsDirectoryFor(_workingDir);
        Directory.CreateDirectory(_projectsDir);
        _sessionId = Guid.NewGuid().ToString();
        _service = new SessionService(new Logger());

        var longResult = new string('x', 40);
        var lines = new[]
        {
            // Turn 1: the operator asks; the arch lists agents (envelope result) and sends a task.
            """{"type":"user","sessionId":"SID","timestamp":"2026-09-03T10:00:00Z","message":{"role":"user","content":"drive repo a to green"}}""",
            """{"type":"assistant","timestamp":"2026-09-03T10:00:02Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"mcp__arch__list_agents","input":{}}]}}""",
            """{"type":"user","timestamp":"2026-09-03T10:00:03Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":[{"type":"text","text":"{\"ok\":true,\"status\":\"ok\",\"detail\":\"1 agent\",\"data\":[{\"repoId\":\"a\"}]}"}]}]}}""",
            """{"type":"assistant","timestamp":"2026-09-03T10:00:04Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"t2","name":"mcp__arch__send_task","input":{"machine":"self","repoId":"a","text":"make the tests pass\nthen commit","branch":"arch/green"}}]}}""",
            """{"type":"user","broken json""",
            """{"type":"user","timestamp":"2026-09-03T10:00:09Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t2","content":"{\"ok\":true,\"status\":\"sent\",\"detail\":\"queued on a\"}"}]}}""",
            """{"type":"assistant","timestamp":"2026-09-03T10:00:10Z","message":{"role":"assistant","content":[{"type":"text","text":"Sent."}]}}""",
            // Turn 2: a wake prompt; a built-in call fails; a call never gets a result.
            """{"type":"user","timestamp":"2026-09-03T10:05:00Z","message":{"role":"user","content":[{"type":"text","text":"[wake] repo a turn ended"}]}}""",
            """{"type":"assistant","timestamp":"2026-09-03T10:05:01Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"t3","name":"Read","input":{"file_path":"C:\\x.txt"}}]}}""",
            """{"type":"user","timestamp":"2026-09-03T10:05:02Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t3","is_error":true,"content":"Read is not allowed"}]}}""",
            """{"type":"assistant","timestamp":"2026-09-03T10:05:03Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"t4","name":"mcp__arch__recall","input":{"path":"memory/a.md"}}]}}""",
            """{"type":"user","timestamp":"2026-09-03T10:05:04Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t4","content":"LONG"}]}}""".Replace("LONG", longResult),
            """{"type":"assistant","timestamp":"2026-09-03T10:05:05Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"t5","name":"mcp__arch__git_state","input":{"repoId":"a"}}]}}""",
        };
        File.WriteAllLines(Path.Combine(_projectsDir, _sessionId + ".jsonl"), lines.Select(l => l.Replace("SID", _sessionId)));
    }

    public void Dispose()
    {
        try { Directory.Delete(_projectsDir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    [Fact]
    public void History_keeps_full_input_result_ok_timestamps_and_turns()
    {
        var calls = _service.GetToolCallHistory(_workingDir, _sessionId);

        Assert.Equal(["t1", "t2", "t3", "t4", "t5"], calls.Select(c => c.Id).ToArray());

        var send = calls[1];
        Assert.Equal("mcp__arch__send_task", send.Name);
        Assert.Equal("make the tests pass\nthen commit", send.Input!["text"]!.GetValue<string>());
        Assert.Equal("arch/green", send.Input!["branch"]!.GetValue<string>());
        Assert.True(send.Ok);
        Assert.Contains("\"status\":\"sent\"", send.Result);
        Assert.Equal(1, send.Turn);
        Assert.Equal("drive repo a to green", send.TurnPrompt);
        Assert.Equal(new DateTime(2026, 9, 3, 10, 0, 4, DateTimeKind.Utc), send.At!.Value.ToUniversalTime());
        Assert.Equal(new DateTime(2026, 9, 3, 10, 0, 9, DateTimeKind.Utc), send.ResultAt!.Value.ToUniversalTime());

        var list = calls[0];
        Assert.True(list.Ok);
        Assert.Contains("\"detail\":\"1 agent\"", list.Result);
        Assert.Equal(1, list.Turn);

        var read = calls[2];
        Assert.Equal("Read", read.Name);
        Assert.False(read.Ok);
        Assert.Equal("Read is not allowed", read.Result);
        Assert.Equal(2, read.Turn);
        Assert.Equal("[wake] repo a turn ended", read.TurnPrompt);
        Assert.Equal(@"C:\x.txt", read.Summary);

        var pending = calls[4];
        Assert.Null(pending.Ok);
        Assert.Equal("", pending.Result);
        Assert.Null(pending.ResultAt);
        Assert.Equal(2, pending.Turn);
    }

    [Fact]
    public void History_clips_a_long_result_and_says_so()
    {
        var calls = _service.GetToolCallHistory(_workingDir, _sessionId, maxResultChars: 30);
        var recall = calls.Single(c => c.Id == "t4");
        Assert.True(recall.ResultClipped);
        Assert.Equal(30, recall.Result.Length);
        Assert.Equal(40, recall.ResultChars);
        // Short results are untouched.
        Assert.False(calls.Single(c => c.Id == "t3").ResultClipped);
    }

    [Fact]
    public void History_is_empty_for_a_missing_or_unsafe_session()
    {
        Assert.Empty(_service.GetToolCallHistory(_workingDir, Guid.NewGuid().ToString()));
        Assert.Empty(_service.GetToolCallHistory(_workingDir, "..\\escape"));
    }

    [Fact]
    public void Input_survives_a_json_round_trip()
    {
        var calls = _service.GetToolCallHistory(_workingDir, _sessionId);
        var json = JsonSerializer.Serialize(calls.Select(c => new { c.Id, c.Input }));
        using var doc = JsonDocument.Parse(json);
        var send = doc.RootElement.EnumerateArray().Single(e => e.GetProperty("Id").GetString() == "t2");
        Assert.Equal("a", send.GetProperty("Input").GetProperty("repoId").GetString());
    }
}
