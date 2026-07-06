using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.AgenticAudit;

/// <summary>
/// Append-only audit trail of every agentic feature CALL (openspec change
/// add-agent-audit-trail): who triggered an agent run, when, against which repo,
/// and how it ended. One JSON object per line in
/// <c>%APPDATA%\ClaudeWeb\agentic-audit.jsonl</c>, modeled on
/// <see cref="Autopilot.AutopilotAuditLog"/>: never rewritten, only appended.
///
/// Deliberately a SEPARATE store from <see cref="Audit.AuditService"/>'s action
/// audit: that store is rich (prompt text, tool args) and desktop-only by spec,
/// while this one is invocation METADATA ONLY — which is what makes it safe to
/// read back over the web. Keep it that way: never write prompt text, tool
/// calls, or agent output here.
///
/// Two entries per call, correlated by <c>CallId</c> (an append-only file can't
/// update): a <c>started</c> entry when the job actually starts, and a terminal
/// entry (<c>done</c>/<c>error</c>/<c>canceled</c>) when it ends. A started
/// entry with no terminal is merged by the read side into "running" (live job
/// exists) or "interrupted" (process died mid-run). Joining an in-flight job
/// records nothing — a join is a view of the same run, not a new invocation.
/// </summary>
public sealed class AgenticAuditLog
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();

    public AgenticAuditLog(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "agentic-audit.jsonl");
    }

    /// <summary>One audit line. Kind is <c>started</c> | <c>done</c> | <c>error</c> |
    /// <c>canceled</c>; DurationMs/Error only appear on terminal entries.</summary>
    public sealed record Entry(
        DateTime Ts, string Kind, string CallId, string Feature,
        string RepoId, string RepoName, string Actor, string Ip,
        long? DurationMs = null, string? Error = null);

    /// <summary>Appends the <c>started</c> entry for an actual job start (never a join)
    /// and returns the new call's correlation id. Best-effort: a write failure is
    /// logged but never throws into the job registry.</summary>
    public string RecordStart(string feature, string repoId, string repoName, string actor, string ip)
    {
        var callId = Guid.NewGuid().ToString("N")[..12];
        Append(new Entry(DateTime.UtcNow, "started", callId, feature, repoId, repoName, actor, ip));
        return callId;
    }

    /// <summary>Appends the terminal entry (<paramref name="outcome"/> =
    /// <c>done</c>/<c>error</c>/<c>canceled</c>) for a call. The error, if any, must be
    /// a short trimmed summary — never agent output.</summary>
    public void RecordEnd(string callId, string feature, string repoId, string repoName,
        string actor, string ip, string outcome, long durationMs, string? error = null)
    {
        Append(new Entry(DateTime.UtcNow, outcome, callId, feature, repoId, repoName, actor, ip,
            durationMs, Trim(error)));
    }

    /// <summary>The most recent <paramref name="max"/> entries in CHRONOLOGICAL order
    /// (oldest of the window first), for callId merging. Skips corrupt lines. Reads the
    /// whole file — volume is human-button-press scale.</summary>
    public IReadOnlyList<Entry> Recent(int max = 2000)
    {
        try
        {
            if (!File.Exists(_path)) return Array.Empty<Entry>();
            string[] lines;
            lock (_gate) lines = File.ReadAllLines(_path);
            return lines
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .Select(l => { try { return JsonSerializer.Deserialize<Entry>(l, JsonOpts); } catch { return null; } })
                .Where(e => e is not null)
                .Select(e => e!)
                .TakeLast(max)
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.Error($"[AGENTIC-AUDIT] Failed to read {_path}: {ex.Message}");
            return Array.Empty<Entry>();
        }
    }

    private void Append(Entry entry)
    {
        try
        {
            var line = JsonSerializer.Serialize(entry, JsonOpts) + "\n";
            lock (_gate) File.AppendAllText(_path, line);
        }
        catch (Exception ex)
        {
            _logger.Error($"[AGENTIC-AUDIT] Failed to append entry to {_path}: {ex.Message}");
        }
    }

    private static string? Trim(string? error) =>
        string.IsNullOrWhiteSpace(error) ? null :
        error.Length <= 300 ? error : error[..300] + "…";
}
