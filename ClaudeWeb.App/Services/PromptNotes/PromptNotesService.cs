using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.PromptNotes;

/// <summary>
/// User-defined prompt NOTES — freeform working notes the user is drafting before
/// porting them into a prompt PLAN (the "first messy step" of planning). The third
/// sibling of <see cref="ClaudeWeb.Services.Prompts.PromptsService"/> and
/// <see cref="ClaudeWeb.Services.PromptPlans.PromptPlansService"/>: GLOBAL (not
/// per-repo) and backend-synced so the personal note library follows the user across
/// devices and projects. Persisted to %APPDATA%\ClaudeWeb\prompt-notes.json with the
/// ATOMIC temp+rename write and never-reseed-on-unreadable load guard (the
/// PromptsService/PromptPlansService pattern). DELIBERATELY separate from the Ideas
/// NotesService (notes.json) — a different feature with its own store — so the two
/// never collide. Each note is a short title + a freeform body; a note with NEITHER
/// is dropped (an empty note is never persisted).
/// </summary>
public class PromptNotesService
{
    public const int MaxTitleLength = 120;
    public const int MaxBodyLength = 20_000;
    public const int MaxNotes = 500;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();

    public PromptNotesService(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "prompt-notes.json");
        Load();
    }

    public sealed record PromptNote(string Id, string Title, string Body);

    private sealed class Store
    {
        // Insertion order; the API returns notes in that order.
        public List<PromptNote> Notes { get; set; } = new();
    }

    /// <summary>The whole note library (insertion order).</summary>
    public List<PromptNote> List()
    {
        lock (_gate) return new List<PromptNote>(_store.Notes);
    }

    /// <summary>Adds a note. Null if both title and body are empty (an empty note is
    /// never persisted).</summary>
    public PromptNote? Add(string? title, string? body)
    {
        var note = Build(Guid.NewGuid().ToString("N"), title, body);
        if (note is null) return null;
        lock (_gate)
        {
            if (_store.Notes.Count >= MaxNotes) return null;
            _store.Notes.Add(note);
            Save();
        }
        _logger.Info($"[PROMPT-NOTES] Added note {note.Id}");
        return note;
    }

    /// <summary>Edits a note (title + body). Null if the id is unknown or both fields
    /// are empty.</summary>
    public PromptNote? Update(string id, string? title, string? body)
    {
        var built = Build(id, title, body);
        if (built is null) return null;
        lock (_gate)
        {
            var i = _store.Notes.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            _store.Notes[i] = built;
            Save();
            _logger.Info($"[PROMPT-NOTES] Updated note {id}");
            return built;
        }
    }

    /// <summary>Removes a note. False if the id is unknown.</summary>
    public bool Delete(string id)
    {
        lock (_gate)
        {
            var removed = _store.Notes.RemoveAll(n => n.Id == id) > 0;
            if (removed) { Save(); _logger.Info($"[PROMPT-NOTES] Deleted note {id}"); }
            return removed;
        }
    }

    // Trim + cap; return null when BOTH fields are empty so an empty note is never
    // stored (the one required-ish constraint — a note needs a title or a body).
    private static PromptNote? Build(string id, string? title, string? body)
    {
        var t = CleanField(title, MaxTitleLength);
        var b = CleanField(body, MaxBodyLength);
        if (t.Length == 0 && b.Length == 0) return null;
        return new PromptNote(id, t, b);
    }

    private static string CleanField(string? text, int max)
    {
        var t = (text ?? string.Empty).Trim();
        return t.Length > max ? t[..max] : t;
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
            _logger.Error($"[PROMPT-NOTES] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic: temp file then rename, so a kill mid-write can
    // never leave a truncated store.
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
            _logger.Error($"[PROMPT-NOTES] Failed to save {_path}: {ex.Message}");
        }
    }
}
