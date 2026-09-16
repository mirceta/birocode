using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.TaskGraph;

/// <summary>
/// The Operator's SAVED Kanban column layout (fleet task 0a57d282): which lifecycle
/// columns are visible and each column's width, snapshotted by the "Save layout" button
/// above the board and re-applied by "Restore layout". Persisted server-side on THIS
/// harness (<c>kanban-layout.json</c> in the data dir) so it survives reloads and
/// browsers — and deliberately kept OUT of the fleet-synced task graph
/// (<see cref="TaskGraphService"/> / openspec sync-task-graph): a layout is one
/// Operator's view preference on one machine, and must never propagate one machine's
/// column widths to every peer's board through the graph merge.
///
/// Stored values are normalised on save: only real column keys
/// (<see cref="TaskGraphService.Statuses"/>) in canonical column order, widths clamped
/// to <see cref="MinWidth"/>..<see cref="MaxWidth"/>. A missing/corrupt file reads as
/// "nothing saved" (null) — the board then shows its defaults; never throws to a caller.
/// </summary>
public class KanbanLayoutService
{
    public const int MinWidth = 150;
    public const int MaxWidth = 900;

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public sealed record KanbanLayout(
        [property: JsonPropertyName("visible")] List<string> Visible,
        [property: JsonPropertyName("widths")] Dictionary<string, int> Widths,
        [property: JsonPropertyName("savedAt")] long SavedAt);

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private KanbanLayout? _layout;
    private bool _loaded;

    /// <param name="dirOverride">Test hook: persist under this directory rather than
    /// <see cref="AppPaths.DataDir"/>; DI leaves it null.</param>
    public KanbanLayoutService(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "kanban-layout.json");
    }

    /// <summary>The saved layout, or null when the Operator has never saved one.</summary>
    public KanbanLayout? Get()
    {
        lock (_gate)
        {
            EnsureLoaded();
            return _layout;
        }
    }

    /// <summary>Snapshot the given visible-set + widths as THE saved layout (normalised).
    /// Returns what was stored.</summary>
    public KanbanLayout Save(IEnumerable<string>? visible, IDictionary<string, int>? widths, long now)
    {
        var normalised = Normalize(visible, widths, now);
        lock (_gate)
        {
            EnsureLoaded();
            _layout = normalised;
            Persist();
        }
        return normalised;
    }

    /// <summary>Pure: keep only real column keys in canonical order (a key the client does
    /// not know cannot be shown), clamp widths, drop widths of unknown keys.</summary>
    public static KanbanLayout Normalize(IEnumerable<string>? visible, IDictionary<string, int>? widths, long now)
    {
        var wanted = new HashSet<string>(visible ?? Array.Empty<string>(), StringComparer.Ordinal);
        var vis = TaskGraphService.Statuses.Where(wanted.Contains).ToList();
        var w = new Dictionary<string, int>(StringComparer.Ordinal);
        if (widths is not null)
            foreach (var (k, px) in widths)
                if (Array.IndexOf(TaskGraphService.Statuses, k) >= 0)
                    w[k] = Math.Clamp(px, MinWidth, MaxWidth);
        return new KanbanLayout(vis, w, now);
    }

    private void EnsureLoaded()
    {
        if (_loaded) return;
        _loaded = true;
        try
        {
            if (!File.Exists(_path)) return;
            var raw = JsonSerializer.Deserialize<KanbanLayout>(File.ReadAllText(_path));
            if (raw is null) return;
            // Re-normalise on read so a hand-edited or older file can never push an
            // unknown column or an absurd width into the board.
            _layout = Normalize(raw.Visible, raw.Widths, raw.SavedAt);
        }
        catch (Exception ex)
        {
            _logger.Error($"[KANBAN] layout read failed ({_path}): {ex.Message} — treating as not saved");
            _layout = null;
        }
    }

    private void Persist()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_layout, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[KANBAN] layout save failed ({_path}): {ex.Message}");
            throw;
        }
    }
}
