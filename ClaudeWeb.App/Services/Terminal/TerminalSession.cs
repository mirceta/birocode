using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Channels;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Terminal;

/// <summary>
/// One backend-owned PowerShell terminal for one repo (plans/terminal-tab.md).
/// Mirrors the RunSession architecture: the PTY never depends on an HTTP
/// connection, output is buffered for replay, and attached SSE clients are
/// fed through per-subscriber channels. Unlike chat runs there is no seq
/// watermark — every (re)attachment replays the whole surviving buffer into a
/// freshly reset xterm, which is always correct for a terminal.
/// </summary>
public sealed class TerminalSession : IDisposable
{
    // Replay buffer cap: bounds reattach depth, not scrollback (xterm keeps
    // its own). Trimming may cut into an ANSI sequence; xterm tolerates a
    // garbled first line, and trims this deep are rare in practice.
    private const int MaxBufferedBytes = 2 * 1024 * 1024;

    private readonly object _lock = new();
    private readonly List<byte[]> _chunks = new();
    private readonly List<Channel<string>> _subscribers = new();
    private readonly ConPty _pty;
    private readonly Logger _logger;
    private int _bufferedBytes;
    private bool _exited;

    public string RepoId { get; }
    public short Cols { get; private set; }
    public short Rows { get; private set; }
    public bool IsRunning { get { lock (_lock) return !_exited && !_pty.HasExited; } }

    public TerminalSession(string repoId, string workingDirectory, short cols, short rows, Logger logger)
    {
        RepoId = repoId;
        Cols = cols;
        Rows = rows;
        _logger = logger;
        _pty = new ConPty("powershell.exe -NoLogo", workingDirectory, cols, rows);
        _ = Task.Run(ReadLoopAsync);
    }

    /// <summary>Dedicated PTY output pump: byte chunks go into the replay
    /// buffer and out to every attached client. Ends when the shell exits.</summary>
    private async Task ReadLoopAsync()
    {
        var buf = new byte[8192];
        try
        {
            int n;
            while ((n = await _pty.Output.ReadAsync(buf)) > 0)
            {
                var chunk = buf[..n];
                string json = JsonSerializer.Serialize(new { type = "data", data = Convert.ToBase64String(chunk) });
                lock (_lock)
                {
                    _chunks.Add(chunk);
                    _bufferedBytes += chunk.Length;
                    while (_bufferedBytes > MaxBufferedBytes && _chunks.Count > 1)
                    {
                        _bufferedBytes -= _chunks[0].Length;
                        _chunks.RemoveAt(0);
                    }
                    foreach (var ch in _subscribers) ch.Writer.TryWrite(json);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Info($"[TERM] Output pump ended: {ex.Message}");
        }
        MarkExited();
    }

    private void MarkExited()
    {
        lock (_lock)
        {
            if (_exited) return;
            _exited = true;
            var json = JsonSerializer.Serialize(new { type = "exit" });
            foreach (var ch in _subscribers)
            {
                ch.Writer.TryWrite(json);
                ch.Writer.TryComplete();
            }
            _subscribers.Clear();
        }
    }

    /// <summary>Writes raw input (text or escape sequences, client-mapped) to
    /// the PTY. ConPTY expects UTF-8.</summary>
    public async Task WriteAsync(string data)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(data);
        await _pty.Input.WriteAsync(bytes);
        await _pty.Input.FlushAsync();
    }

    public void Resize(short cols, short rows)
    {
        Cols = cols;
        Rows = rows;
        _pty.Resize(cols, rows);
    }

    /// <summary>
    /// One SSE attachment: replays the whole buffer, then streams live output
    /// until the shell exits or the client drops. Snapshot and subscription
    /// happen under one lock so nothing is missed across the boundary.
    /// </summary>
    public async IAsyncEnumerable<string> StreamAsync([EnumeratorCancellation] CancellationToken ct = default)
    {
        string replay;
        Channel<string>? channel = null;
        lock (_lock)
        {
            // Coalesce the replay into one event: cheaper than thousands of
            // tiny SSE lines after a long session.
            var all = new byte[_bufferedBytes];
            var at = 0;
            foreach (var c in _chunks) { c.CopyTo(all, at); at += c.Length; }
            replay = JsonSerializer.Serialize(new { type = "data", data = Convert.ToBase64String(all) });
            if (!_exited)
            {
                channel = Channel.CreateUnbounded<string>();
                _subscribers.Add(channel);
            }
        }

        try
        {
            yield return replay;
            if (channel is null)
            {
                yield return JsonSerializer.Serialize(new { type = "exit" });
                yield break;
            }
            await foreach (var json in channel.Reader.ReadAllAsync(ct))
                yield return json;
        }
        finally
        {
            if (channel is not null)
                lock (_lock) _subscribers.Remove(channel);
        }
    }

    public void Dispose()
    {
        MarkExited();
        _pty.Dispose();
    }
}
