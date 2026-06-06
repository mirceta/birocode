using System.Text;

namespace ClaudeWeb.Models;

/// <summary>
/// A single chat turn (one CLI invocation), captured for the monitoring GUI.
/// Mutable -- the <see cref="ClaudeWeb.Services.Monitoring.CallLog"/> creates it
/// at the start of a run and updates its fields as the stream-json events
/// translate, raising change events the GUI subscribes to.
///
/// Token counts and the model come from the terminal <c>result</c> event's
/// <c>usage</c> object (it carries all four token counts in one place).
/// </summary>
public class CallRecord
{
    /// <summary>Sequential 1-based call number assigned by the CallLog.</summary>
    public int Number { get; set; }

    public DateTime StartedAt { get; set; }
    /// <summary>When the first visible text delta arrived (for TTFT).</summary>
    public DateTime? FirstTokenAt { get; set; }
    public DateTime? FinishedAt { get; set; }

    /// <summary>"Running" / "Success" / "Error" / "Throttled".</summary>
    public string Status { get; set; } = "Running";

    /// <summary>Model id from system/init or the result usage (e.g. "claude-opus-4-6").</summary>
    public string? Model { get; set; }

    public string SessionId { get; set; } = "";
    public bool Resuming { get; set; }
    public string WorkingDirectory { get; set; } = "";

    /// <summary>The exact (display) command line used to spawn the CLI.</summary>
    public string CommandLine { get; set; } = "";

    /// <summary>The full user prompt.</summary>
    public string Prompt { get; set; } = "";

    /// <summary>Accumulated streamed assistant text.</summary>
    public StringBuilder Output { get; } = new();

    /// <summary>Tool names used, in order (consecutive duplicates collapsed).</summary>
    public List<string> Tools { get; } = new();

    // Token counts (from the result event's usage object).
    public long InputTokens { get; set; }
    public long OutputTokens { get; set; }
    public long CacheReadTokens { get; set; }
    public long CacheCreationTokens { get; set; }

    public double? CostUsd { get; set; }
    public int NumTurns { get; set; }
    public string? StopReason { get; set; }

    public bool WasThrottled { get; set; }

    // Error details (populated only on failure).
    public string? ErrorMessage { get; set; }
    public string? StdErr { get; set; }
    public int? ExitCode { get; set; }

    // --- Computed ---------------------------------------------------------

    public double? DurationSeconds =>
        FinishedAt.HasValue ? (FinishedAt.Value - StartedAt).TotalSeconds : null;

    public double? TtftSeconds =>
        FirstTokenAt.HasValue ? (FirstTokenAt.Value - StartedAt).TotalSeconds : null;

    /// <summary>Output tokens per second over the generation window (first token -> finish).</summary>
    public double? TokensPerSecond
    {
        get
        {
            if (!FirstTokenAt.HasValue || !FinishedAt.HasValue || OutputTokens <= 0) return null;
            var span = (FinishedAt.Value - FirstTokenAt.Value).TotalSeconds;
            return span > 0 ? OutputTokens / span : null;
        }
    }

    public bool HasError =>
        !string.IsNullOrEmpty(ErrorMessage) || Status == "Error";

    /// <summary>Short model name for the list column, e.g. "opus-4-6".</summary>
    public string ModelShort
    {
        get
        {
            if (string.IsNullOrEmpty(Model)) return "";
            var m = Model;
            const string prefix = "claude-";
            if (m.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                m = m[prefix.Length..];
            // Drop a trailing date stamp like "-20250101" if present.
            var dash = m.LastIndexOf('-');
            if (dash > 0 && m[(dash + 1)..].All(char.IsDigit) && m.Length - dash - 1 >= 6)
                m = m[..dash];
            return m;
        }
    }

    public string DurationDisplay =>
        DurationSeconds.HasValue ? $"{DurationSeconds.Value:0.0}s" : (Status == "Running" ? "..." : "-");

    public string TtftDisplay =>
        TtftSeconds.HasValue ? $"{TtftSeconds.Value:0.00}s" : "-";

    public string TokensPerSecondDisplay =>
        TokensPerSecond.HasValue ? $"{TokensPerSecond.Value:0.0} tok/s" : "-";

    /// <summary>Compact token summary for the list column, e.g. "1.5k in / 342 out".</summary>
    public string TokenSummary => $"{Humanize(InputTokens)} in / {Humanize(OutputTokens)} out";

    public string CostDisplay =>
        CostUsd.HasValue ? $"${CostUsd.Value:0.0000}" : "-";

    /// <summary>First ~60 chars of the prompt, single-line, for the list column.</summary>
    public string PromptPreview
    {
        get
        {
            var p = Prompt.Replace("\r", " ").Replace("\n", " ").Trim();
            return p.Length > 60 ? p[..60] + "..." : p;
        }
    }

    private static string Humanize(long n) =>
        n >= 1000 ? $"{n / 1000.0:0.0}k" : n.ToString();
}
