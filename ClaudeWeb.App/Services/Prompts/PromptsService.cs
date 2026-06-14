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
/// </summary>
public class PromptsService
{
    public const int MaxTextLength = 20_000;
    public const int MaxLabelLength = 80;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();

    public PromptsService(Logger logger)
    {
        _logger = logger;
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "prompts.json");
        Load();
    }

    public sealed record Prompt(string Id, string Emoji, string Label, string Text);

    private sealed class Store
    {
        // Insertion order; the API returns them in that order.
        public List<Prompt> Prompts { get; set; } = new();
    }

    /// <summary>The whole prompt library (insertion order).</summary>
    public List<Prompt> List()
    {
        lock (_gate) return new List<Prompt>(_store.Prompts);
    }

    /// <summary>Adds a preset. Null return if text is empty (label/emoji optional).</summary>
    public Prompt? Add(string? emoji, string? label, string? text)
    {
        var cleanText = CleanText(text);
        if (cleanText is null) return null;
        var prompt = new Prompt(Guid.NewGuid().ToString("N"), CleanEmoji(emoji), CleanLabel(label), cleanText);
        lock (_gate)
        {
            _store.Prompts.Add(prompt);
            Save();
        }
        _logger.Info($"[PROMPTS] Added preset {prompt.Id}");
        return prompt;
    }

    /// <summary>Edits a preset. Null if the id is unknown or text is empty.</summary>
    public Prompt? Update(string id, string? emoji, string? label, string? text)
    {
        var cleanText = CleanText(text);
        if (cleanText is null) return null;
        lock (_gate)
        {
            var i = _store.Prompts.FindIndex(p => p.Id == id);
            if (i < 0) return null;
            var updated = new Prompt(id, CleanEmoji(emoji), CleanLabel(label), cleanText);
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
