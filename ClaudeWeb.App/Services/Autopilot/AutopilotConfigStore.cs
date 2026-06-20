using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// Persisted autopilot settings (plans/loop-autopilot.md, plans/loop-autopilot-safety.md):
/// the global kill switch, the confidence threshold the brain must clear, the set of
/// per-agent "armed" repos, and the risky-action deny-list. Stored at
/// %APPDATA%\ClaudeWeb\autopilot.json with the same atomic temp+rename write and
/// never-reseed-on-unreadable load guard as <see cref="Notes.NotesService"/>.
///
/// Slice 2 is suggest-only, so "armed" means "predict + pre-fill for this agent",
/// not "auto-send" — but the same gate (threshold + deny-list + kill switch) is
/// what Slice 3 will reuse to decide whether to actually send.
/// </summary>
public class AutopilotConfigStore
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    // Default risky-action fence: a routine prompt whose label hits one of these is
    // never auto-advanced — it always escalates (plans/loop-autopilot-safety.md).
    private static readonly string[] DefaultDenyList =
        { "deploy", "push", "force", "reset --hard", "delete", "drop", "prod", "overwrite", "merge" };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Data _data = new();

    public AutopilotConfigStore(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "autopilot.json");
        Load();
    }

    // On-disk shape. Defaults are chosen so a fresh install is SAFE: the engine is
    // enabled (the kill switch is "on" = not killed) but no agent is armed, so it
    // does nothing until the user arms one.
    private sealed class Data
    {
        public bool Enabled { get; set; } = true;          // global kill switch (false = killed)
        public bool AutoAdvance { get; set; } = false;      // Slice 3: actually SEND, not just suggest. OFF by default.
        public double Threshold { get; set; } = 0.85;       // min confidence to suggest, else escalate
        public List<string> ArmedRepoIds { get; set; } = new();
        public List<string> DenyList { get; set; } = DefaultDenyList.ToList();
    }

    public sealed record Snapshot(bool Enabled, bool AutoAdvance, double Threshold, IReadOnlySet<string> ArmedRepoIds, IReadOnlyList<string> DenyList);

    public Snapshot Get()
    {
        lock (_gate)
            return new Snapshot(_data.Enabled, _data.AutoAdvance, _data.Threshold,
                _data.ArmedRepoIds.ToHashSet(), _data.DenyList.ToList());
    }

    public bool IsArmed(string repoId)
    {
        lock (_gate) return _data.ArmedRepoIds.Contains(repoId);
    }

    /// <summary>Arms/disarms one agent (repo). No-op repeats are harmless.</summary>
    public void SetArmed(string repoId, bool on)
    {
        lock (_gate)
        {
            var has = _data.ArmedRepoIds.Contains(repoId);
            if (on && !has) _data.ArmedRepoIds.Add(repoId);
            else if (!on && has) _data.ArmedRepoIds.Remove(repoId);
            else return;
            Save();
        }
        _logger.Info($"[AUTOPILOT] {(on ? "armed" : "disarmed")} {repoId}");
    }

    /// <summary>Sets the confidence threshold (clamped to 0.50–0.99).</summary>
    public void SetThreshold(double threshold)
    {
        lock (_gate) { _data.Threshold = Math.Clamp(threshold, 0.50, 0.99); Save(); }
    }

    /// <summary>The kill switch. false = killed (everything reverts to manual).</summary>
    public void SetEnabled(bool enabled)
    {
        lock (_gate) { _data.Enabled = enabled; Save(); }
        _logger.Info($"[AUTOPILOT] kill switch -> enabled={enabled}");
    }

    /// <summary>Slice 3 auto-advance. true = a confident, non-risky suggestion is
    /// actually SENT to the agent; false = suggest-only (Slice 2 behaviour).</summary>
    public void SetAutoAdvance(bool on)
    {
        lock (_gate) { _data.AutoAdvance = on; Save(); }
        _logger.Info($"[AUTOPILOT] auto-advance -> {on}");
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var data = JsonSerializer.Deserialize<Data>(File.ReadAllText(_path));
            if (data is null) return;
            data.ArmedRepoIds ??= new();
            if (data.DenyList is null || data.DenyList.Count == 0) data.DenyList = DefaultDenyList.ToList();
            _data = data;
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic temp+rename — a kill mid-write can't truncate it.
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
            _logger.Error($"[AUTOPILOT] Failed to save {_path}: {ex.Message}");
        }
    }
}
