using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Notes;

/// <summary>
/// Global ideas/notes (plans/ideas-pinned-dashboard.md), backend-synced so phone
/// and desktop share them. ONE master list — not per-project (this reverses the
/// original per-project design in plans/ideas-tab.md). Persisted to
/// %APPDATA%\ClaudeWeb\notes.json with the ATOMIC temp+rename write and the
/// never-reseed-on-unreadable load guard (the UiSettingsService pattern, born
/// from the 2026-06-12 registry-clobber). Distinct from prompt-stash, which is
/// per-agent-tab and ephemeral (plans/prompt-stash.md).
///
/// Migration: an old per-repo file ({ Notes: { repoId -> [..] } }) is flattened
/// into the single Ideas list (by createdAt) on load and rewritten — no data lost.
/// </summary>
public class NotesService
{
    public const int MaxTextLength = 20_000;
    public const int MaxProjectLength = 200;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private List<Note> _ideas = new();

    public NotesService(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "notes.json");
        Load();
    }

    // Project is an OPTIONAL free-text label (plans/ideas-filter-project.md).
    // Priority is 0 = none, 1–5 = increasing (plans/idea-priority.md). Active marks
    // an idea as current work, pinning it into the Active section
    // (plans/ideas-active-section.md). All three are tolerant of older notes that
    // lack the field — System.Text.Json fills the constructor parameter with its
    // default (null / 0 / false), so no migration is needed.
    public sealed record Note(string Id, string Text, string? Project, long CreatedAt, long UpdatedAt, int Priority, bool Active);

    // On-disk model. `Ideas` is the current shape; `Notes` is the legacy
    // per-repo map, read once for migration.
    private sealed class Store
    {
        public List<Note>? Ideas { get; set; }
        public Dictionary<string, List<Note>>? Notes { get; set; }
    }

    /// <summary>All ideas, newest first.</summary>
    public List<Note> List()
    {
        lock (_gate) return _ideas.AsEnumerable().Reverse().ToList();
    }

    /// <summary>Adds an idea. Text is trimmed and length-capped; empty text is rejected (null return). Project is optional; priority is clamped to 0–5; active defaults to false.</summary>
    public Note? Add(string? text, string? project, int priority, bool active, long now)
    {
        var clean = Clean(text);
        if (clean is null) return null;
        var note = new Note(Guid.NewGuid().ToString("N"), clean, CleanProject(project), now, now, ClampPriority(priority), active);
        lock (_gate)
        {
            _ideas.Add(note);
            Save();
        }
        _logger.Info($"[NOTES] Added idea {note.Id}");
        return note;
    }

    /// <summary>Edits an idea's text, project, priority and active flag. Null return if the id is unknown or the text is empty.</summary>
    public Note? Update(string id, string? text, string? project, int priority, bool active, long now)
    {
        var clean = Clean(text);
        if (clean is null) return null;
        lock (_gate)
        {
            var i = _ideas.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var updated = _ideas[i] with { Text = clean, Project = CleanProject(project), UpdatedAt = now, Priority = ClampPriority(priority), Active = active };
            _ideas[i] = updated;
            Save();
            _logger.Info($"[NOTES] Updated idea {id}");
            return updated;
        }
    }

    /// <summary>Removes an idea. False if the id is unknown.</summary>
    public bool Delete(string id)
    {
        lock (_gate)
        {
            var removed = _ideas.RemoveAll(n => n.Id == id) > 0;
            if (removed) { Save(); _logger.Info($"[NOTES] Deleted idea {id}"); }
            return removed;
        }
    }

    private static string? Clean(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var t = text.Trim();
        return t.Length > MaxTextLength ? t[..MaxTextLength] : t;
    }

    // Optional: empty/whitespace project normalises to null (no project),
    // otherwise trimmed and length-capped.
    private static string? CleanProject(string? project)
    {
        if (string.IsNullOrWhiteSpace(project)) return null;
        var p = project.Trim();
        return p.Length > MaxProjectLength ? p[..MaxProjectLength] : p;
    }

    // Priority levels (plans/idea-priority.md): 0 = none, 1–5 = increasing.
    private static int ClampPriority(int priority) => Math.Clamp(priority, 0, 5);

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path));
            if (store is null) return;

            if (store.Ideas != null)
            {
                _ideas = store.Ideas;
            }
            else if (store.Notes is { Count: > 0 })
            {
                // Legacy per-repo map → flatten every project's notes into one
                // global list, ordered by createdAt, and rewrite in the new shape.
                _ideas = store.Notes.Values
                    .SelectMany(list => list)
                    .OrderBy(n => n.CreatedAt)
                    .ToList();
                Save();
                _logger.Info($"[NOTES] Migrated {_ideas.Count} per-project note(s) into the global ideas list");
            }
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
            File.WriteAllText(tmp, JsonSerializer.Serialize(new Store { Ideas = _ideas }, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[NOTES] Failed to save {_path}: {ex.Message}");
        }
    }
}
