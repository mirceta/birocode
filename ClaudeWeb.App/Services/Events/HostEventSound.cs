using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Events;

/// <summary>
/// Plays an audible cue on the HOST machine whenever the collector receives a new event
/// (openspec changes add-event-feed-collector, add-host-voice-mode). This is the server-side
/// counterpart to the events-app's in-browser blip: it sounds on the computer running the
/// harness, with no browser open.
///
/// Off by default and operator-toggleable; the choice persists across restarts. The cue has a
/// selectable, persisted <see cref="SoundMode"/>: <c>beep</c> (default) plays a short tone,
/// <c>voice</c> instead speaks "an agent has finished" in a soft female voice through the
/// default audio device via Windows SAPI. Debounced so a burst of events collapses to one cue, and played on a
/// background thread so it can never block the poll loop. Every path is best-effort — a host
/// with no audio (or no speech voice) just stays silent, and voice falls back to the beep.
/// </summary>
public class HostEventSound
{
    private const long MinGapMs = 400; // debounce: at most ~2-3 cues/sec on a burst
    private const string VoicePhrase = "an agent has finished";

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
    /// Safe to call from inside the poll path for every event. In voice mode the cue names the
    /// source it came from — "agent {sourceLabel} has finished".</summary>
    public void Notify(string? sourceLabel = null)
    {
        if (!_enabled) return;

        var now = Environment.TickCount64;
        var last = Interlocked.Read(ref _lastBeepTicks);
        if (now - last < MinGapMs) return;                                   // within the debounce window
        if (Interlocked.CompareExchange(ref _lastBeepTicks, now, last) != last) return; // lost the race — someone else cued

        _ = Task.Run(() => Play(sourceLabel));
    }

    /// <summary>Play the host cue immediately, ignoring the enable flag and debounce, in the
    /// currently selected mode — used by the "test" button to verify audio works on the host.
    /// No source, so the voice speaks the generic phrase.</summary>
    public void PlayNow() => _ = Task.Run(() => Play(null));

    // Play the cue for the current mode. Voice speaks a phrase via SAPI; beep plays the
    // Windows notification sound (falling back to Console.Beep). All best-effort: any failure
    // in the voice path falls through to the beep, and a host with no audio stays silent.
    private void Play(string? sourceLabel)
    {
        if (_mode == ModeVoice && TrySpeak(PhraseFor(sourceLabel))) return;
        DoBeep();
    }

    // "agent {label} has finished" when we know the source, else the generic phrase.
    private static string PhraseFor(string? label) =>
        string.IsNullOrWhiteSpace(label) ? VoicePhrase : $"agent {label!.Trim()} has finished";

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

    // Prefer the Windows notification sound (plays through the default audio device, so it's
    // actually audible), and fall back to Console.Beep (legacy PC-speaker tone) if that path
    // is unavailable. Both are best-effort — a host with no audio just stays silent.
    private static void DoBeep()
    {
        try { System.Media.SystemSounds.Asterisk.Play(); return; } catch { /* fall through */ }
        try { Console.Beep(880, 150); } catch { /* no audio device / unsupported host */ }
    }
}
