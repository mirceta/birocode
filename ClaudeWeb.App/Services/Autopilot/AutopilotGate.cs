using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The operator-only master switch for the loop-autopilot API
/// (plans/loop-autopilot.md, plans/loop-autopilot-safety.md). Mirrors the
/// IP-allowlist asymmetry (plans/auth-ip-filter.md): the host can turn the
/// autopilot endpoints off/on, but the web surface can only *see + shrink*,
/// never *grow*.
///
/// SECURITY INVARIANT: <see cref="Enable"/>/<see cref="Disable"/> must only ever
/// be called from the desktop GUI (the WinForms host). No controller may expose
/// an endpoint that flips this — otherwise a steered web client or a
/// prompt-injected autopilot brain could grant itself the ability to act, which
/// is exactly the confused-deputy risk this gate exists to fence. Do not add a
/// POST/enable endpoint. Ever.
///
/// Default is <b>OFF</b> (secure by default): on a fresh install the autopilot
/// endpoints return 403 and the engine is idle until the operator physically
/// opts in at the host. Persisted to <c>%APPDATA%\ClaudeWeb\autopilot-gate.json</c>.
/// </summary>
public sealed class AutopilotGate
{
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private bool _enabled;

    /// <summary>Raised after the gate flips, so the host UI can refresh its label.</summary>
    public event Action? Changed;

    public AutopilotGate(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "autopilot-gate.json");
        _enabled = Load();
    }

    /// <summary>Whether the autopilot endpoints + engine are live. Web-readable.</summary>
    public bool Enabled
    {
        get { lock (_gate) return _enabled; }
    }

    /// <summary>HOST-ONLY. Turns the autopilot endpoints + engine on.</summary>
    public void Enable() => Set(true);

    /// <summary>HOST-ONLY. Turns the autopilot endpoints + engine off (403 + idle).</summary>
    public void Disable() => Set(false);

    /// <summary>HOST-ONLY. Flips the gate. Convenience for a single toggle control.</summary>
    public bool Toggle()
    {
        bool now;
        lock (_gate) now = !_enabled;
        Set(now);
        return now;
    }

    private void Set(bool on)
    {
        lock (_gate)
        {
            if (_enabled == on) return;
            _enabled = on;
            Save(on);
        }
        _logger.Info($"[AUTOPILOT] Operator gate {(on ? "ENABLED" : "DISABLED")} from the host.");
        Changed?.Invoke();
    }

    private bool Load()
    {
        try
        {
            if (!File.Exists(_path)) return false; // default OFF
            using var doc = JsonDocument.Parse(File.ReadAllText(_path));
            return doc.RootElement.TryGetProperty("enabled", out var e) && e.GetBoolean();
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] Failed to read {_path}: {ex.Message}. Defaulting to OFF.");
            return false;
        }
    }

    // Atomic temp+rename so a crash mid-write never leaves a torn file.
    private void Save(bool on)
    {
        try
        {
            var json = JsonSerializer.Serialize(new { enabled = on });
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, json);
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] Failed to persist gate to {_path}: {ex.Message}");
        }
    }
}
