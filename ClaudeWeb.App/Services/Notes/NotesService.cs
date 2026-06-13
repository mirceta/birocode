using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Notes;

/// <summary>
/// Per-project ideas/notes (plans/ideas-tab.md), backend-synced so phone and
/// desktop share them. Notes are keyed by repository id and persisted to
/// %APPDATA%\ClaudeWeb\notes.json with the ATOMIC temp+rename write and the
/// never-reseed-on-unreadable load guard (the UiSettingsService pattern, born
/// from the 2026-06-12 registry-clobber). Distinct from prompt-stash, which is
/// per-agent-tab and ephemeral (plans/prompt-stash.md).
/// </summary>
public class NotesService
{
    public const int MaxTextLength = 20_000;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();

    public NotesService(Logger logger)
    {
        _logger = logger;
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "notes.json");
        Load();
    }

    public sealed record Note(string Id, string Text, long CreatedAt, long UpdatedAt);

    private sealed class Store
    {
        // repo id -> its notes (insertion order; the API returns newest first).
        public Dictionary<string, List<Note>> Notes { get; set; } = new();
    }

    /// <summary>This project's notes, newest first.</summary>
    public List<Note> List(string repoId)
    {
        lock (_gate)
        {
            if (!_store.Notes.TryGetValue(repoId, out var list)) return new List<Note>();
            return list.AsEnumerable().Reverse().ToList();
        }
    }

    /// <summary>Adds a note to a project. Text is trimmed and length-capped; empty text is rejected (null return).</summary>
    public Note? Add(string repoId, string? text, long now)
    {
        var clean = Clean(text);
        if (clean is null) return null;
        var note = new Note(Guid.NewGuid().ToString("N"), clean, now, now);
        lock (_gate)
        {
            if (!_store.Notes.TryGetValue(repoId, out var list))
                _store.Notes[repoId] = list = new List<Note>();
            list.Add(note);
            Save();
        }
        _logger.Info($"[NOTES] Added note {note.Id} to {repoId}");
        return note;
    }

    /// <summary>Edits a note's text. Null return if the id is unknown for this project or the text is empty.</summary>
    public Note? Update(string repoId, string id, string? text, long now)
    {
        var clean = Clean(text);
        if (clean is null) return null;
        lock (_gate)
        {
            if (!_store.Notes.TryGetValue(repoId, out var list)) return null;
            var i = list.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var updated = list[i] with { Text = clean, UpdatedAt = now };
            list[i] = updated;
            Save();
            _logger.Info($"[NOTES] Updated note {id} in {repoId}");
            return updated;
        }
    }

    /// <summary>Removes a note. False if the id is unknown for this project.</summary>
    public bool Delete(string repoId, string id)
    {
        lock (_gate)
        {
            if (!_store.Notes.TryGetValue(repoId, out var list)) return false;
            var removed = list.RemoveAll(n => n.Id == id) > 0;
            if (removed) Save();
            if (removed) _logger.Info($"[NOTES] Deleted note {id} from {repoId}");
            return removed;
        }
    }

    private static string? Clean(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var t = text.Trim();
        return t.Length > MaxTextLength ? t[..MaxTextLength] : t;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path));
            if (store?.Notes != null) _store = store;
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[NOTES] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic: write a temp file, then rename over the
    // target — a kill mid-write can never leave a truncated store.
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
            _logger.Error($"[NOTES] Failed to save {_path}: {ex.Message}");
        }
    }
}
