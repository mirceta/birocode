using System.Text;
using System.Threading;

namespace ClaudeWeb.Services.Logging;

/// <summary>
/// Thread-safe logger shared by all modules. Each log line is timestamped,
/// appended to a daily log file, and raised via <see cref="OnLog"/> so the
/// monitoring GUI can display it. Also tracks request/error counts for the
/// GUI status bar.
///
/// Modules log with a category tag, e.g. logger.Info("[CHAT] session started").
/// Use <see cref="CountRequest"/> when handling an inbound API request and
/// <see cref="Error"/> auto-increments the error counter.
///
/// The log file is held open (shared read, so the operator can tail it) rather
/// than opened and closed for every line (openspec: reduce-transcript-io, D5):
/// each open/close is a trip through the file-system filter drivers, and this
/// process writes many lines per second under load. The writer is re-opened
/// after a failed write.
/// </summary>
public class Logger
{
    private readonly object _gate = new();
    private readonly string _logFilePath;
    private StreamWriter? _writer;
    private int _requestCount;
    private int _errorCount;

    /// <summary>Raised on every log line (already timestamped). GUI subscribes.</summary>
    public event Action<string>? OnLog;

    /// <summary>Raised when request/error counts change. GUI subscribes for the status bar.</summary>
    public event Action<int, int>? OnCountsChanged;

    public int RequestCount => Volatile.Read(ref _requestCount);
    public int ErrorCount => Volatile.Read(ref _errorCount);

    public Logger()
    {
        var logDir = Path.Combine(AppContext.BaseDirectory, "logs");
        Directory.CreateDirectory(logDir);
        _logFilePath = Path.Combine(logDir, $"claude-web-{DateTime.Now:yyyy-MM-dd}.log");
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Close();
    }

    public void Log(string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {message}";

        lock (_gate)
        {
            try
            {
                (_writer ??= Open()).WriteLine(line);
            }
            catch
            {
                // Never let logging crash the app: drop the writer and retry once
                // on a fresh handle (the file may have been rotated or locked).
                try { _writer?.Dispose(); } catch { }
                _writer = null;
                try { (_writer = Open()).WriteLine(line); }
                catch { try { _writer?.Dispose(); } catch { } _writer = null; }
            }
        }

        OnLog?.Invoke(line);
    }

    public void Info(string message) => Log(message);

    public void Error(string message)
    {
        Interlocked.Increment(ref _errorCount);
        Log($"ERROR: {message}");
        OnCountsChanged?.Invoke(RequestCount, ErrorCount);
    }

    /// <summary>Increment the inbound-request counter (call once per handled API request).</summary>
    public void CountRequest()
    {
        Interlocked.Increment(ref _requestCount);
        OnCountsChanged?.Invoke(RequestCount, ErrorCount);
    }

    private StreamWriter Open()
    {
        var fs = new FileStream(_logFilePath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete);
        return new StreamWriter(fs, new UTF8Encoding(false)) { AutoFlush = true };
    }

    private void Close()
    {
        lock (_gate)
        {
            try { _writer?.Dispose(); } catch { }
            _writer = null;
        }
    }
}
