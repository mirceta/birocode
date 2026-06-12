using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Settings;

/// <summary>
/// Backend-synced UI preferences (plans/settings-tab.md) — the user works
/// from phone and desktop interchangeably, so prefs live here and not in
/// localStorage. Currently: the nav tab order (a list of tab keys; empty =
/// default order).
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
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private List<string> _tabOrder = new();

    public UiSettingsService(Logger logger)
    {
        _logger = logger;
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "uisettings.json");
        Load();
    }

    private sealed class Store
    {
        public List<string> TabOrder { get; set; } = new();
    }

    public List<string> TabOrder
    {
        get { lock (_gate) return new List<string>(_tabOrder); }
    }

    public void SetTabOrder(IEnumerable<string> order)
    {
        lock (_gate)
        {
            _tabOrder = order.ToList();
            Save();
        }
        _logger.Info($"[SETTINGS] Tab order -> {(_tabOrder.Count == 0 ? "(default)" : string.Join(",", _tabOrder))}");
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path));
            if (store?.TabOrder != null) _tabOrder = store.TabOrder;
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
            File.WriteAllText(tmp, JsonSerializer.Serialize(new Store { TabOrder = _tabOrder }, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[SETTINGS] Failed to save {_path}: {ex.Message}");
        }
    }
}
