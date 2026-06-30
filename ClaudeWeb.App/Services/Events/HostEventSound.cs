using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Events;

/// <summary>
/// Plays a short beep on the HOST machine whenever the collector receives a new event
/// (openspec change add-event-feed-collector). This is the server-side counterpart to the
/// events-app's in-browser blip: it sounds on the computer running the harness, with no
/// browser open.
///
/// Off by default and operator-toggleable; the choice persists across restarts. Debounced
/// so a burst of events collapses to one beep, and played on a background thread so it can
/// never block the poll loop. Uses pure-BCL <see cref="Console.Beep(int,int)"/> (audible on
/// the host's default audio device on Windows) and swallows any failure (e.g. no audio
/// device) so sound is always best-effort.
/// </summary>
public class HostEventSound
{
    private const long MinGapMs = 400; // debounce: at most ~2-3 beeps/sec on a burst

    private readonly Logger _logger;
    private readonly string _storePath;

    private volatile bool _enabled;
    private long _lastBeepTicks;

    public HostEventSound(Logger logger)
    {
        _logger = logger;
        _storePath = System.IO.Path.Combine(AppPaths.DataDir, "collector-host-sound");
        try { _enabled = File.Exists(_storePath) && File.ReadAllText(_storePath).Trim() == "1"; }
        catch { /* default off */ }
    }

    public bool Enabled => _enabled;

    public void SetEnabled(bool on)
    {
        _enabled = on;
        try
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(_storePath)!);
            File.WriteAllText(_storePath, on ? "1" : "0");
        }
        catch (Exception ex)
        {
            _logger.Error($"[COLLECTOR] host-sound persist failed: {ex.Message}");
        }
        _logger.Info($"[COLLECTOR] host sound {(on ? "enabled" : "disabled")}");
    }

    /// <summary>Cheap and non-blocking: debounce, then fire one beep on a background thread.
    /// Safe to call from inside the poll path for every event.</summary>
    public void Notify()
    {
        if (!_enabled) return;

        var now = Environment.TickCount64;
        var last = Interlocked.Read(ref _lastBeepTicks);
        if (now - last < MinGapMs) return;                                   // within the debounce window
        if (Interlocked.CompareExchange(ref _lastBeepTicks, now, last) != last) return; // lost the race — someone else beeped

        _ = Task.Run(static () =>
        {
            try { Console.Beep(880, 120); } catch { /* no audio device / unsupported host */ }
        });
    }
}
