using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Prompts;

/// <summary>
/// User-defined composer prompt presets (plans/custom-prompts.md). GLOBAL (not
/// per-repo) and backend-synced so the user's personal prompt library follows
/// them across devices and projects. Persisted to %APPDATA%\ClaudeWeb\prompts.json
/// with the ATOMIC temp+rename write and never-reseed-on-unreadable load guard
/// (the NotesService/PinsService pattern). Each preset is an emoji + label +
/// prompt text; a composer button renders it and prefills the chat box.
///
/// OWNERS (openspec arch-custom-prompts, fleet task ebc91192): the same store holds
/// the ARCH AGENT's cached prompts under owner <see cref="OwnerArch"/> — the repo
/// agents' library stays owner-less, so every old caller (the composer modal, the
/// suggestion loop's routines) sees exactly what it saw before. Arch prompts also carry
/// a category (the panel's grouping), a hint (how to phrase it), the seed id of the
/// Arch-examples category they were generated from, and an edited flag so a re-seed
/// never overwrites what the Operator changed.
/// </summary>
public class PromptsService
{
    public const int MaxTextLength = 20_000;
    public const int MaxLabelLength = 80;
    public const int MaxHintLength = 400;
    public const string OwnerArch = "arch";
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();

    public PromptsService(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "prompts.json");
        Load();
    }

    /// <summary>One preset. <c>Owner</c> null = the repo agents' library; "arch" = the arch
    /// agent's cached prompts. <c>SeedId</c> = the Arch-examples category it was seeded from
    /// (null for a custom one); <c>Edited</c> = the Operator changed a seeded one.</summary>
    public sealed record Prompt(string Id, string Emoji, string Label, string Text,
        string? Owner = null, string? Category = null, string? Hint = null, string? SeedId = null, bool Edited = false, long CreatedAt = 0);

    private sealed class Store
    {
        // Insertion order; the API returns them in that order (reorder rewrites it).
        public List<Prompt> Prompts { get; set; } = new();
    }

    private static bool SameOwner(Prompt p, string? owner) =>
        string.Equals(string.IsNullOrWhiteSpace(p.Owner) ? null : p.Owner, string.IsNullOrWhiteSpace(owner) ? null : owner, StringComparison.Ordinal);

    /// <summary>The library of one owner (null = the repo agents' prompts), in order.</summary>
    public List<Prompt> List(string? owner = null)
    {
        lock (_gate) return _store.Prompts.Where(p => SameOwner(p, owner)).ToList();
    }

    public Prompt? Find(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        lock (_gate) return _store.Prompts.FirstOrDefault(p => p.Id == id);
    }

    /// <summary>Adds a preset. Null return if text is empty (label/emoji optional).</summary>
    public Prompt? Add(string? emoji, string? label, string? text, string? owner = null, string? category = null, string? hint = null, string? seedId = null)
    {
        var cleanText = CleanText(text);
        if (cleanText is null) return null;
        var prompt = new Prompt(Guid.NewGuid().ToString("N"), CleanEmoji(emoji), CleanLabel(label), cleanText,
            string.IsNullOrWhiteSpace(owner) ? null : owner.Trim(), CleanCategory(category), CleanHint(hint),
            string.IsNullOrWhiteSpace(seedId) ? null : seedId.Trim(), false, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        lock (_gate)
        {
            _store.Prompts.Add(prompt);
            Save();
        }
        _logger.Info($"[PROMPTS] Added preset {prompt.Id}{(prompt.Owner is null ? "" : $" ({prompt.Owner})")}");
        return prompt;
    }

    /// <summary>Edits a preset (owner and seed id are kept; a seeded prompt whose text or label
    /// changes is marked edited). Null if the id is unknown or text is empty.</summary>
    public Prompt? Update(string id, string? emoji, string? label, string? text, string? category = null, string? hint = null)
    {
        var cleanText = CleanText(text);
        if (cleanText is null) return null;
        lock (_gate)
        {
            var i = _store.Prompts.FindIndex(p => p.Id == id);
            if (i < 0) return null;
            var cur = _store.Prompts[i];
            var newLabel = CleanLabel(label);
            var edited = cur.Edited || (cur.SeedId is not null && (cur.Text != cleanText || cur.Label != newLabel));
            var updated = cur with
            {
                Emoji = CleanEmoji(emoji), Label = newLabel, Text = cleanText,
                Category = category is null ? cur.Category : CleanCategory(category),
                Hint = hint is null ? cur.Hint : CleanHint(hint),
                Edited = edited,
            };
            _store.Prompts[i] = updated;
            Save();
            _logger.Info($"[PROMPTS] Updated preset {id}");
            return updated;
        }
    }

    /// <summary>Removes a preset. False if the id is unknown.</summary>
    public bool Delete(string id)
    {
        lock (_gate)
        {
            var removed = _store.Prompts.RemoveAll(p => p.Id == id) > 0;
            if (removed) { Save(); _logger.Info($"[PROMPTS] Deleted preset {id}"); }
            return removed;
        }
    }

    /// <summary>Reorders one owner's library to the given id order (unknown ids ignored, the
    /// rest appended in their old order); other owners' prompts keep their places.</summary>
    public List<Prompt> Reorder(string? owner, IReadOnlyList<string> orderedIds)
    {
        lock (_gate)
        {
            var mine = _store.Prompts.Where(p => SameOwner(p, owner)).ToList();
            var byId = mine.ToDictionary(p => p.Id, StringComparer.Ordinal);
            var reordered = new List<Prompt>(mine.Count);
            foreach (var id in orderedIds ?? Array.Empty<string>())
                if (byId.Remove(id, out var p)) reordered.Add(p);
            reordered.AddRange(mine.Where(p => byId.ContainsKey(p.Id)));
            var others = _store.Prompts.Where(p => !SameOwner(p, owner)).ToList();
            _store.Prompts = others.Concat(reordered).ToList();
            Save();
            return reordered;
        }
    }

    /// <summary>A copy right after the original: same text, category and hint, label marked
    /// "(copy)", a custom one (no seed id). Null when the id is unknown.</summary>
    public Prompt? Duplicate(string id)
    {
        lock (_gate)
        {
            var i = _store.Prompts.FindIndex(p => p.Id == id);
            if (i < 0) return null;
            var cur = _store.Prompts[i];
            var copy = cur with
            {
                Id = Guid.NewGuid().ToString("N"), Label = CleanLabel(string.IsNullOrWhiteSpace(cur.Label) ? "copy" : cur.Label + " (copy)"),
                SeedId = null, Edited = false, CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            _store.Prompts.Insert(i + 1, copy);
            Save();
            _logger.Info($"[PROMPTS] Duplicated preset {id} → {copy.Id}");
            return copy;
        }
    }

    /// <summary>Seeds an owner's library: every seed whose <c>SeedId</c> is not yet present is
    /// added (at the end, in the seeds' order); present ones — edited or not — are left
    /// untouched. Returns how many were added and the library size.</summary>
    public (int Added, int Total) Seed(string owner, IEnumerable<Prompt> seeds)
    {
        var added = 0;
        lock (_gate)
        {
            var present = new HashSet<string>(_store.Prompts.Where(p => SameOwner(p, owner) && p.SeedId is not null).Select(p => p.SeedId!), StringComparer.Ordinal);
            foreach (var s in seeds)
            {
                if (string.IsNullOrWhiteSpace(s.SeedId) || present.Contains(s.SeedId)) continue;
                var cleanText = CleanText(s.Text);
                if (cleanText is null) continue;
                _store.Prompts.Add(new Prompt(Guid.NewGuid().ToString("N"), CleanEmoji(s.Emoji), CleanLabel(s.Label), cleanText,
                    owner, CleanCategory(s.Category), CleanHint(s.Hint), s.SeedId.Trim(), false, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));
                present.Add(s.SeedId);
                added++;
            }
            if (added > 0) Save();
            var total = _store.Prompts.Count(p => SameOwner(p, owner));
            if (added > 0) _logger.Info($"[PROMPTS] Seeded {added} {owner} prompt(s) ({total} total)");
            return (added, total);
        }
    }

    private static string? CleanText(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var t = text.Trim();
        return t.Length > MaxTextLength ? t[..MaxTextLength] : t;
    }

    private static string CleanLabel(string? label)
    {
        var l = (label ?? string.Empty).Trim();
        return l.Length > MaxLabelLength ? l[..MaxLabelLength] : l;
    }

    private static string? CleanCategory(string? category)
    {
        var c = (category ?? string.Empty).Trim();
        return c.Length == 0 ? null : c.Length > MaxLabelLength ? c[..MaxLabelLength] : c;
    }

    private static string? CleanHint(string? hint)
    {
        var h = (hint ?? string.Empty).Trim();
        return h.Length == 0 ? null : h.Length > MaxHintLength ? h[..MaxHintLength] : h;
    }

    // Keep emoji short (a couple of code points); never null.
    private static string CleanEmoji(string? emoji)
    {
        var e = (emoji ?? string.Empty).Trim();
        return e.Length > 8 ? e[..8] : e;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path));
            if (store?.Prompts != null) _store = store;
            _store.Prompts.RemoveAll(p => p is null || string.IsNullOrWhiteSpace(p.Id));
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[PROMPTS] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic: temp file then rename, so a kill mid-write
    // can never leave a truncated store.
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
            _logger.Error($"[PROMPTS] Failed to save {_path}: {ex.Message}");
        }
    }
}
