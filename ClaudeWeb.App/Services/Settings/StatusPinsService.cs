using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Settings;

/// <summary>
/// The Management dashboard Status tab's PINNED agents (fleet task 61a0d521, openspec status-pinned-agents): the
/// agents the Operator pinned to the bar at the top of the tab, from any machine of the fleet, in the order pinned.
/// Kept on the hub beside the view presets (<c>status-pins.json</c>, temp+rename write), keyed by the machine's
/// collector sourceId ("self" for this harness) + repoId, so a pin survives reloads, other browsers and agent renames.
/// The machine and agent names are remembered at pin time only to label a pin whose machine is not answering — the
/// bar greys it out, it is never dropped. Pin and unpin are idempotent.
/// </summary>
public partial class StatusPinsService
{
    public const int MaxPins = 40;

    public sealed record Pin(
        [property: JsonPropertyName("sourceId")] string SourceId,
        [property: JsonPropertyName("repoId")] string RepoId,
        [property: JsonPropertyName("machine")] string? Machine,
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("pinnedAt")] long PinnedAt)
    {
        [JsonIgnore] public string Key => KeyOf(SourceId, RepoId);
        public static string KeyOf(string sourceId, string repoId) => $"{sourceId}|{repoId}";
    }

    private sealed record Store([property: JsonPropertyName("pins")] List<Pin> Pins);

    [GeneratedRegex("^[A-Za-z0-9_.:-]{1,80}$")] private static partial Regex IdRx();

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private List<Pin>? _pins;

    public StatusPinsService(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "status-pins.json");
    }

    public IReadOnlyList<Pin> List() { lock (_gate) return Load().ToList(); }

    /// <summary>Pin (appended at the end; already pinned = unchanged, its label refreshed) or unpin (absent = unchanged).</summary>
    public (IReadOnlyList<Pin> Pins, string? Error) Set(string? sourceId, string? repoId, bool pinned, string? machine, string? name, long now)
    {
        if (sourceId is null || repoId is null || !IdRx().IsMatch(sourceId) || !IdRx().IsMatch(repoId))
            return (List(), "sourceId and repoId are required (letters, digits, _ . : -)");
        lock (_gate)
        {
            var pins = Load();
            var key = Pin.KeyOf(sourceId, repoId);
            var at = pins.FindIndex(p => p.Key == key);
            if (pinned)
            {
                var label = Clip(machine, 80);
                var nm = Clip(name, 120);
                if (at >= 0) pins[at] = pins[at] with { Machine = label ?? pins[at].Machine, Name = nm ?? pins[at].Name };
                else
                {
                    if (pins.Count >= MaxPins) return (pins.ToList(), $"at most {MaxPins} pins — unpin one first");
                    pins.Add(new Pin(sourceId, repoId, label, nm, now));
                }
            }
            else if (at >= 0) pins.RemoveAt(at);
            Persist(pins);
            return (pins.ToList(), null);
        }
    }

    /// <summary>Reorder: the given keys first, in that order; pins not named keep their relative order after them.</summary>
    public IReadOnlyList<Pin> Reorder(IEnumerable<string>? keys)
    {
        lock (_gate)
        {
            var pins = Load();
            var want = (keys ?? Array.Empty<string>()).Distinct().ToList();
            var ordered = want.Select(k => pins.FirstOrDefault(p => p.Key == k)).Where(p => p is not null).Select(p => p!).ToList();
            ordered.AddRange(pins.Where(p => !want.Contains(p.Key)));
            pins.Clear(); pins.AddRange(ordered);
            Persist(pins);
            return pins.ToList();
        }
    }

    private static string? Clip(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : (s.Trim().Length > max ? s.Trim()[..max] : s.Trim());

    private List<Pin> Load()
    {
        if (_pins is not null) return _pins;
        try
        {
            var raw = File.Exists(_path) ? JsonSerializer.Deserialize<Store>(File.ReadAllText(_path)) : null;
            _pins = (raw?.Pins ?? new List<Pin>())
                .Where(p => p is not null && p.SourceId is not null && p.RepoId is not null && IdRx().IsMatch(p.SourceId) && IdRx().IsMatch(p.RepoId))
                .GroupBy(p => p.Key).Select(g => g.First()).Take(MaxPins).ToList();
        }
        catch (Exception ex)
        {
            _logger.Error($"[STATUS-PINS] read failed ({_path}): {ex.Message} — treating as none");
            _pins = new List<Pin>();
        }
        return _pins;
    }

    private void Persist(List<Pin> pins)
    {
        var tmp = _path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(new Store(pins), JsonOpts));
        File.Move(tmp, _path, overwrite: true);
    }
}
