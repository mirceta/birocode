using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// Per-repo, per-type loop DRAFTS (openspec: add-loop-drafts): the "fill the
/// loop" scratch space where the operator and pasted agents build up task text
/// BEFORE it becomes real loop parameters. Exactly one draft per (repoId, type),
/// three fixed types: <c>queue-plan</c> (a `---`-separated sequence of
/// self-contained prompts destined for the queued-prompts loop), <c>goal</c>
/// (one coherent goal definition), <c>freestyle</c> (anything, pre-split).
/// Plain text in v1 — no revisions (unlike <see cref="BriefingRulesStore"/>),
/// last write wins; the tab's explicit Save/Reload makes staleness visible.
///
/// Persisted at <c>loop-drafts.json</c> under AppPaths.DataDir (an isolated
/// CLAUDEWEB_DATADIR instance keeps its own) with the same atomic temp+rename
/// write and never-reseed-on-unreadable load guard as the other autopilot
/// stores. Never seeded: empty is the correct first state. The store does NOT
/// validate repo ids — an unregistered repo's draft survives as an orphan blob
/// and comes back if the repo is re-registered; the controller joins against
/// the registry so the API and UI only ever surface registered repos.
/// </summary>
public class LoopDraftsStore
{
    /// <summary>Body cap per draft — well past any real task list, small enough
    /// that a runaway agent can't balloon the store file.</summary>
    public const int MaxDraftLength = 256 * 1024;

    public static readonly string[] Types = { "queue-plan", "goal", "freestyle" };
    public static bool IsType(string? type) => type is not null && Types.Contains(type);

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public sealed record Draft(string Text, long SavedAt);
    public sealed record TypeSummary(bool NonEmpty, long SavedAt);

    private sealed class Entry
    {
        public string Text { get; set; } = "";
        public long SavedAt { get; set; }
    }

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    // repoId -> type -> entry
    private Dictionary<string, Dictionary<string, Entry>> _store = new();

    /// <summary>Where the drafts live on disk, for the debug bundle.</summary>
    public string FilePath => _path;

    public LoopDraftsStore(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "loop-drafts.json");
        Load();
    }

    /// <summary>The draft for (repoId, type) — empty text with stamp 0 when none
    /// was ever saved, so GET is total over valid addresses.</summary>
    public Draft Get(string repoId, string type)
    {
        lock (_gate)
        {
            var entry = _store.GetValueOrDefault(repoId)?.GetValueOrDefault(type);
            return entry is null ? new Draft("", 0) : new Draft(entry.Text, entry.SavedAt);
        }
    }

    /// <summary>Replaces the whole draft (editor and agents always PUT the full
    /// text) and stamps it. Caller has validated repo and type; the text is
    /// bounded here as the last line of defense.</summary>
    public Draft Put(string repoId, string type, string text)
    {
        if (text.Length > MaxDraftLength) text = text[..MaxDraftLength];
        lock (_gate)
        {
            var byType = _store.TryGetValue(repoId, out var existing)
                ? existing
                : _store[repoId] = new Dictionary<string, Entry>();
            var entry = new Entry { Text = text, SavedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() };
            byType[type] = entry;
            Save();
            _logger.Info($"[DRAFTS] {repoId}/{type} saved ({text.Length} chars)");
            return new Draft(entry.Text, entry.SavedAt);
        }
    }

    /// <summary>Per-type summary for one repo, total over the three types — the
    /// list endpoint's building block and the tab's badge source.</summary>
    public Dictionary<string, TypeSummary> Summary(string repoId)
    {
        lock (_gate)
        {
            var byType = _store.GetValueOrDefault(repoId);
            return Types.ToDictionary(
                t => t,
                t =>
                {
                    var entry = byType?.GetValueOrDefault(t);
                    return new TypeSummary(
                        entry is not null && !string.IsNullOrWhiteSpace(entry.Text),
                        entry?.SavedAt ?? 0);
                });
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, Entry>>>(
                File.ReadAllText(_path));
            if (store is null) return;
            _store = store;
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[DRAFTS] Failed to load {_path} (using empty store, file untouched): {ex.Message}");
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
            _logger.Error($"[DRAFTS] Failed to save {_path}: {ex.Message}");
        }
    }
}
