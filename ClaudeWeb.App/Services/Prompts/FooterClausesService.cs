using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Prompts;

/// <summary>
/// Footer clauses (openspec prompt-footer-clauses): standing instructions the
/// composer appends to EVERY sent prompt while their checkbox is active — e.g.
/// "launch long-lived processes detached; you run under claude -p". GLOBAL (not
/// per-repo) like the sibling PromptsService: the motivating clauses are about the
/// harness's own invocation mode, identical for every repo. Persisted to
/// %APPDATA%\ClaudeWeb\footer-clauses.json with the ATOMIC temp+rename write and
/// never-reseed-on-unreadable load guard (the PromptsService/NotesService pattern).
/// </summary>
public class FooterClausesService
{
    public const int MaxTextLength = 20_000;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();

    public FooterClausesService(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "footer-clauses.json");
        Load();
    }

    public sealed record Clause(string Id, string Text, bool Active);

    private sealed class Store
    {
        // Insertion order; the API returns them in that order, and the composer
        // appends active clauses to the footer in this same order.
        public List<Clause> Clauses { get; set; } = new();
    }

    /// <summary>The whole clause list (insertion order).</summary>
    public List<Clause> List()
    {
        lock (_gate) return new List<Clause>(_store.Clauses);
    }

    /// <summary>Adds a clause (inactive by default unless asked). Null if text is empty.</summary>
    public Clause? Add(string? text, bool active)
    {
        var cleanText = CleanText(text);
        if (cleanText is null) return null;
        var clause = new Clause(Guid.NewGuid().ToString("N"), cleanText, active);
        lock (_gate)
        {
            _store.Clauses.Add(clause);
            Save();
        }
        _logger.Info($"[FOOTER-CLAUSES] Added clause {clause.Id}");
        return clause;
    }

    /// <summary>
    /// Edits a clause's text and/or active flag. Null fields keep the current
    /// value (so the checkbox toggle never has to resend the text). Null return
    /// if the id is unknown or an explicit new text is empty.
    /// </summary>
    public Clause? Update(string id, string? text, bool? active)
    {
        lock (_gate)
        {
            var i = _store.Clauses.FindIndex(c => c.Id == id);
            if (i < 0) return null;
            var current = _store.Clauses[i];
            var cleanText = text is null ? current.Text : CleanText(text);
            if (cleanText is null) return null;
            var updated = current with { Text = cleanText, Active = active ?? current.Active };
            _store.Clauses[i] = updated;
            Save();
            _logger.Info($"[FOOTER-CLAUSES] Updated clause {id} (active={updated.Active})");
            return updated;
        }
    }

    /// <summary>Removes a clause. False if the id is unknown.</summary>
    public bool Delete(string id)
    {
        lock (_gate)
        {
            var removed = _store.Clauses.RemoveAll(c => c.Id == id) > 0;
            if (removed) { Save(); _logger.Info($"[FOOTER-CLAUSES] Deleted clause {id}"); }
            return removed;
        }
    }

    private static string? CleanText(string? text)
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
            if (store?.Clauses != null) _store = store;
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[FOOTER-CLAUSES] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
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
            _logger.Error($"[FOOTER-CLAUSES] Failed to save {_path}: {ex.Message}");
        }
    }
}
