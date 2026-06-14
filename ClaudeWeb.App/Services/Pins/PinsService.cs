using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Pins;

/// <summary>
/// Per-project pinned files (plans/plan-files-merge.md, slice 2) — the quick-open
/// set shown atop the Files tab. Backend-synced so phone and desktop share them.
/// Keyed by repository id, persisted to %APPDATA%\ClaudeWeb\pins.json with the
/// ATOMIC temp+rename write and the never-reseed-on-unreadable load guard (the
/// NotesService/UiSettingsService pattern). A project with no saved set gets the
/// defaults (plan.md + CLAUDE.md); the first toggle materializes that set so an
/// unpin sticks.
/// </summary>
public class PinsService
{
    public const int MaxPins = 50;
    public static readonly IReadOnlyList<string> DefaultPins = new[] { "plan.md", "CLAUDE.md" };
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();

    public PinsService(Logger logger)
    {
        _logger = logger;
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "pins.json");
        Load();
    }

    private sealed class Store
    {
        // repo id -> its pinned paths (ordered; defaults when absent).
        public Dictionary<string, List<string>> Pins { get; set; } = new();
    }

    /// <summary>This project's pinned paths (defaults when it has no saved set).</summary>
    public List<string> List(string repoId)
    {
        lock (_gate)
        {
            return _store.Pins.TryGetValue(repoId, out var list)
                ? new List<string>(list)
                : new List<string>(DefaultPins);
        }
    }

    /// <summary>
    /// Pins the path if absent, unpins it if present. Returns the new list and
    /// whether the path is now pinned, or null if the path is empty.
    /// </summary>
    public (List<string> Pins, bool Pinned)? Toggle(string repoId, string? path)
    {
        var clean = Normalize(path);
        if (clean is null) return null;
        lock (_gate)
        {
            // Materialize the defaults on first edit so an unpinned default sticks.
            var list = _store.Pins.TryGetValue(repoId, out var existing)
                ? existing
                : new List<string>(DefaultPins);

            bool pinned;
            if (list.Remove(clean))
            {
                pinned = false;
            }
            else if (list.Count >= MaxPins)
            {
                return (new List<string>(list), false); // at cap: no-op add
            }
            else
            {
                list.Add(clean);
                pinned = true;
            }

            _store.Pins[repoId] = list;
            Save();
            _logger.Info($"[PINS] {(pinned ? "Pinned" : "Unpinned")} {clean} in {repoId}");
            return (new List<string>(list), pinned);
        }
    }

    // Pins are stored without a leading slash so '/CLAUDE.md' (tree) and
    // 'CLAUDE.md' (default/pin) refer to the same file.
    private static string? Normalize(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        var p = path.Trim().TrimStart('/');
        return p.Length == 0 ? null : p;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path));
            if (store?.Pins != null) _store = store;
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[PINS] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
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
            _logger.Error($"[PINS] Failed to save {_path}: {ex.Message}");
        }
    }
}
