using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// A transcript with crash-padding (a run of NUL bytes left by a writer killed
/// mid-append) must not freeze reads at the corruption point: messages, tool
/// calls and session metadata after the bad region must all still surface.
/// Regression coverage for the 2026-08-20 "conversation rendered 13 days old"
/// incident: GetMessages aborted on the first unparseable line while the CLI
/// kept appending valid turns after it.
/// </summary>
public sealed class SessionTranscriptResilienceTests : IDisposable
{
    private readonly string _workingDir;
    private readonly string _projectsDir;
    private readonly string _sessionId;
    private readonly SessionService _service;

    public SessionTranscriptResilienceTests()
    {
        // A unique fake cwd maps to a unique (throwaway) folder under the real
        // ~/.claude/projects — SessionService resolves the path statically.
        _workingDir = @"C:\cwtest-nul-" + Guid.NewGuid().ToString("N");
        _projectsDir = SessionService.ProjectsDirectoryFor(_workingDir);
        Directory.CreateDirectory(_projectsDir);
        _sessionId = Guid.NewGuid().ToString();
        _service = new SessionService(new Logger());

        var nulRun = new string('\0', 64);
        var lines = new[]
        {
            """{"type":"user","sessionId":"SID","timestamp":"2026-08-07T10:00:00Z","message":{"role":"user","content":"hello"}}""",
            """{"type":"assistant","timestamp":"2026-08-07T10:00:05Z","message":{"role":"assistant","content":[{"type":"text","text":"world"},{"type":"tool_use","id":"tu1","name":"Bash","input":{"command":"ls"}}]}}""",
            nulRun, // pure crash-padding line
            nulRun + """{"type":"user","timestamp":"2026-08-07T11:11:59Z","message":{"role":"user","content":"after the gap"}}""", // padding merged with a real line
            """{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","content":"ok"}]}}""",
            """{"type":"user","broken json""", // plain malformed line
            """{"type":"assistant","timestamp":"2026-08-07T11:12:10Z","message":{"role":"assistant","content":[{"type":"text","text":"final"}]}}""",
        };
        File.WriteAllLines(
            Path.Combine(_projectsDir, _sessionId + ".jsonl"),
            lines.Select(l => l.Replace("SID", _sessionId)));
    }

    public void Dispose()
    {
        try { Directory.Delete(_projectsDir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    [Fact]
    public void GetMessages_reads_past_nul_padding_and_malformed_lines()
    {
        var messages = _service.GetMessages(_workingDir, _sessionId);

        Assert.Equal(4, messages.Count);
        Assert.Equal(["hello", "world", "after the gap", "final"], messages.Select(m => m.Text).ToArray());
    }

    [Fact]
    public void GetToolCalls_pairs_result_found_after_the_corruption()
    {
        var calls = _service.GetToolCalls(_workingDir, _sessionId);

        var call = Assert.Single(calls);
        Assert.Equal("tu1", call.Id);
        Assert.Equal("Bash", call.Name);
        Assert.True(call.Ok);
    }

    [Fact]
    public void ListSessions_still_lists_the_corrupted_session_with_full_counts()
    {
        var sessions = _service.ListSessions(_workingDir);

        var session = Assert.Single(sessions);
        Assert.Equal(_sessionId, session.Id);
        // 3 user + 2 assistant parseable lines; corrupt lines skipped, not fatal.
        Assert.Equal(5, session.TurnCount);
        Assert.Equal("hello", session.FirstPrompt);
    }
}
