using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The GLOBAL operator-editable briefing rules (openspec: loop-agent-briefing, D2b):
/// the bullet lines <see cref="LoopConfigStore.ComposeBriefedPrompt"/> renders into
/// every drive-mode WORK send's situational briefing. ONE list for all agents — the
/// dock's Briefing section on every card edits the same store. A rule can be parked
/// (<c>Enabled=false</c>): captured and remembered but never composed into a send
/// until enabled — the operator's idea parking lot. The fixed frame, the
/// <c>NEEDS_HUMAN:</c>/sentinel contract lines, and the verify-phase note
/// deliberately do NOT live here: parser- and safety-coupled text stays compiled in
/// <see cref="LoopConfigStore"/>, so no edit can break the marker contract or add
/// act-pressure to a verification turn.
///
/// Persisted at <c>briefing.json</c> under AppPaths.DataDir (an isolated
/// CLAUDEWEB_DATADIR instance keeps its own) with the same atomic temp+rename write
/// and never-reseed-on-unreadable load guard as the other autopilot stores; the
/// draft-v1 rules are seeded only when no file exists at all. Every save archives
/// the outgoing state into <c>Revisions</c> and bumps <c>Rev</c> (monotonic), and
/// every briefed send stamps the rev it composed with — so the exact sent text
/// stays reconstructable after any later edit: fixed frame (git-versioned code) +
/// <see cref="RulesAt"/> (here) + the recorded raw text.
/// </summary>
public class BriefingRulesStore
{
    public const int MaxRules = 50;
    public const int MaxRuleLength = 500;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public sealed record Rule(string Id, string Text, bool Enabled);
    public sealed record Snapshot(int Rev, IReadOnlyList<Rule> Rules);

    private sealed record Revision(int Rev, long SavedAt, List<Rule> Rules);

    private sealed class Store
    {
        public int Rev { get; set; } = 1;
        public List<Rule> Rules { get; set; } = new();
        public List<Revision> Revisions { get; set; } = new();
    }

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();

    /// <summary>Where the rules live on disk, for the debug bundle.</summary>
    public string FilePath => _path;

    public BriefingRulesStore(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "briefing.json");
        // Seed only when there has never been a file: an unreadable file loads as
        // in-memory defaults but is left ALONE on disk (forensics), and a
        // deliberately emptied list must never be re-seeded.
        var firstRun = !File.Exists(_path);
        Load();
        if (firstRun) Seed();
    }

    /// <summary>The current rules + revision, for the editor and the preview.</summary>
    public Snapshot Current()
    {
        lock (_gate) return new Snapshot(_store.Rev, _store.Rules.ToList());
    }

    /// <summary>What ComposeBriefedPrompt renders: enabled rule texts, in order,
    /// with the revision to stamp on the send.</summary>
    public (int Rev, IReadOnlyList<string> Texts) EnabledTexts()
    {
        lock (_gate)
            return (_store.Rev, _store.Rules.Where(r => r.Enabled).Select(r => r.Text).ToList());
    }

    /// <summary>The rules as they stood at <paramref name="rev"/> — how a recorded
    /// send's briefing is reconstructed after later edits. Null for unknown revs
    /// (pre-feature records stamp rev 0).</summary>
    public IReadOnlyList<Rule>? RulesAt(int rev)
    {
        lock (_gate)
        {
            if (rev == _store.Rev) return _store.Rules.ToList();
            return _store.Revisions.FirstOrDefault(v => v.Rev == rev)?.Rules.ToList();
        }
    }

    /// <summary>Replaces the whole list (the editor PUTs the full set): trims and
    /// bounds each text, drops empties, assigns ids to new rules, archives the
    /// outgoing state, bumps the revision.</summary>
    public Snapshot Replace(IEnumerable<(string? Id, string? Text, bool Enabled)> rules)
    {
        lock (_gate)
        {
            var clean = new List<Rule>();
            foreach (var (id, text, enabled) in rules)
            {
                if (clean.Count >= MaxRules) break;
                if (string.IsNullOrWhiteSpace(text)) continue;
                var t = text.Trim();
                if (t.Length > MaxRuleLength) t = t[..MaxRuleLength];
                clean.Add(new Rule(string.IsNullOrWhiteSpace(id) ? NewId() : id.Trim(), t, enabled));
            }
            _store.Revisions.Add(new Revision(
                _store.Rev, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), _store.Rules));
            _store.Rules = clean;
            _store.Rev++;
            Save();
            _logger.Info($"[BRIEFING] rules replaced -> rev {_store.Rev} ({clean.Count(r => r.Enabled)}/{clean.Count} enabled)");
            return new Snapshot(_store.Rev, _store.Rules.ToList());
        }
    }

    private static string NewId() => Guid.NewGuid().ToString("N");

    private void Seed()
    {
        lock (_gate)
        {
            foreach (var text in LoopConfigStore.SeedBriefingRules)
                _store.Rules.Add(new Rule(NewId(), text, Enabled: true));
            Save();
            _logger.Info($"[BRIEFING] seeded {_store.Rules.Count} draft-v1 rule(s) at rev {_store.Rev}");
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path));
            if (store is null) return;
            store.Rules ??= new();
            store.Revisions ??= new();
            _store = store;
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[BRIEFING] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic temp+rename — a kill mid-write can't truncate it.
    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_store, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[BRIEFING] Failed to save {_path}: {ex.Message}");
        }
    }
}
