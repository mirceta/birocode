using System.Text;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Incremental transcript reads (openspec: reduce-transcript-io, D1): an
/// unchanged file costs no parse, an appended file parses only its tail, a
/// half-written trailing line is not consumed until its newline lands, and a
/// shrunk or rewritten file starts over. The 2026-09-02/03 host bugchecks were
/// traced to the pre-change behaviour (a 249 MB transcript re-read every 5 s).
/// </summary>
public sealed class TranscriptCacheTests : IDisposable
{
    private readonly string _workingDir;
    private readonly string _projectsDir;
    private readonly string _sessionId;
    private readonly string _path;
    private readonly SessionService _service;

    public TranscriptCacheTests()
    {
        _workingDir = @"C:\cwtest-cache-" + Guid.NewGuid().ToString("N");
        _projectsDir = SessionService.ProjectsDirectoryFor(_workingDir);
        Directory.CreateDirectory(_projectsDir);
        _sessionId = Guid.NewGuid().ToString();
        _path = Path.Combine(_projectsDir, _sessionId + ".jsonl");
        _service = new SessionService(new Logger());
    }

    public void Dispose()
    {
        try { Directory.Delete(_projectsDir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    private static string User(string text, string ts = "2026-09-03T10:00:00Z") =>
        $$$"""{"type":"user","timestamp":"{{{ts}}}","message":{"role":"user","content":"{{{text}}}"}}""";

    private static string Assistant(string text, string ts = "2026-09-03T10:00:05Z") =>
        $$$"""{"type":"assistant","timestamp":"{{{ts}}}","message":{"role":"assistant","content":[{"type":"text","text":"{{{text}}}"}]}}""";

    private void Append(string raw)
    {
        // Share-friendly append, like the CLI's appendFileSync: open, write, close.
        using var fs = new FileStream(_path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete);
        var bytes = Encoding.UTF8.GetBytes(raw);
        fs.Write(bytes, 0, bytes.Length);
    }

    [Fact]
    public void Unchanged_file_is_not_reparsed()
    {
        Append(User("hello") + "\n" + Assistant("world") + "\n");

        var first = _service.GetMessages(_workingDir, _sessionId);
        var parses = _service.MessageParses;
        var bytes = _service.MessageBytesRead;
        var second = _service.GetMessages(_workingDir, _sessionId);

        Assert.Equal(2, first.Count);
        Assert.Equal(first.Select(m => m.Text), second.Select(m => m.Text));
        Assert.Equal(parses, _service.MessageParses);
        Assert.Equal(bytes, _service.MessageBytesRead);
    }

    [Fact]
    public void Appended_lines_are_parsed_as_a_delta_only()
    {
        Append(User("hello") + "\n" + Assistant("world") + "\n");
        _service.GetMessages(_workingDir, _sessionId);
        var bytesAfterFull = _service.MessageBytesRead;

        var tail = User("more", "2026-09-03T10:01:00Z") + "\n";
        Append(tail);
        var msgs = _service.GetMessages(_workingDir, _sessionId);

        Assert.Equal(["hello", "world", "more"], msgs.Select(m => m.Text).ToArray());
        // The delta read must be about the size of the tail — never the whole file
        // again (a bit more is allowed for the rewrite-detection tail fingerprint).
        var delta = _service.MessageBytesRead - bytesAfterFull;
        Assert.InRange(delta, tail.Length, tail.Length + 64);
    }

    [Fact]
    public void Partial_trailing_line_waits_for_its_newline()
    {
        Append(User("hello") + "\n");
        var half = Assistant("in progress");
        Append(half[..(half.Length / 2)]);

        var during = _service.GetMessages(_workingDir, _sessionId);
        Assert.Equal(["hello"], during.Select(m => m.Text).ToArray());

        Append(half[(half.Length / 2)..] + "\n");
        var after = _service.GetMessages(_workingDir, _sessionId);
        Assert.Equal(["hello", "in progress"], after.Select(m => m.Text).ToArray());
    }

    [Fact]
    public void Shrunk_file_is_reparsed_from_the_start()
    {
        Append(User("one") + "\n" + Assistant("two") + "\n" + User("three") + "\n");
        Assert.Equal(3, _service.GetMessages(_workingDir, _sessionId).Count);

        File.WriteAllText(_path, User("fresh") + "\n");
        var msgs = _service.GetMessages(_workingDir, _sessionId);

        Assert.Equal(["fresh"], msgs.Select(m => m.Text).ToArray());
    }

    [Fact]
    public void Rewritten_file_of_the_same_length_is_reparsed()
    {
        Append(User("aaaa") + "\n");
        Assert.Equal(["aaaa"], _service.GetMessages(_workingDir, _sessionId).Select(m => m.Text).ToArray());

        // Same byte length, different content, later write time (an in-place repair).
        Thread.Sleep(20);
        File.WriteAllText(_path, User("bbbb") + "\n");
        File.SetLastWriteTimeUtc(_path, DateTime.UtcNow.AddSeconds(1));
        var msgs = _service.GetMessages(_workingDir, _sessionId);

        Assert.Equal(["bbbb"], msgs.Select(m => m.Text).ToArray());
    }

    [Fact]
    public void Late_tool_result_pairs_with_an_earlier_tool_use_across_an_append()
    {
        Append("""{"type":"assistant","timestamp":"2026-09-03T10:00:05Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu1","name":"Bash","input":{"command":"ls"}}]}}""" + "\n");
        var pending = _service.GetToolCalls(_workingDir, _sessionId);
        Assert.Single(pending);
        Assert.Null(pending[0].Ok);

        Append("""{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","content":"ok"}]}}""" + "\n");
        var done = _service.GetToolCalls(_workingDir, _sessionId);

        Assert.Single(done);
        Assert.True(done[0].Ok);
        Assert.Equal("ok", done[0].Preview);

        var history = _service.GetToolCallHistory(_workingDir, _sessionId);
        Assert.Single(history);
        Assert.Equal("ok", history[0].Result);
    }

    [Fact]
    public void Activity_digest_reads_the_newest_assistant_line_and_user_time()
    {
        Append(User("do it", "2026-09-03T10:00:00Z") + "\n"
            + Assistant("working   on\\nit", "2026-09-03T10:00:05Z") + "\n"
            + User("and more", "2026-09-03T10:02:00Z") + "\n");

        var a = _service.GetActivity(_workingDir, _sessionId);

        Assert.NotNull(a);
        Assert.Equal("working on it", a!.Activity);
        Assert.Equal(3, a.Count);
        Assert.Equal(new DateTime(2026, 9, 3, 10, 2, 0, DateTimeKind.Utc), a.LastUserAt!.Value.ToUniversalTime());
    }

    [Fact]
    public void Missing_transcript_reads_as_empty_and_null_activity()
    {
        Assert.Empty(_service.GetMessages(_workingDir, _sessionId));
        Assert.Null(_service.GetActivity(_workingDir, _sessionId));
    }

    [Fact]
    public void Session_list_metadata_is_cached_by_length_and_mtime()
    {
        Append(User("first prompt") + "\n" + Assistant("reply") + "\n");
        var l1 = _service.ListSessions(_workingDir);
        Assert.Single(l1);
        Assert.Equal(2, l1[0].TurnCount);

        Append(User("second", "2026-09-03T11:00:00Z") + "\n");
        var l2 = _service.ListSessions(_workingDir);
        Assert.Single(l2);
        Assert.Equal(3, l2[0].TurnCount);
    }
}
