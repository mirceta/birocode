using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.PromptNotes;

/// <summary>
/// The user's prompt NOTES — a SINGLE freeform scratch canvas the user is drafting
/// before porting it into a prompt PLAN (the "first messy step" of planning). One
/// document, not a list: the Notes tab is one white canvas you read and edit. The
/// third sibling of <see cref="ClaudeWeb.Services.Prompts.PromptsService"/> and
/// <see cref="ClaudeWeb.Services.PromptPlans.PromptPlansService"/>: GLOBAL (not
/// per-repo) and backend-synced so the canvas follows the user across devices and
/// projects. Persisted to %APPDATA%\ClaudeWeb\prompt-notes.json with the ATOMIC
/// temp+rename write and never-reseed-on-unreadable load guard (the
/// PromptsService/PromptPlansService pattern). DELIBERATELY separate from the Ideas
/// NotesService (notes.json) — a different feature with its own store — so the two
/// never collide.
/// </summary>
public class PromptNotesService
{
    // The canvas can hold a real working document, so the cap is generous; it only
    // exists to keep a runaway paste from bloating the store unbounded.
    public const int MaxLength = 200_000;
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

    private sealed class Store
    {
        // The single canvas. Empty string = nothing written yet.
        public string Text { get; set; } = string.Empty;
    }

    /// <summary>The current canvas text (empty string if nothing written yet).</summary>
    public string Get()
    {
        lock (_gate) return _store.Text;
    }

    /// <summary>Replaces the canvas with <paramref name="text"/> (capped) and returns
    /// the stored value. An empty/whitespace canvas is allowed — the user may clear it.</summary>
    public string Set(string? text)
    {
        var clean = (text ?? string.Empty).Replace("\0", string.Empty);
        if (clean.Length > MaxLength) clean = clean[..MaxLength];
        lock (_gate)
        {
            _store.Text = clean;
            Save();
        }
        _logger.Info($"[PROMPT-NOTES] Saved canvas ({clean.Length} chars)");
        return clean;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path));
            // store?.Text is null only on an older list-shaped file (no real data shipped) —
            // fall back to an empty canvas in that case rather than throwing.
            if (store?.Text != null) _store = store;
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
