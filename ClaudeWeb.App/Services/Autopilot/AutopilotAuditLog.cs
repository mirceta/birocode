using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// Append-only audit trail of every prompt autopilot SENT on the user's behalf
/// (plans/loop-autopilot-safety.md, fence #3). One JSON object per line in
/// <c>%APPDATA%\ClaudeWeb\autopilot-audit.jsonl</c>, like the deploy ledger:
/// never rewritten, only appended, so the record of what was auto-sent can't be
/// quietly edited. Each entry captures WHEN, WHICH agent/repo, the routine prompt
/// sent, the confidence, and a snippet of the agent message it answered.
///
/// This is distinct from <see cref="AutopilotService"/>'s in-memory suggestion log
/// (which is a live, capped view of verdicts). The audit log is the durable record
/// of real actions, and only auto-SENDS are written here — suggestions are not.
/// </summary>
public sealed class AutopilotAuditLog
{
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();

    public AutopilotAuditLog(Logger logger)
    {
        _logger = logger;
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "autopilot-audit.jsonl");
    }

    public sealed record Entry(
        long At, string RepoId, string RepoName, string Prompt,
        double Confidence, string AnsweredMessage, string Outcome);

    /// <summary>Appends one auto-send record. Best-effort: a write failure is
    /// logged but never throws into the engine tick.</summary>
    public void Record(Entry entry)
    {
        try
        {
            var line = JsonSerializer.Serialize(entry) + "\n";
            lock (_gate) File.AppendAllText(_path, line);
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] Failed to append audit entry to {_path}: {ex.Message}");
        }
    }

    /// <summary>The most recent <paramref name="max"/> entries, newest first, for
    /// the dashboard. Reads the whole file (it stays small — one line per send).</summary>
    public IReadOnlyList<Entry> Recent(int max = 50)
    {
        try
        {
            if (!File.Exists(_path)) return Array.Empty<Entry>();
            string[] lines;
            lock (_gate) lines = File.ReadAllLines(_path);
            return lines
                .Reverse()
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .Take(max)
                .Select(l => { try { return JsonSerializer.Deserialize<Entry>(l); } catch { return null; } })
                .Where(e => e is not null)
                .Select(e => e!)
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] Failed to read audit log {_path}: {ex.Message}");
            return Array.Empty<Entry>();
        }
    }
}
