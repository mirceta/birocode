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
///
/// The entries are also held in memory (openspec: reduce-transcript-io, D5): the file
/// is loaded once, <see cref="Record"/> writes through to both, and
/// <see cref="Recent"/> serves from memory. The transcript endpoints ask for the
/// last 5000 entries on every call to restore message actors, which used to
/// re-read the whole file each time. Only this process writes the file.
/// </summary>
public sealed class AutopilotAuditLog
{
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private List<Entry>? _entries; // oldest first; null until first load

    public AutopilotAuditLog(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "autopilot-audit.jsonl");
    }

    /// <summary>The on-disk audit path, for the debug bundle (openspec:
    /// add-loop-debug-handoff).</summary>
    public string FilePath => _path;

    // Briefed + BriefingRev (openspec: loop-agent-briefing, D3): Prompt stays the
    // RAW stored text; when Briefed, what was actually sent is the deterministic
    // composition of the briefing frame + the BriefingRulesStore rules at
    // BriefingRev + Prompt. Additive with defaults — old .jsonl lines load as
    // unbriefed.
    //
    // Kind + Phase + SentText (openspec: queue-loop-prompt-transparency, D4):
    // Kind is the loop kind that sent ("queue"/"goal"/"recipe"/"suggestion"),
    // Phase is "work" or "verify" for driven sends ("" for the suggestion kind),
    // and SentText is the EXACT composed text handed to the CLI — recorded only
    // when it differs from Prompt (null = sent exactly as Prompt). Additive:
    // old lines load with Kind/Phase "" and no SentText, and are excluded from
    // kind-filtered views rather than misattributed.
    public sealed record Entry(
        long At, string RepoId, string RepoName, string Prompt,
        double Confidence, string AnsweredMessage, string Outcome,
        bool Briefed = false, int BriefingRev = 0,
        string Kind = "", string Phase = "", string? SentText = null);

    /// <summary>Appends one auto-send record. Best-effort: a write failure is
    /// logged but never throws into the engine tick.</summary>
    public void Record(Entry entry)
    {
        try
        {
            var line = JsonSerializer.Serialize(entry) + "\n";
            lock (_gate)
            {
                EnsureLoaded();
                File.AppendAllText(_path, line);
                _entries!.Add(entry);
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] Failed to append audit entry to {_path}: {ex.Message}");
        }
    }

    /// <summary>The most recent <paramref name="max"/> entries, newest first, for
    /// the dashboard and the transcript actor annotation.</summary>
    public IReadOnlyList<Entry> Recent(int max = 50)
    {
        try
        {
            lock (_gate)
            {
                EnsureLoaded();
                var all = _entries!;
                var take = Math.Min(Math.Max(0, max), all.Count);
                var result = new List<Entry>(take);
                for (var i = all.Count - 1; i >= all.Count - take; i--) result.Add(all[i]);
                return result;
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] Failed to read audit log {_path}: {ex.Message}");
            return Array.Empty<Entry>();
        }
    }

    // Caller holds _gate.
    private void EnsureLoaded()
    {
        if (_entries is not null) return;
        var list = new List<Entry>();
        if (File.Exists(_path))
        {
            foreach (var l in File.ReadLines(_path))
            {
                if (string.IsNullOrWhiteSpace(l)) continue;
                try
                {
                    var e = JsonSerializer.Deserialize<Entry>(l);
                    if (e is not null) list.Add(e);
                }
                catch { /* skip a corrupt line */ }
            }
        }
        _entries = list;
    }
}
