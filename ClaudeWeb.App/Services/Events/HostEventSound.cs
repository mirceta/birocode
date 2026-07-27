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
///
/// The cue is additionally rule-driven (openspec change add-host-event-sound-rules): each
/// recognized slot (turn.start, turn.ended, _default — the browser grid's taxonomy) can carry an
/// operator-uploaded audio file stored under the data dir. An assigned file wins over both modes
/// for its slot; an unknown event type uses the _default slot's file when present. Slots without
/// a file keep the mode-determined built-in cue, and an unplayable file falls back to it.
/// </summary>
public class HostEventSound
{
    private const long MinGapMs = 400; // debounce: at most ~2-3 cues/sec on a burst

    public const string ModeBeep = "beep";
    public const string ModeVoice = "voice";

    public const string SlotDefault = "_default";
    public static readonly string[] Slots = { "turn.start", "turn.ended", SlotDefault };
    public static readonly string[] AllowedExtensions = { ".wav", ".mp3" };
    public const int MaxRuleBytes = 2 * 1024 * 1024;

    public sealed record RuleView(string Slot, bool HasCustom, string? FileName);

    private readonly Logger _logger;
    private readonly string _storePath;
    private readonly string _modePath;
    private readonly string _cuesDir;

    private volatile bool _enabled;
    private volatile string _mode = ModeBeep;
    private long _lastBeepTicks;

    // slot -> (audio file path, original file name for display). Swapped as a whole under
    // _rulesLock; the play path reads the current reference lock-free.
    private readonly object _rulesLock = new();
    private volatile Dictionary<string, (string Path, string Name)> _rules = new();

    public HostEventSound(Logger logger)
    {
        _logger = logger;
        _storePath = System.IO.Path.Combine(AppPaths.DataDir, "collector-host-sound");
        _modePath = System.IO.Path.Combine(AppPaths.DataDir, "collector-host-sound-mode");
        _cuesDir = System.IO.Path.Combine(AppPaths.DataDir, "collector-host-cues");
        try { _enabled = File.Exists(_storePath) && File.ReadAllText(_storePath).Trim() == "1"; }
        catch { /* default off */ }
        try
        {
            // Missing/unknown file ⇒ beep, so an install that predates the mode keeps beeping.
            if (File.Exists(_modePath) && File.ReadAllText(_modePath).Trim() == ModeVoice)
                _mode = ModeVoice;
        }
        catch { /* default beep */ }
        LoadRules();
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

    // -- event → sound rules -----------------------------------------------------------------

    /// <summary>The table, one row per recognized slot — display data only, never the bytes.</summary>
    public IReadOnlyList<RuleView> ListRules()
    {
        var rules = _rules;
        return Slots.Select(s => rules.TryGetValue(s, out var r)
            ? new RuleView(s, true, r.Name)
            : new RuleView(s, false, null)).ToList();
    }

    /// <summary>Assign (or replace) a slot's custom audio. Throws <see cref="ArgumentException"/>
    /// with an operator-readable message on an unknown slot, disallowed extension, or oversize
    /// payload — the controller surfaces it as a 400.</summary>
    public void AssignRule(string? slot, byte[] bytes, string? originalName)
    {
        slot = NormalizeSlot(slot);
        var ext = System.IO.Path.GetExtension(originalName ?? "").ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext))
            throw new ArgumentException($"Unsupported audio format '{ext}' — use {string.Join(" or ", AllowedExtensions)}.");
        if (bytes.Length == 0 || bytes.Length > MaxRuleBytes)
            throw new ArgumentException($"Audio file must be 1 byte – {MaxRuleBytes / (1024 * 1024)} MB.");

        lock (_rulesLock)
        {
            Directory.CreateDirectory(_cuesDir);
            DeleteRuleFiles(slot);                                   // drop any other-extension leftover
            var path = System.IO.Path.Combine(_cuesDir, slot + ext);
            File.WriteAllBytes(path, bytes);
            File.WriteAllText(NamePathFor(slot), originalName!.Trim());
            var next = new Dictionary<string, (string, string)>(_rules) { [slot] = (path, originalName!.Trim()) };
            _rules = next;
        }
        _logger.Info($"[COLLECTOR] host cue rule set: {slot} = {originalName} ({bytes.Length} bytes)");
    }

    /// <summary>Clear a slot back to the built-in cue. Unknown slots throw like AssignRule.</summary>
    public void ClearRule(string? slot)
    {
        slot = NormalizeSlot(slot);
        lock (_rulesLock)
        {
            DeleteRuleFiles(slot);
            var next = new Dictionary<string, (string, string)>(_rules);
            next.Remove(slot);
            _rules = next;
        }
        _logger.Info($"[COLLECTOR] host cue rule cleared: {slot}");
    }

    private static string NormalizeSlot(string? slot)
    {
        var s = slot?.Trim();
        if (s == null || !Slots.Contains(s))
            throw new ArgumentException($"Unknown sound slot '{slot}' — expected one of: {string.Join(", ", Slots)}.");
        return s;
    }

    private string NamePathFor(string slot) => System.IO.Path.Combine(_cuesDir, slot + ".name");

    private void DeleteRuleFiles(string slot)
    {
        foreach (var ext in AllowedExtensions)
        {
            var p = System.IO.Path.Combine(_cuesDir, slot + ext);
            try { if (File.Exists(p)) File.Delete(p); } catch { /* best-effort; replaced below anyway */ }
        }
        try { if (File.Exists(NamePathFor(slot))) File.Delete(NamePathFor(slot)); } catch { }
    }

    // Rebuild the table from disk — the files ARE the persistence (mirrors the one-value-per-file
    // style of the toggle and mode above), so assigned sounds survive restarts with no registry.
    private void LoadRules()
    {
        var rules = new Dictionary<string, (string, string)>();
        try
        {
            foreach (var slot in Slots)
            {
                var path = AllowedExtensions
                    .Select(ext => System.IO.Path.Combine(_cuesDir, slot + ext))
                    .FirstOrDefault(File.Exists);
                if (path == null) continue;
                string name;
                try { name = File.ReadAllText(NamePathFor(slot)).Trim(); }
                catch { name = System.IO.Path.GetFileName(path); }
                rules[slot] = (path, string.IsNullOrWhiteSpace(name) ? System.IO.Path.GetFileName(path) : name);
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[COLLECTOR] host cue rules load failed: {ex.Message}");
        }
        _rules = rules;
    }

    // The slot whose custom file should sound for this event type, mirroring the browser's
    // playCue precedence: the type's own file; else, for types with no slot of their own,
    // the _default file. A typed slot with no file falls through to its built-in cue (null).
    private (string Path, string Name)? RuleFor(string? eventType)
    {
        var rules = _rules;
        var type = eventType ?? "";
        if (rules.TryGetValue(type, out var own)) return own;
        if (!Slots.Contains(type) && rules.TryGetValue(SlotDefault, out var def)) return def;
        return null;
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

    /// <summary>Play, right now and toggle-ignoring, exactly what a live event of this slot's
    /// type would play — the assigned custom file when there is one, else the built-in cue in
    /// the current mode. Backs the per-slot "test" endpoint. Unknown slots throw.</summary>
    public void PlayEffectiveNow(string? slot)
    {
        var s = NormalizeSlot(slot);
        // "_default" is not a real event type; any unmapped type string exercises that path.
        _ = Task.Run(() => Play(null, s == SlotDefault ? "test.other" : s));
    }

    // Play the cue for this event. An assigned custom file for the type wins over both modes;
    // otherwise voice speaks a type-appropriate phrase via SAPI and beep plays a type-appropriate
    // Windows notification sound (falling back to Console.Beep). An optional modeOverride lets
    // the mode test buttons force a mode (bypassing the custom file — they audition the modes).
    // All best-effort: an unplayable file and a failing voice both fall through to the beep, and
    // a host with no audio stays silent.
    private void Play(string? sourceLabel, string? eventType, string? modeOverride = null)
    {
        var forced = modeOverride == ModeBeep || modeOverride == ModeVoice;
        if (!forced && RuleFor(eventType) is { } rule)
        {
            if (TryPlayFile(rule.Path)) return;
            _logger.Error($"[COLLECTOR] host cue file failed, using built-in: {rule.Name}");
        }
        var mode = forced ? modeOverride : _mode;
        if (mode == ModeVoice && TrySpeak(PhraseFor(sourceLabel, eventType))) return;
        DoBeep(eventType);
    }

    [System.Runtime.InteropServices.DllImport("winmm.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    private static extern int mciSendString(string command, System.Text.StringBuilder? ret, int retLength, IntPtr callback);

    // Play an operator-uploaded audio file (wav or mp3) through the default device via MCI —
    // an inbox Windows API, so no package dependency (same spirit as SAPI via COM above).
    // Runs on the cue's background thread; "wait" holds only that thread for the clip length,
    // and the debounce keeps concurrent clips ≈1. False on any failure so callers fall back.
    private static bool TryPlayFile(string path)
    {
        var alias = "hostcue" + Environment.TickCount64;
        try
        {
            if (mciSendString($"open \"{path}\" alias {alias}", null, 0, IntPtr.Zero) != 0) return false;
            try { return mciSendString($"play {alias} wait", null, 0, IntPtr.Zero) == 0; }
            finally { mciSendString($"close {alias}", null, 0, IntPtr.Zero); }
        }
        catch { return false; }                                      // winmm missing / non-Windows host
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
