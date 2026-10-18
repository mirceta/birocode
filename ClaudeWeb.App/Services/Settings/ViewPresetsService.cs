using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Settings;

/// <summary>
/// The Management dashboard's layout PRESETS (fleet task d6e499cd, openspec manage-view-presets):
/// named snapshots of the split view (which panes, in which order, divider positions as fractions).
/// The browser keeps its own copy in localStorage; this is the hub copy, so another browser or
/// machine pointing at this harness sees the same presets. One list per harness (the harness has
/// one Operator). The browser copy wins a conflict — the client merges and PUTs the whole list.
///
/// Persisted to <c>view-presets.json</c> in the data dir with the temp+rename write every store
/// here uses; a missing or corrupt file reads as "nothing saved" and is never overwritten on load.
/// </summary>
public partial class ViewPresetsService
{
    public const int MaxPresets = 9;
    public const int MaxPanes = 16;
    public const int MaxName = 120;

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public sealed record PresetPane(
        [property: JsonPropertyName("tab")] string Tab,
        [property: JsonPropertyName("sel"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Sel = null);

    public sealed record Preset(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("auto")] bool Auto,
        [property: JsonPropertyName("panes")] List<PresetPane> Panes,
        [property: JsonPropertyName("fractions")] List<double> Fractions,
        [property: JsonPropertyName("created")] long Created,
        [property: JsonPropertyName("updated")] long Updated);

    public sealed record Snapshot(
        [property: JsonPropertyName("presets")] List<Preset> Presets,
        [property: JsonPropertyName("savedAt")] long SavedAt);

    [GeneratedRegex("^[A-Za-z0-9_-]{1,40}$")] private static partial Regex IdRx();
    [GeneratedRegex("^[a-z][a-z0-9:_-]{0,60}$")] private static partial Regex TabRx();

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Snapshot? _snap;
    private bool _loaded;

    /// <param name="dirOverride">Test hook; DI leaves it null (= <see cref="AppPaths.DataDir"/>).</param>
    public ViewPresetsService(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "view-presets.json");
    }

    /// <summary>The hub's presets (empty list + savedAt 0 when never saved).</summary>
    public Snapshot Get()
    {
        lock (_gate)
        {
            EnsureLoaded();
            return _snap ?? new Snapshot(new List<Preset>(), 0);
        }
    }

    /// <summary>Replace the hub's list with the (normalised) given one.</summary>
    public Snapshot Save(IEnumerable<Preset?>? presets, long now)
    {
        var snap = new Snapshot(Normalize(presets), now);
        lock (_gate)
        {
            EnsureLoaded();
            _snap = snap;
            Persist();
        }
        return snap;
    }

    /// <summary>Pure: drop malformed presets / panes, dedupe ids, cap counts and lengths, keep the
    /// fractions aligned with the panes (a missing or non-positive fraction becomes an equal share).
    /// Tab keys are not checked against the client's tab list: a preset naming a tab this build
    /// does not have is kept, and the client opens the rest with a notice.</summary>
    public static List<Preset> Normalize(IEnumerable<Preset?>? presets)
    {
        var outList = new List<Preset>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var p in presets ?? Array.Empty<Preset?>())
        {
            if (p is null || p.Id is null || !IdRx().IsMatch(p.Id) || !ids.Add(p.Id)) continue;
            var panes = new List<PresetPane>();
            var fr = new List<double>();
            for (var i = 0; i < (p.Panes?.Count ?? 0) && panes.Count < MaxPanes; i++)
            {
                var pane = p.Panes![i];
                if (pane?.Tab is null || !TabRx().IsMatch(pane.Tab) || panes.Any(x => x.Tab == pane.Tab)) continue;
                var sel = pane.Sel is { Length: > 0 and <= 80 } ? pane.Sel : null;
                panes.Add(new PresetPane(pane.Tab, sel));
                var f = p.Fractions is not null && i < p.Fractions.Count ? p.Fractions[i] : 0;
                fr.Add(double.IsFinite(f) && f > 0 ? f : 0);
            }
            if (panes.Count == 0) continue;
            var fill = fr.Any(f => f > 0) ? fr.Where(f => f > 0).Average() : 1.0;
            for (var i = 0; i < fr.Count; i++) if (fr[i] <= 0) fr[i] = fill;
            var sum = fr.Sum();
            fr = fr.Select(f => Math.Round(f / sum, 4)).ToList();
            var name = (p.Name ?? "").Trim();
            if (name.Length == 0) name = string.Join(" | ", panes.Select(x => x.Tab));
            if (name.Length > MaxName) name = name[..MaxName];
            outList.Add(new Preset(p.Id, name, p.Auto, panes, fr, p.Created, p.Updated));
            if (outList.Count >= MaxPresets) break;
        }
        return outList;
    }

    private void EnsureLoaded()
    {
        if (_loaded) return;
        _loaded = true;
        try
        {
            if (!File.Exists(_path)) return;
            var raw = JsonSerializer.Deserialize<Snapshot>(File.ReadAllText(_path));
            if (raw is null) return;
            _snap = new Snapshot(Normalize(raw.Presets), raw.SavedAt);
        }
        catch (Exception ex)
        {
            _logger.Error($"[PRESETS] read failed ({_path}): {ex.Message} — treating as not saved");
            _snap = null;
        }
    }

    private void Persist()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_snap, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[PRESETS] save failed ({_path}): {ex.Message}");
            throw;
        }
    }
}
