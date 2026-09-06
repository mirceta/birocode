using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch agent's durable harness-side state (openspec: add-arch-agent, D2/D9):
/// the managed set the Operator picked, the collector watermark the arch loop
/// reads past, and the last arch session id (so the conversation survives a
/// disarm/re-arm). One file next to the loop store: <c>arch.json</c> under the
/// data dir. Everything the arch agent itself writes lives in its HOME REPO, not
/// here — this file is the harness's, the home repo is the agent's.
/// </summary>
public class ArchStateStore
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private readonly object _gate = new();
    private readonly string _path;
    private readonly Logger _logger;
    private Data _data = new();

    private sealed class Data
    {
        public List<string> ManagedRepoIds { get; set; } = new();
        // Managed agents on OTHER harnesses (openspec add-fleet-arch-agent, D3):
        // keys "<collector source id>/<repo id on that harness>".
        public List<string> ManagedFleet { get; set; } = new();
        // Whether THIS harness lets a fleet arch on another harness send tasks to
        // its repo agents (receiving-side opt-in, default off).
        public bool AcceptFleetSends { get; set; }
        // Whether THIS harness lets a fleet arch elsewhere (or the operator through
        // it) upgrade this harness to a ref (openspec arch-peer-upgrades). Default off.
        public bool AcceptFleetUpgrades { get; set; }
        // Collector seq the arch loop has consumed up to. -1 = never set: the
        // next arm starts it at the collector's current last seq (no replay).
        public int Watermark { get; set; } = -1;
        public string? LastSessionId { get; set; }
        // The standing wake loop the Operator had armed (openspec arch-driven-loops):
        // remembered when a driven kind takes the @arch slot, restored when it ends,
        // cleared by the Operator's own Stop. Null mode = nothing remembered.
        public string? StandingLoopMode { get; set; }
        public int StandingLoopCap { get; set; }
        // The quiet floor for driven loops on @arch (openspec arch-driven-loops): a repeat
        // of the same prompt goes out after this many seconds even with no wake. 0 = default.
        public int DrivenQuietSeconds { get; set; }
        // The claimed rule's activity window (openspec arch-branch-handover): minutes after
        // the last human turn during which an unassigned branch stays claimed. 0 = default (2 h).
        public int ClaimWindowMinutes { get; set; }
    }

    /// <summary>The managed-set key of an agent on a subscribed harness.</summary>
    public static string FleetKey(string sourceId, string repoId) => sourceId + "/" + repoId;

    /// <summary>Splits a fleet key back into (sourceId, repoId); null when the
    /// string is not a fleet key (a bare local repo id has no slash).</summary>
    public static (string SourceId, string RepoId)? ParseFleetKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return null;
        var idx = key.IndexOf('/');
        if (idx <= 0 || idx == key.Length - 1) return null;
        return (key[..idx], key[(idx + 1)..]);
    }

    public string FilePath => _path;

    public ArchStateStore(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "arch.json");
        Load();
    }

    public IReadOnlyList<string> ManagedRepoIds
    {
        get { lock (_gate) return _data.ManagedRepoIds.ToList(); }
    }

    public IReadOnlyList<string> ManagedFleet
    {
        get { lock (_gate) return _data.ManagedFleet.ToList(); }
    }

    public bool AcceptFleetSends
    {
        get { lock (_gate) return _data.AcceptFleetSends; }
    }

    public void SetManagedFleet(IEnumerable<string> keys)
    {
        lock (_gate)
        {
            _data.ManagedFleet = keys
                .Where(k => ParseFleetKey(k) is not null)
                .Select(k => k.Trim())
                .Distinct(StringComparer.Ordinal)
                .ToList();
            Save();
        }
    }

    public void SetAcceptFleetSends(bool accept)
    {
        lock (_gate)
        {
            if (_data.AcceptFleetSends == accept) return;
            _data.AcceptFleetSends = accept;
            Save();
        }
    }

    public bool AcceptFleetUpgrades
    {
        get { lock (_gate) return _data.AcceptFleetUpgrades; }
    }

    public void SetAcceptFleetUpgrades(bool accept)
    {
        lock (_gate)
        {
            if (_data.AcceptFleetUpgrades == accept) return;
            _data.AcceptFleetUpgrades = accept;
            Save();
        }
    }

    public int Watermark
    {
        get { lock (_gate) return _data.Watermark; }
    }

    public string? LastSessionId
    {
        get { lock (_gate) return _data.LastSessionId; }
    }

    public void SetManaged(IEnumerable<string> repoIds)
    {
        lock (_gate)
        {
            _data.ManagedRepoIds = repoIds
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .Distinct(StringComparer.Ordinal)
                .ToList();
            Save();
        }
    }

    /// <summary>The remembered standing wake loop (mode, cap), or null.</summary>
    public (string Mode, int Cap)? StandingLoop
    {
        get { lock (_gate) return _data.StandingLoopMode is { } m ? (m, _data.StandingLoopCap) : null; }
    }

    public void SetStandingLoop(string mode, int cap)
    {
        lock (_gate)
        {
            if (_data.StandingLoopMode == mode && _data.StandingLoopCap == cap) return;
            _data.StandingLoopMode = mode;
            _data.StandingLoopCap = cap;
            Save();
        }
    }

    public void ClearStandingLoop()
    {
        lock (_gate)
        {
            if (_data.StandingLoopMode is null) return;
            _data.StandingLoopMode = null;
            _data.StandingLoopCap = 0;
            Save();
        }
    }

    /// <summary>Seconds of silence after which a driven @arch loop re-prompts without a
    /// wake; 0 means the policy default.</summary>
    public int DrivenQuietSeconds
    {
        get { lock (_gate) return _data.DrivenQuietSeconds; }
    }

    public void SetDrivenQuietSeconds(int seconds)
    {
        var clean = Math.Clamp(seconds, 0, 24 * 3600);
        lock (_gate)
        {
            if (_data.DrivenQuietSeconds == clean) return;
            _data.DrivenQuietSeconds = clean;
            Save();
        }
    }

    /// <summary>Minutes after the last human turn during which an unassigned branch stays
    /// claimed (openspec arch-branch-handover); 0 means the policy default.</summary>
    public int ClaimWindowMinutes
    {
        get { lock (_gate) return _data.ClaimWindowMinutes; }
    }

    public void SetClaimWindowMinutes(int minutes)
    {
        var clean = Math.Clamp(minutes, 0, 14 * 24 * 60);
        lock (_gate)
        {
            if (_data.ClaimWindowMinutes == clean) return;
            _data.ClaimWindowMinutes = clean;
            Save();
        }
    }

    public void SetWatermark(int seq)
    {
        lock (_gate)
        {
            if (_data.Watermark == seq) return;
            _data.Watermark = seq;
            Save();
        }
    }

    public void SetLastSessionId(string? sessionId)
    {
        lock (_gate)
        {
            var clean = string.IsNullOrWhiteSpace(sessionId) ? null : sessionId.Trim();
            if (_data.LastSessionId == clean) return;
            _data.LastSessionId = clean;
            Save();
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var data = JsonSerializer.Deserialize<Data>(File.ReadAllText(_path));
            if (data is null) return;
            data.ManagedRepoIds ??= new();
            data.ManagedFleet ??= new();
            _data = data;
        }
        catch (Exception ex)
        {
            _logger.Error($"[ARCH] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic temp+rename, like the loop store.
    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_data, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[ARCH] Failed to save {_path}: {ex.Message}");
        }
    }
}
