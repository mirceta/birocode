using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The Operator's manual occupancy of repo agents (openspec manual-agent-occupancy, fleet
/// task 3a978f93): per agent — keyed like the board's assignees, <c>sourceId|repoId</c>
/// with an empty sourceId for this machine — whether the Operator declared it OCCUPIED or
/// FREE, when, and an optional note. Persisted to <c>occupancy.json</c> under the data dir
/// so it survives refresh and restart. No entry = the branch heuristic decides (free on the
/// default branch, occupied otherwise). The record lives on the harness that set it: a
/// hub's setting about a peer's agent is the hub's view of that peer.
/// </summary>
public sealed class OccupancyStore
{
    public sealed record Override(
        [property: JsonPropertyName("occupied")] bool Occupied,
        [property: JsonPropertyName("setAt")] long SetAt,
        [property: JsonPropertyName("setBy")] string SetBy,
        [property: JsonPropertyName("note")] string? Note);

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Dictionary<string, Override> _map = new(StringComparer.Ordinal);

    public OccupancyStore(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "occupancy.json");
        Load();
    }

    /// <summary>The board's assignee key: "" for this machine, else the source id.</summary>
    public static string Key(string? sourceId, string repoId) =>
        $"{(string.IsNullOrWhiteSpace(sourceId) || sourceId == CollectorService.SelfId ? "" : sourceId.Trim())}|{repoId}";

    public Override? Get(string? sourceId, string repoId)
    {
        lock (_gate) return _map.TryGetValue(Key(sourceId, repoId), out var o) ? o : null;
    }

    /// <summary>Set the Operator's occupancy; <paramref name="occupied"/> null clears it
    /// (back to the branch heuristic). Returns the record now in effect, null when cleared.</summary>
    public Override? Set(string? sourceId, string repoId, bool? occupied, string by = "operator", string? note = null, long? now = null)
    {
        var key = Key(sourceId, repoId);
        lock (_gate)
        {
            Override? o = null;
            if (occupied is bool b)
            {
                o = new Override(b, now ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), by, string.IsNullOrWhiteSpace(note) ? null : note.Trim());
                _map[key] = o;
            }
            else _map.Remove(key);
            Save();
            _logger.Info($"[OCCUPANCY] {key} -> {(o is null ? "automatic (branch rule)" : o.Occupied ? "occupied" : "free")} by {by}");
            return o;
        }
    }

    public IReadOnlyDictionary<string, Override> All()
    {
        lock (_gate) return new Dictionary<string, Override>(_map, StringComparer.Ordinal);
    }

    private void Load()
    {
        try
        {
            if (File.Exists(_path))
                _map = JsonSerializer.Deserialize<Dictionary<string, Override>>(File.ReadAllText(_path)) ?? new(StringComparer.Ordinal);
        }
        catch (Exception ex) { _logger.Error($"[OCCUPANCY] {_path} unreadable ({ex.Message}); starting with no overrides — the file is left untouched until the next change"); }
    }

    // Caller holds _gate. Atomic temp+rename.
    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_map, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex) { _logger.Error($"[OCCUPANCY] failed to save {_path}: {ex.Message}"); }
    }
}
