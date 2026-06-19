using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.ArchPlan;

/// <summary>
/// A single global free-text "architectural plan" document the Operator maintains
/// by hand (plans/ideas-arch-plan.md), shown in the Ideas surface so it's
/// glanceable while driving the agent dashboard. ONE document, global — not
/// per-project. Persisted to %APPDATA%\ClaudeWeb\arch-plan.txt with the ATOMIC
/// temp+rename write and the never-overwrite-on-unreadable load guard (the
/// NotesService pattern, born from the 2026-06-12 registry-clobber).
/// </summary>
public class ArchPlanService
{
    public const int MaxLength = 100_000;

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private string _text = "";

    public ArchPlanService(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "arch-plan.txt");
        Load();
    }

    /// <summary>The current document (empty string when unset).</summary>
    public string Get()
    {
        lock (_gate) return _text;
    }

    /// <summary>Replaces the document. Null clears it; newlines normalised to \n
    /// and length-capped. Returns the stored text.</summary>
    public string Set(string? text)
    {
        var clean = (text ?? "").Replace("\r\n", "\n");
        if (clean.Length > MaxLength) clean = clean[..MaxLength];
        lock (_gate)
        {
            _text = clean;
            Save();
        }
        _logger.Info($"[ARCHPLAN] Saved ({clean.Length} chars)");
        return clean;
    }

    private void Load()
    {
        try
        {
            if (File.Exists(_path)) _text = File.ReadAllText(_path);
        }
        catch (Exception ex)
        {
            // Unreadable file: empty in memory, file left ALONE for forensics.
            _logger.Error($"[ARCHPLAN] Failed to load {_path} (using empty, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic: write a temp file, then rename over the target
    // — a kill mid-write can never leave a truncated document.
    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, _text);
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[ARCHPLAN] Failed to save {_path}: {ex.Message}");
        }
    }
}
