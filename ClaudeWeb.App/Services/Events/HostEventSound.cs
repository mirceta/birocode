using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Events;

/// <summary>
/// Plays an audible cue on the HOST machine whenever the collector receives a new event
/// (openspec changes add-event-feed-collector, add-host-voice-mode). This is the server-side
/// counterpart to the events-app's in-browser blip: it sounds on the computer running the
/// harness, with no browser open.
///
/// Off by default and operator-toggleable; the choice persists across restarts. The cue is
/// event-determined — a turn.start, a turn.ended and any other type each get their own sound — in
/// both of the selectable, persisted modes: <c>beep</c> (default) plays a distinct short host
/// notification sound per type, <c>voice</c> instead speaks a type-appropriate phrase ("…started"
/// vs "…has finished") in a soft female voice through the default audio device via Windows SAPI.
/// Debounced so a burst of events collapses to one cue, and played on a background thread so it
/// can never block the poll loop. Every path is best-effort — a host with no audio (or no speech
/// voice) just stays silent, and voice falls back to the beep.
/// </summary>
public class HostEventSound
{
    private const long MinGapMs = 400; // debounce: at most ~2-3 cues/sec on a burst

    public const string ModeBeep = "beep";
    public const string ModeVoice = "voice";

    private readonly Logger _logger;
    private readonly string _storePath;
    private readonly string _modePath;

    private volatile bool _enabled;
    private volatile string _mode = ModeBeep;
    private long _lastBeepTicks;

    public HostEventSound(Logger logger)
    {
        _logger = logger;
        _storePath = System.IO.Path.Combine(AppPaths.DataDir, "collector-host-sound");
        _modePath = System.IO.Path.Combine(AppPaths.DataDir, "collector-host-sound-mode");
        try { _enabled = File.Exists(_storePath) && File.ReadAllText(_storePath).Trim() == "1"; }
        catch { /* default off */ }
        try
        {
            // Missing/unknown file ⇒ beep, so an install that predates the mode keeps beeping.
            if (File.Exists(_modePath) && File.ReadAllText(_modePath).Trim() == ModeVoice)
                _mode = ModeVoice;
        }
        catch { /* default beep */ }
    }

    public bool Enabled => _enabled;
    public string Mode => _mode;

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

    /// <summary>Select the cue mode. Unknown values are ignored (mode stays as-is).</summary>
    public void SetMode(string? mode)
    {
        var next = mode?.Trim().ToLowerInvariant();
        if (next != ModeBeep && next != ModeVoice) return;
        _mode = next;
        try
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(_modePath)!);
            File.WriteAllText(_modePath, next);
        }
        catch (Exception ex)
        {
            _logger.Error($"[COLLECTOR] host-sound mode persist failed: {ex.Message}");
        }
        _logger.Info($"[COLLECTOR] host sound mode = {next}");
    }

    /// <summary>Cheap and non-blocking: debounce, then fire one cue on a background thread.
    /// Safe to call from inside the poll path for every event. The cue is event-determined:
    /// beep mode picks a distinct host sound per <paramref name="eventType"/>, and voice mode
    /// speaks a phrase that reflects it — "agent {sourceLabel} started" for a turn.start,
    /// "agent {sourceLabel} has finished" for a turn.ended.</summary>
    public void Notify(string? sourceLabel = null, string? eventType = null)
    {
        if (!_enabled) return;

        var now = Environment.TickCount64;
        var last = Interlocked.Read(ref _lastBeepTicks);
        if (now - last < MinGapMs) return;                                   // within the debounce window
        if (Interlocked.CompareExchange(ref _lastBeepTicks, now, last) != last) return; // lost the race — someone else cued

        _ = Task.Run(() => Play(sourceLabel, eventType));
    }

    /// <summary>Play the host cue immediately, ignoring the enable flag and debounce — used by
    /// the "test" buttons to verify audio works on the host. Plays in <paramref name="mode"/>
    /// when it is a known mode, else the currently selected one, so the operator can audition
    /// beep and voice independently. Uses the canonical "finished" cue (no source label).</summary>
    public void PlayNow(string? mode = null) => _ = Task.Run(() => Play(null, "turn.ended", mode));

    // Play the event-determined cue. Voice speaks a type-appropriate phrase via SAPI; beep plays
    // a type-appropriate Windows notification sound (falling back to Console.Beep). An optional
    // modeOverride lets the test buttons force a mode. All best-effort: any failure in the voice
    // path falls through to the beep, and a host with no audio stays silent.
    private void Play(string? sourceLabel, string? eventType, string? modeOverride = null)
    {
        var mode = modeOverride == ModeBeep || modeOverride == ModeVoice ? modeOverride : _mode;
        if (mode == ModeVoice && TrySpeak(PhraseFor(sourceLabel, eventType))) return;
        DoBeep(eventType);
    }

    // Event-determined phrase: "started" for a turn.start, "has finished" for a turn.ended, a
    // neutral phrase otherwise; naming the source when we know it, else "an agent".
    private static string PhraseFor(string? label, string? eventType)
    {
        var who = string.IsNullOrWhiteSpace(label) ? "an agent" : $"agent {label!.Trim()}";
        return eventType switch
        {
            "turn.start" => $"{who} started",
            "turn.ended" => $"{who} has finished",
            _            => $"{who} sent an event",
        };
    }

    // Speak the phrase through the default audio device using the OS SAPI voice (SpVoice via
    // COM — no NuGet dependency). Tuned to sound soft and soothing: prefer a female voice
    // (e.g. Zira) and slow the rate slightly, with natural intonation (no pitch shift).
    // Returns false on any failure so the caller can fall back to the beep.
    private bool TrySpeak(string phrase)
    {
        try
        {
            var t = Type.GetTypeFromProgID("SAPI.SpVoice");
            if (t == null) return false;
            dynamic? voice = Activator.CreateInstance(t);
            if (voice == null) return false;
            try
            {
                try
                {
                    dynamic females = voice.GetVoices("Gender=Female", "");   // pick a female voice if present
                    if (females.Count > 0) voice.Voice = females.Item(0);
                }
                catch { /* no female voice available — keep the default */ }
                voice.Rate = -1;                                              // slightly slower = calmer
                voice.Speak(phrase, 0);                                       // 0 = default flags, natural delivery
            }
            finally
            {
                System.Runtime.InteropServices.Marshal.FinalReleaseComObject(voice);
            }
            return true;
        }
        catch { return false; }                                              // no voice / no audio / COM unavailable
    }

    // Event-determined and audible: a distinct Windows notification sound per event type, each
    // routed through the default audio device so it actually sounds. Console.Beep (legacy
    // PC-speaker tone) is the fallback only — often inaudible on modern machines — but still
    // type-shaped (rising for start, resolving for finish) so the two stay distinguishable.
    // Both are best-effort — a host with no audio just stays silent.
    private static void DoBeep(string? eventType)
    {
        try
        {
            switch (eventType)
            {
                case "turn.start": System.Media.SystemSounds.Asterisk.Play(); return;
                case "turn.ended": System.Media.SystemSounds.Exclamation.Play(); return;
                default:           System.Media.SystemSounds.Beep.Play(); return;
            }
        }
        catch { /* fall through to the PC-speaker tone */ }
        try
        {
            switch (eventType)
            {
                case "turn.start": Console.Beep(660, 110); Console.Beep(988, 140); break; // rising query
                case "turn.ended": Console.Beep(988, 110); Console.Beep(660, 150); break; // resolving fall
                default:           Console.Beep(880, 150); break;
            }
        }
        catch { /* no audio device / unsupported host */ }
    }
}
