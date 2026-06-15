using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Analytics;

/// <summary>
/// Append-only ledger of agent-run lifecycle events (plans/scoreboard-analytics.md),
/// the durable basis for the Scoreboard. One JSON line per event in
/// %APPDATA%\ClaudeWeb\activity.jsonl: <c>{ ts, event:"start"|"finish", agent,
/// session }</c>. `agent` is the run's working directory (the repo) — runs are
/// single-flight per repo, so start/finish pair unambiguously per agent.
///
/// Append-only (not the temp+rename full-rewrite the JSON stores use): each
/// event is one line, appended under a lock. A torn final line on a hard kill is
/// tolerated by the reader (it skips unparseable lines). The in-memory CallLog
/// stays the live view; this is the history.
/// </summary>
public class ActivityLog
{
    private static readonly JsonSerializerOptions JsonOpts = new();

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();

    public ActivityLog(Logger logger)
    {
        _logger = logger;
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "activity.jsonl");
    }

    public sealed record Event(long Ts, string EventType, string Agent, string? Session);

    /// <summary>Append one event. Best-effort: a write failure is logged, never thrown.</summary>
    public void Append(string eventType, string agent, string? session)
    {
        var evt = new Event(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), eventType, agent ?? "", session);
        try
        {
            var line = JsonSerializer.Serialize(evt, JsonOpts) + "\n";
            lock (_gate) File.AppendAllText(_path, line);
        }
        catch (Exception ex)
        {
            _logger.Error($"[ANALYTICS] Failed to append activity event: {ex.Message}");
        }
    }

    /// <summary>All events in file order. Unparseable lines (e.g. a torn tail) are skipped.</summary>
    public IReadOnlyList<Event> Read()
    {
        try
        {
            string[] lines;
            lock (_gate)
            {
                if (!File.Exists(_path)) return Array.Empty<Event>();
                lines = File.ReadAllLines(_path);
            }
            var events = new List<Event>(lines.Length);
            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try
                {
                    var evt = JsonSerializer.Deserialize<Event>(line);
                    if (evt is not null) events.Add(evt);
                }
                catch { /* torn / partial line — skip */ }
            }
            return events;
        }
        catch (Exception ex)
        {
            _logger.Error($"[ANALYTICS] Failed to read {_path}: {ex.Message}");
            return Array.Empty<Event>();
        }
    }
}
