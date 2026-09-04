using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// Persisted autopilot settings (plans/loop-autopilot.md, plans/loop-autopilot-safety.md):
/// the global kill switch, the confidence threshold the brain must clear, the set of
/// per-agent "armed" repos. (The word deny-list was removed 2026-09-03, openspec remove-deny-fence.) Stored at
/// %APPDATA%\ClaudeWeb\autopilot.json with the same atomic temp+rename write and
/// never-reseed-on-unreadable load guard as <see cref="Notes.NotesService"/>.
///
/// Slice 2 is suggest-only, so "armed" means "predict + pre-fill for this agent",
/// not "auto-send" — but the same gate (threshold + kill switch) is
/// what Slice 3 will reuse to decide whether to actually send.
/// </summary>
public class AutopilotConfigStore
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    // The suggestion kind's classifier selection (fix-suggestion-loop-inert, D5):
    // "cli" = the one-shot Claude CLI classifier (the ship default — it is what
    // makes drive-mode suggestion sends actually reachable); "stub" = the
    // deterministic word-overlap matcher, kept as the fallback setting.
    public const string BrainCli = "cli";
    public const string BrainStub = "stub";
    public const string DefaultBrainModel = "haiku";

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
        // Additive (fix-suggestion-loop-inert, D5): absent in old files → defaults.
        public string? Brain { get; set; }
        public string? BrainModel { get; set; }
    }

    public sealed record Snapshot(bool Enabled, bool AutoAdvance, double Threshold,
        IReadOnlySet<string> ArmedRepoIds,
        string Brain, string BrainModel);

    public Snapshot Get()
    {
        lock (_gate)
            return new Snapshot(_data.Enabled, _data.AutoAdvance, _data.Threshold,
                _data.ArmedRepoIds.ToHashSet(),
                CleanBrain(_data.Brain), string.IsNullOrWhiteSpace(_data.BrainModel) ? DefaultBrainModel : _data.BrainModel!.Trim());
    }

    // Only the two known values; anything else (including null) is the default.
    private static string CleanBrain(string? brain) =>
        string.Equals(brain, BrainStub, StringComparison.OrdinalIgnoreCase) ? BrainStub : BrainCli;

    /// <summary>Selects the suggestion classifier ("stub" | "cli").</summary>
    public void SetBrain(string brain)
    {
        lock (_gate) { _data.Brain = CleanBrain(brain); Save(); }
        _logger.Info($"[AUTOPILOT] brain -> {CleanBrain(brain)}");
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

    /// <summary>Auto-advance is now the DEFAULT MODE preference for newly armed
    /// suggestion loop instances (openspec: unify-loop-types, revision 2 — the
    /// per-instance suggest/drive mode is the real switch; the controller also flips
    /// armed suggestion instances when this toggles, so the console toggle keeps its
    /// old meaning).</summary>
    public void SetAutoAdvance(bool on)
    {
        lock (_gate) { _data.AutoAdvance = on; Save(); }
        _logger.Info($"[AUTOPILOT] auto-advance default -> {on}");
    }

    /// <summary>One-time cleanup: clears the legacy per-repo arming list so this
    /// store holds only global engine settings and the cleanup never repeats.
    /// Nothing is armed from it (openspec: fix-loop-arm-freshness — loops are
    /// armed only by explicit user action).</summary>
    public void ClearLegacyArming()
    {
        lock (_gate)
        {
            if (_data.ArmedRepoIds.Count == 0) return;
            _data.ArmedRepoIds.Clear();
            Save();
        }
        _logger.Info("[AUTOPILOT] legacy ArmedRepoIds cleared (nothing armed — loops arm only by user action)");
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var data = JsonSerializer.Deserialize<Data>(File.ReadAllText(_path));
            if (data is null) return;
            data.ArmedRepoIds ??= new();
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
