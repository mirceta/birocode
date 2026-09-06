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
    public const int TombstoneRetentionDays = 30;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private List<Note> _ideas = new();
    private List<Tombstone> _tombstones = new();

    /// <summary>Raised after every successful LOCAL mutation (add/update/delete).
    /// NOT raised by MergeFrom — the sync layer must not re-trigger itself when
    /// applying remote state.</summary>
    public event Action? Changed;

    /// <param name="dirOverride">Test seam (openspec tasks-agent, D2): a data dir other
    /// than <see cref="AppPaths.DataDir"/>; DI leaves it null.</param>
    public NotesService(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
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
    // Number (openspec stable-handles): the running number shown as "#12" — allocated
    // on creation, backfilled once for older notes, never changed. 0 = not yet assigned
    // (a note from a store or a sync peer that predates numbers; backfilled on load/merge).
    public sealed record Note(string Id, string Text, string? Project, long CreatedAt, long UpdatedAt, int Priority, bool Active, int Number = 0);

    /// <summary>A recorded deletion, kept so a delete on one harness doesn't
    /// resurrect from another during sync (openspec ideas-drive-sync). Pruned
    /// after <see cref="TombstoneRetentionDays"/>.</summary>
    public sealed record Tombstone(string Id, long DeletedAt);

    /// <summary>Point-in-time copy of the whole board for the sync layer.</summary>
    public sealed record BoardSnapshot(List<Note> Ideas, List<Tombstone> Tombstones);

    /// <summary>What MergeFrom did: whether the local board changed, and whether
    /// the merged board holds anything the remote side was missing (push needed).</summary>
    public sealed record MergeOutcome(bool LocalChanged, bool RemoteStale);

    // On-disk model. `Ideas` is the current shape; `Notes` is the legacy
    // per-repo map, read once for migration. `Tombstones` is optional — files
    // written before sync existed simply deserialize it as null.
    private sealed class Store
    {
        public List<Note>? Ideas { get; set; }
        public List<Tombstone>? Tombstones { get; set; }
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
        Note note;
        lock (_gate)
        {
            // The next running number, for life (openspec stable-handles).
            note = new Note(Guid.NewGuid().ToString("N"), clean, CleanProject(project), now, now, ClampPriority(priority), active, NextNumber());
            _ideas.Add(note);
            Save();
        }
        _logger.Info($"[NOTES] Added idea {note.Id}");
        RaiseChanged();
        return note;
    }

    /// <summary>Edits an idea's text, project, priority and active flag. Null return if the id is unknown or the text is empty.</summary>
    public Note? Update(string id, string? text, string? project, int priority, bool active, long now)
    {
        var clean = Clean(text);
        if (clean is null) return null;
        Note updated;
        lock (_gate)
        {
            var i = _ideas.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            updated = _ideas[i] with { Text = clean, Project = CleanProject(project), UpdatedAt = now, Priority = ClampPriority(priority), Active = active };
            _ideas[i] = updated;
            Save();
        }
        _logger.Info($"[NOTES] Updated idea {id}");
        RaiseChanged();
        return updated;
    }

    /// <summary>Removes an idea, recording a tombstone so sync peers don't
    /// resurrect it. False if the id is unknown.</summary>
    public bool Delete(string id, long now)
    {
        bool removed;
        lock (_gate)
        {
            removed = _ideas.RemoveAll(n => n.Id == id) > 0;
            if (removed)
            {
                _tombstones.RemoveAll(t => t.Id == id);
                _tombstones.Add(new Tombstone(id, now));
                Save();
            }
        }
        if (removed) { _logger.Info($"[NOTES] Deleted idea {id}"); RaiseChanged(); }
        return removed;
    }

    /// <summary>Copy of the whole board (ideas + tombstones) for the sync layer.</summary>
    public BoardSnapshot Snapshot()
    {
        lock (_gate) return new BoardSnapshot(new List<Note>(_ideas), new List<Tombstone>(_tombstones));
    }

    /// <summary>
    /// Merges a remote board into the local one (openspec ideas-drive-sync):
    /// per-note by Id with newest-UpdatedAt-wins (local wins ties), tombstones
    /// union with newest-DeletedAt-wins; a tombstone at or after a note's
    /// UpdatedAt suppresses the note, a later edit revives it. Deterministic and
    /// commutative, so both pull-merge and push-merge use it. Saves when local
    /// state changed. Does NOT raise Changed (see the event's doc).
    /// </summary>
    public MergeOutcome MergeFrom(List<Note> remoteIdeas, List<Tombstone> remoteTombstones)
    {
        lock (_gate)
        {
            // Tombstones: union by Id, newest DeletedAt wins.
            var tombs = new Dictionary<string, long>();
            foreach (var t in _tombstones) tombs[t.Id] = Math.Max(t.DeletedAt, tombs.GetValueOrDefault(t.Id));
            foreach (var t in remoteTombstones) tombs[t.Id] = Math.Max(t.DeletedAt, tombs.GetValueOrDefault(t.Id));

            // Notes: keep local order; per-Id newer UpdatedAt wins (local on tie);
            // remote-only notes append in CreatedAt order; then tombstone filter.
            var remoteById = new Dictionary<string, Note>();
            foreach (var r in remoteIdeas) remoteById[r.Id] = r;
            var localIds = new HashSet<string>(_ideas.Select(n => n.Id));
            var merged = _ideas
                .Select(n => remoteById.TryGetValue(n.Id, out var r) && r.UpdatedAt > n.UpdatedAt ? r : n)
                .Concat(remoteIdeas.Where(r => !localIds.Contains(r.Id)).OrderBy(r => r.CreatedAt))
                .Where(n => !(tombs.TryGetValue(n.Id, out var dead) && dead >= n.UpdatedAt))
                .ToList();
            var mergedTombs = tombs.Select(kv => new Tombstone(kv.Key, kv.Value)).OrderBy(t => t.Id).ToList();

            var localChanged = !merged.SequenceEqual(_ideas);
            var tombsChanged = !mergedTombs.SequenceEqual(_tombstones.OrderBy(t => t.Id));

            // Push needed when the merged board holds anything the remote side
            // lacked. Canonical (Id-sorted) comparison; a false positive only
            // costs one redundant push.
            var remoteStale =
                !merged.OrderBy(n => n.Id).SequenceEqual(
                    remoteIdeas.Where(n => !(tombs.TryGetValue(n.Id, out var dead) && dead >= n.UpdatedAt)).OrderBy(n => n.Id)) ||
                !mergedTombs.SequenceEqual(remoteTombstones.OrderBy(t => t.Id));

            if (localChanged || tombsChanged)
            {
                _ideas = merged;
                _tombstones = mergedTombs;
                BackfillNumbers(); // remote-only notes from a peer that predates numbers
                Save();
                _logger.Info($"[NOTES] Merged remote board ({_ideas.Count} idea(s), {_tombstones.Count} tombstone(s))");
            }
            return new MergeOutcome(localChanged, remoteStale);
        }
    }

    // ---- handles (openspec stable-handles) -----------------------------------------

    // Caller holds _gate. The next free running number.
    private int NextNumber() => (_ideas.Count == 0 ? 0 : _ideas.Max(n => n.Number)) + 1;

    // Caller holds _gate. Numbers every unnumbered note in CreatedAt order, after the
    // highest number already taken; numbers already assigned are never touched.
    private bool BackfillNumbers()
    {
        if (_ideas.All(n => n.Number > 0)) return false;
        var next = NextNumber();
        foreach (var n in _ideas.Where(n => n.Number <= 0).OrderBy(n => n.CreatedAt).ToList())
        {
            var i = _ideas.FindIndex(x => x.Id == n.Id);
            _ideas[i] = n with { Number = next++ };
        }
        return true;
    }

    /// <summary>An idea by "#12" / "12" (its number) or by id. Ambiguity (two notes
    /// with one number, possible only after a cross-box merge) is reported, not guessed.</summary>
    public (Note? Note, string? Error) FindByRef(string? reference)
    {
        if (string.IsNullOrWhiteSpace(reference)) return (null, "an idea reference is required (#12 or the id)");
        var r = reference.Trim();
        lock (_gate)
        {
            var byId = _ideas.FirstOrDefault(n => n.Id == r);
            if (byId is not null) return (byId, null);
            if (Handles.ParseIdeaRef(r) is int num)
            {
                var hits = _ideas.Where(n => n.Number == num).ToList();
                if (hits.Count == 1) return (hits[0], null);
                if (hits.Count > 1)
                    return (null, $"#{num} is ambiguous ({hits.Count} ideas carry it): {string.Join(" | ", hits.Select(h => $"{h.Id} \"{Handles.Brief(h.Text, 40)}\""))}");
                return (null, $"no idea #{num}");
            }
            return (null, $"no idea \"{r}\" (use #<number> from list_ideas or the id)");
        }
    }

    private void RaiseChanged()
    {
        try { Changed?.Invoke(); }
        catch (Exception ex) { _logger.Error($"[NOTES] Changed handler failed: {ex.Message}"); }
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

            _tombstones = store.Tombstones ?? new List<Tombstone>();
            if (store.Ideas != null)
            {
                _ideas = store.Ideas;
                // One-time backfill (openspec stable-handles): ideas from before numbers
                // get theirs in creation order; numbers already there are never touched.
                if (BackfillNumbers()) { Save(); _logger.Info("[NOTES] Backfilled idea numbers"); }
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
            var cutoff = DateTimeOffset.UtcNow.AddDays(-TombstoneRetentionDays).ToUnixTimeMilliseconds();
            _tombstones.RemoveAll(t => t.DeletedAt < cutoff);
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(new Store { Ideas = _ideas, Tombstones = _tombstones }, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[NOTES] Failed to save {_path}: {ex.Message}");
        }
    }
}
