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
/// </summary>
public class Logger
{
    private readonly object _gate = new();
    private readonly string _logFilePath;
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
    }

    public void Log(string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {message}";

        lock (_gate)
        {
            try { File.AppendAllText(_logFilePath, line + Environment.NewLine); }
            catch { /* never let logging crash the app */ }
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
}
