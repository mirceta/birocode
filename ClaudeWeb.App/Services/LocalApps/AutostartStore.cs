using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.LocalApps;

/// <summary>One registered local app's autostart entry (fleet task f88f97fe, openspec local-apps-autostart-sentry),
/// keyed by repo + app id on its machine. <see cref="StartCommand"/> / <see cref="Folder"/> override the discovery
/// cache's start command (most registered apps have none): any shell line, e.g. <c>node serve.mjs</c> or
/// <c>wscript launch.vbs</c>; the folder is relative to the repo.</summary>
public sealed record AutostartFlag(
    [property: JsonPropertyName("repoId")] string RepoId,
    [property: JsonPropertyName("appId")] string AppId,
    [property: JsonPropertyName("autostart")] bool Autostart = false,
    [property: JsonPropertyName("healthUrl")] string? HealthUrl = null,
    [property: JsonPropertyName("expectStatus")] int? ExpectStatus = null,
    [property: JsonPropertyName("order")] int Order = 0,
    [property: JsonPropertyName("delaySec")] int DelaySec = 0,
    [property: JsonPropertyName("startCommand")] string? StartCommand = null,
    [property: JsonPropertyName("folder")] string? Folder = null,
    [property: JsonPropertyName("updatedAt")] long UpdatedAt = 0)
{
    public string Key => KeyOf(RepoId, AppId);
    public static string KeyOf(string repoId, string appId) => $"{repoId}/{appId}";

    /// <summary>Pure: trim and clamp what the dashboard sent; a malformed health URL is dropped.</summary>
    public AutostartFlag Normalized(long now)
    {
        string? Clean(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : (s.Trim().Length > max ? s.Trim()[..max] : s.Trim());
        var url = Clean(HealthUrl, 300);
        if (url is not null && !(Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.Scheme == "http" || u.Scheme == "https"))) url = null;
        var folder = Clean(Folder, 260);
        if (folder is not null && (Path.IsPathRooted(folder) || folder.Split('/', '\\').Contains(".."))) folder = null;
        return new AutostartFlag(RepoId.Trim(), AppId.Trim(), Autostart, url,
            ExpectStatus is >= 100 and <= 599 ? ExpectStatus : null,
            Math.Clamp(Order, -1000, 1000), Math.Clamp(DelaySec, 0, 600), Clean(StartCommand, 500), folder, now);
    }
}

/// <summary>How often the sentry probes, and the least time between two automatic restarts of one app.</summary>
public sealed record SentrySettings(
    [property: JsonPropertyName("intervalMin")] int IntervalMin = 5,
    [property: JsonPropertyName("cooldownMin")] int CooldownMin = 15)
{
    public SentrySettings Normalized() => new(Math.Clamp(IntervalMin <= 0 ? 5 : IntervalMin, 1, 1440), Math.Clamp(CooldownMin <= 0 ? 15 : CooldownMin, 1, 1440));
}

/// <summary>What ONE machine runs: its flags, the sentry settings, and the hub's version of them.</summary>
public sealed record MachineSlice(
    [property: JsonPropertyName("flags")] List<AutostartFlag> Flags,
    [property: JsonPropertyName("settings")] SentrySettings Settings,
    [property: JsonPropertyName("version")] long Version,
    [property: JsonPropertyName("from")] string? From)
{
    public static MachineSlice Empty => new(new List<AutostartFlag>(), new SentrySettings(), 0, null);
}

internal static class AtomicJson
{
    internal static readonly JsonSerializerOptions Opts = new() { WriteIndented = true };

    internal static T? Read<T>(string path, Logger logger, string tag) where T : class
    {
        try { return File.Exists(path) ? JsonSerializer.Deserialize<T>(File.ReadAllText(path), Opts) : null; }
        catch (Exception ex) { logger.Error($"[{tag}] read failed ({path}): {ex.Message} — treating as empty"); return null; }
    }

    internal static void Write<T>(string path, T value)
    {
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(value, Opts));
        File.Move(tmp, path, overwrite: true);
    }
}

/// <summary>
/// THIS machine's autostart slice (<c>local-apps-autostart.json</c>): written by the hub — through the peer API on a
/// peer, directly on the hub itself — and read by the <see cref="LocalAppSentry"/> at boot and on every check.
/// </summary>
public class AutostartStore
{
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private MachineSlice? _slice;

    public AutostartStore(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "local-apps-autostart.json");
    }

    public MachineSlice Get()
    {
        lock (_gate)
        {
            _slice ??= Clean(AtomicJson.Read<MachineSlice>(_path, _logger, "AUTOSTART"));
            return _slice;
        }
    }

    public MachineSlice Replace(MachineSlice slice)
    {
        var clean = Clean(slice);
        lock (_gate) { _slice = clean; AtomicJson.Write(_path, clean); }
        return clean;
    }

    internal static MachineSlice Clean(MachineSlice? s)
    {
        if (s is null) return MachineSlice.Empty;
        var flags = (s.Flags ?? new List<AutostartFlag>())
            .Where(f => f is not null && !string.IsNullOrWhiteSpace(f.RepoId) && !string.IsNullOrWhiteSpace(f.AppId))
            .GroupBy(f => f.Key).Select(g => g.Last()).Take(500).ToList();
        return new MachineSlice(flags, (s.Settings ?? new SentrySettings()).Normalized(), s.Version, s.From);
    }
}

/// <summary>
/// The HUB's fleet-wide store (<c>local-apps-fleet.json</c>) — the single writer: every machine's flags by machine
/// label, one version per machine (bumped on each change, so a peer that missed a push is re-pushed when it next
/// answers with an older version), and the fleet's sentry settings.
/// </summary>
public class FleetAutostartStore
{
    public sealed record MachineEntry(
        [property: JsonPropertyName("flags")] List<AutostartFlag> Flags,
        [property: JsonPropertyName("version")] long Version);

    public sealed record Snapshot(
        [property: JsonPropertyName("machines")] Dictionary<string, MachineEntry> Machines,
        [property: JsonPropertyName("settings")] SentrySettings Settings);

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Snapshot? _snap;

    public FleetAutostartStore(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "local-apps-fleet.json");
    }

    private Snapshot Load()
    {
        if (_snap is not null) return _snap;
        var raw = AtomicJson.Read<Snapshot>(_path, _logger, "AUTOSTART");
        var machines = new Dictionary<string, MachineEntry>(StringComparer.OrdinalIgnoreCase);
        foreach (var (k, v) in raw?.Machines ?? new Dictionary<string, MachineEntry>())
            if (!string.IsNullOrWhiteSpace(k) && v is not null) machines[k] = new MachineEntry(AutostartStore.Clean(new MachineSlice(v.Flags, new SentrySettings(), v.Version, null)).Flags, v.Version);
        return _snap = new Snapshot(machines, (raw?.Settings ?? new SentrySettings()).Normalized());
    }

    public bool Knows(string machine) { lock (_gate) return Load().Machines.ContainsKey(machine); }

    public IReadOnlyList<string> Machines() { lock (_gate) return Load().Machines.Keys.ToList(); }

    public SentrySettings Settings() { lock (_gate) return Load().Settings; }

    /// <summary>What <paramref name="machine"/> must run (empty, version 0, when the hub never wrote it).</summary>
    public MachineSlice Slice(string machine, string from)
    {
        lock (_gate)
        {
            var s = Load();
            return s.Machines.TryGetValue(machine, out var e)
                ? new MachineSlice(e.Flags.ToList(), s.Settings, e.Version, from)
                : new MachineSlice(new List<AutostartFlag>(), s.Settings, 0, from);
        }
    }

    /// <summary>Insert or replace one app's entry on one machine; bumps that machine's version.</summary>
    public long Upsert(string machine, AutostartFlag flag, long now)
    {
        lock (_gate)
        {
            var s = Load();
            var e = s.Machines.TryGetValue(machine, out var cur) ? cur : new MachineEntry(new List<AutostartFlag>(), 0);
            var flags = e.Flags.Where(f => f.Key != flag.Key).Append(flag.Normalized(now)).ToList();
            var version = Math.Max(now, e.Version + 1);
            s.Machines[machine] = new MachineEntry(flags, version);
            AtomicJson.Write(_path, s);
            return version;
        }
    }

    /// <summary>New sentry settings for the whole fleet; bumps every machine's version so each is re-pushed.</summary>
    public SentrySettings SetSettings(SentrySettings settings, long now)
    {
        lock (_gate)
        {
            var s = Load();
            var clean = settings.Normalized();
            var machines = s.Machines.ToDictionary(kv => kv.Key, kv => kv.Value with { Version = Math.Max(now, kv.Value.Version + 1) }, StringComparer.OrdinalIgnoreCase);
            _snap = new Snapshot(machines, clean);
            AtomicJson.Write(_path, _snap);
            return clean;
        }
    }

    /// <summary>Make sure a machine has an entry (so a settings change reaches it), without changing its flags.</summary>
    public void Ensure(string machine, long now)
    {
        lock (_gate)
        {
            var s = Load();
            if (s.Machines.ContainsKey(machine)) return;
            s.Machines[machine] = new MachineEntry(new List<AutostartFlag>(), now);
            AtomicJson.Write(_path, s);
        }
    }
}
