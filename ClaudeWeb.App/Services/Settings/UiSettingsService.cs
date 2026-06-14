using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Settings;

/// <summary>
/// Backend-synced UI preferences (plans/settings-tab.md, plans/pane-widths.md,
/// plans/tab-visibility.md). The user works from phone and desktop
/// interchangeably, so prefs live here and not in localStorage.
///
/// **Per-project (plans/browser-scoped-tab-order.md):** the nav tab order, pane
/// widths, and hidden-tab set are stored **per repository** — a
/// <c>repoId → { tabOrder, tabWidths, hiddenTabs }</c> map — so each project can
/// have its own nav layout. A project with no entry inherits the
/// <c>__default__</c> entry (which the old single global layout migrates into),
/// and customising a project forks from that effective layout, so nothing
/// resets. Still backend-synced, so the same project looks the same on every
/// device.
///
/// Persisted to %APPDATA%\ClaudeWeb\uisettings.json with an ATOMIC write
/// (temp file + rename): on 2026-06-12 a force-killed harness mid-write
/// truncated repositories.json and the loader reseeded over the user's
/// projects. Every store this app grows gets the temp+rename treatment, and
/// a load failure here NEVER overwrites the file — it just falls back to
/// defaults in memory.
/// </summary>
public class UiSettingsService
{
    /// <summary>Key for the layout a project inherits until it customises its own.</summary>
    public const string DefaultKey = "__default__";

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Dictionary<string, Store> _byRepo = new();

    public UiSettingsService(Logger logger)
    {
        _logger = logger;
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "uisettings.json");
        Load();
    }

    /// <summary>One project's layout.</summary>
    private sealed class Store
    {
        public List<string> TabOrder { get; set; } = new();
        // Tab key -> pane span in slot units, 1-4 (plans/pane-widths.md).
        public Dictionary<string, int> TabWidths { get; set; } = new();
        // Tab keys hidden from the advanced nav (plans/tab-visibility.md).
        public List<string> HiddenTabs { get; set; } = new();
    }

    // On-disk model. `ByRepo` is the current shape; the three flat fields are the
    // legacy (pre-per-project) shape, read once for migration into __default__.
    private sealed class FileModel
    {
        public Dictionary<string, Store>? ByRepo { get; set; }
        public List<string>? TabOrder { get; set; }
        public Dictionary<string, int>? TabWidths { get; set; }
        public List<string>? HiddenTabs { get; set; }
    }

    /// <summary>A project's effective layout, returned to the controller.</summary>
    public record UiSettingsView(List<string> TabOrder, Dictionary<string, int> TabWidths, List<string> HiddenTabs);

    private static string Key(string? repoId) => string.IsNullOrWhiteSpace(repoId) ? DefaultKey : repoId;

    // Caller holds _gate. The project's own entry, else the __default__ entry it
    // inherits, else an empty layout.
    private Store Resolve(string? repoId)
    {
        var key = Key(repoId);
        if (_byRepo.TryGetValue(key, out var own)) return own;
        if (_byRepo.TryGetValue(DefaultKey, out var def)) return def;
        return new Store();
    }

    // Caller holds _gate. The project's own entry, creating it (forked from the
    // effective layout) on first customisation so the other two settings keep
    // their inherited values instead of resetting.
    private Store Fork(string? repoId)
    {
        var key = Key(repoId);
        if (!_byRepo.TryGetValue(key, out var s))
        {
            var eff = Resolve(repoId);
            s = new Store
            {
                TabOrder = new List<string>(eff.TabOrder),
                TabWidths = new Dictionary<string, int>(eff.TabWidths),
                HiddenTabs = new List<string>(eff.HiddenTabs),
            };
            _byRepo[key] = s;
        }
        return s;
    }

    /// <summary>The effective layout for a project (its own, or the inherited default).</summary>
    public UiSettingsView GetForRepo(string? repoId)
    {
        lock (_gate)
        {
            var s = Resolve(repoId);
            return new UiSettingsView(
                new List<string>(s.TabOrder),
                new Dictionary<string, int>(s.TabWidths),
                new List<string>(s.HiddenTabs));
        }
    }

    public void SetTabOrder(string? repoId, IEnumerable<string> order)
    {
        lock (_gate)
        {
            Fork(repoId).TabOrder = order.ToList();
            Save();
        }
        _logger.Info($"[SETTINGS] Tab order [{Key(repoId)}] updated");
    }

    public void SetTabWidths(string? repoId, IDictionary<string, int> widths)
    {
        lock (_gate)
        {
            Fork(repoId).TabWidths = new Dictionary<string, int>(widths);
            Save();
        }
        _logger.Info($"[SETTINGS] Tab widths [{Key(repoId)}] updated");
    }

    public void SetHiddenTabs(string? repoId, IEnumerable<string> hidden)
    {
        lock (_gate)
        {
            Fork(repoId).HiddenTabs = hidden.ToList();
            Save();
        }
        _logger.Info($"[SETTINGS] Hidden tabs [{Key(repoId)}] updated");
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var model = JsonSerializer.Deserialize<FileModel>(File.ReadAllText(_path));
            if (model is null) return;

            if (model.ByRepo is { Count: > 0 })
            {
                _byRepo = model.ByRepo;
            }
            else if (model.TabOrder != null || model.TabWidths != null || model.HiddenTabs != null)
            {
                // Legacy single global layout → migrate into the default entry, so
                // every project inherits the user's existing layout until it forks.
                _byRepo[DefaultKey] = new Store
                {
                    TabOrder = model.TabOrder ?? new(),
                    TabWidths = model.TabWidths ?? new(),
                    HiddenTabs = model.HiddenTabs ?? new(),
                };
                _logger.Info("[SETTINGS] Migrated legacy global layout into __default__");
            }
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[SETTINGS] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic: write a temp file, then rename over the
    // target — a kill mid-write can never leave a truncated store.
    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(new FileModel { ByRepo = _byRepo }, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[SETTINGS] Failed to save {_path}: {ex.Message}");
        }
    }
}
