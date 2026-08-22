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
/// recognized slot (turn.start, turn.ended, chat.focus, _default — the browser grid's taxonomy) can carry an
/// operator-uploaded audio file stored under the data dir. An assigned file wins over both modes
/// for its slot; an unknown event type uses the _default slot's file when present. Slots without
/// a file keep the mode-determined built-in cue, and an unplayable file falls back to it.
///
/// Rules additionally scope PER REPOSITORY (openspec change repo-sounds-and-latency), layered
/// over the global slot table: a repo can carry its own file per slot, and its _default slot —
/// unlike the global one — covers ANY event type from that repo, so one upload gives the whole
/// repo a distinctive voice. Resolution: repo(type) → repo(_default) → global(type) →
/// global(_default, unknown types only) → built-in mode cue. Repo files live under
/// collector-host-cues/repos/&lt;key&gt;/, where &lt;key&gt; is a sanitized+hashed form of the
/// repo name and a .repo sidecar holds the exact name.
/// </summary>
public class HostEventSound
{
    private const long MinGapMs = 400; // debounce: at most ~2-3 cues/sec on a burst

    public const string ModeBeep = "beep";
    public const string ModeVoice = "voice";

    public const string SlotDefault = "_default";
    public static readonly string[] Slots = { "turn.start", "turn.ended", "chat.focus", SlotDefault };
    public static readonly string[] AllowedExtensions = { ".wav", ".mp3" };
    public const int MaxRuleBytes = 2 * 1024 * 1024;

    public sealed record RuleView(string Slot, bool HasCustom, string? FileName);
    public sealed record RepoRulesView(string Repo, IReadOnlyList<RuleView> Rules);

    private readonly Logger _logger;
    private readonly string _storePath;
    private readonly string _modePath;
    private readonly string _cuesDir;
    private readonly string _reposDir;

    private volatile bool _enabled;
    private volatile string _mode = ModeBeep;
    private long _lastBeepTicks;

    // slot -> (audio file path, original file name for display). Swapped as a whole under
    // _rulesLock; the play path reads the current reference lock-free. _repoRules is the
    // repo scope layered over it: exact repo name -> its own slot table, same swap discipline.
    private readonly object _rulesLock = new();
    private volatile Dictionary<string, (string Path, string Name)> _rules = new();
    private volatile Dictionary<string, Dictionary<string, (string Path, string Name)>> _repoRules = new();

    // dataDir override exists for tests (a throwaway temp dir); the harness always
    // passes nothing and gets AppPaths.DataDir.
    public HostEventSound(Logger logger, string? dataDir = null)
    {
        _logger = logger;
        var baseDir = dataDir ?? AppPaths.DataDir;
        _storePath = System.IO.Path.Combine(baseDir, "collector-host-sound");
        _modePath = System.IO.Path.Combine(baseDir, "collector-host-sound-mode");
        _cuesDir = System.IO.Path.Combine(baseDir, "collector-host-cues");
        _reposDir = System.IO.Path.Combine(_cuesDir, "repos");
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

    /// <summary>The global table, one row per recognized slot — display data only, never the bytes.</summary>
    public IReadOnlyList<RuleView> ListRules()
    {
        var rules = _rules;
        return Slots.Select(s => rules.TryGetValue(s, out var r)
            ? new RuleView(s, true, r.Name)
            : new RuleView(s, false, null)).ToList();
    }

    /// <summary>Every repo scope that has at least one rule, each with its full slot table.</summary>
    public IReadOnlyList<RepoRulesView> ListRepoRules()
    {
        var repoRules = _repoRules;
        return repoRules.OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .Select(kv => new RepoRulesView(kv.Key, Slots.Select(s => kv.Value.TryGetValue(s, out var r)
                ? new RuleView(s, true, r.Name)
                : new RuleView(s, false, null)).ToList() as IReadOnlyList<RuleView>))
            .ToList();
    }

    /// <summary>Assign (or replace) a slot's custom audio — in the global scope, or in
    /// <paramref name="repo"/>'s scope when given (openspec repo-sounds-and-latency).
    /// Throws <see cref="ArgumentException"/> with an operator-readable message on an
    /// unknown slot, bad repo name, disallowed extension, or oversize payload — the
    /// controller surfaces it as a 400.</summary>
    public void AssignRule(string? slot, byte[] bytes, string? originalName, string? repo = null)
    {
        slot = NormalizeSlot(slot);
        repo = NormalizeRepo(repo);
        var ext = System.IO.Path.GetExtension(originalName ?? "").ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext))
            throw new ArgumentException($"Unsupported audio format '{ext}' — use {string.Join(" or ", AllowedExtensions)}.");
        if (bytes.Length == 0 || bytes.Length > MaxRuleBytes)
            throw new ArgumentException($"Audio file must be 1 byte – {MaxRuleBytes / (1024 * 1024)} MB.");

        lock (_rulesLock)
        {
            var dir = repo is null ? _cuesDir : RepoDirFor(repo);
            Directory.CreateDirectory(dir);
            if (repo is not null) File.WriteAllText(System.IO.Path.Combine(dir, ".repo"), repo);
            DeleteRuleFiles(dir, slot);                              // drop any other-extension leftover
            var path = System.IO.Path.Combine(dir, slot + ext);
            File.WriteAllBytes(path, bytes);
            File.WriteAllText(NamePathFor(dir, slot), originalName!.Trim());
            if (repo is null)
                _rules = new Dictionary<string, (string, string)>(_rules) { [slot] = (path, originalName!.Trim()) };
            else
            {
                var next = CloneRepoRules();
                if (!next.TryGetValue(repo, out var table)) next[repo] = table = new();
                table[slot] = (path, originalName!.Trim());
                _repoRules = next;
            }
        }
        _logger.Info($"[COLLECTOR] host cue rule set: {(repo is null ? "" : repo + " · ")}{slot} = {originalName} ({bytes.Length} bytes)");
    }

    /// <summary>Clear a slot back to the fallback cue — in the global scope, or in
    /// <paramref name="repo"/>'s scope when given (a repo whose last rule is cleared
    /// disappears from the listing). Unknown slots throw like AssignRule.</summary>
    public void ClearRule(string? slot, string? repo = null)
    {
        slot = NormalizeSlot(slot);
        repo = NormalizeRepo(repo);
        lock (_rulesLock)
        {
            var dir = repo is null ? _cuesDir : RepoDirFor(repo);
            DeleteRuleFiles(dir, slot);
            if (repo is null)
            {
                var next = new Dictionary<string, (string, string)>(_rules);
                next.Remove(slot);
                _rules = next;
            }
            else
            {
                var next = CloneRepoRules();
                if (next.TryGetValue(repo, out var table))
                {
                    table.Remove(slot);
                    if (table.Count == 0)
                    {
                        next.Remove(repo);
                        try { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); } catch { /* best-effort */ }
                    }
                }
                _repoRules = next;
            }
        }
        _logger.Info($"[COLLECTOR] host cue rule cleared: {(repo is null ? "" : repo + " · ")}{slot}");
    }

    private Dictionary<string, Dictionary<string, (string Path, string Name)>> CloneRepoRules()
    {
        // Deep-enough clone (outer dict + per-repo tables) for the swap-whole discipline.
        var next = new Dictionary<string, Dictionary<string, (string Path, string Name)>>();
        foreach (var kv in _repoRules) next[kv.Key] = new(kv.Value);
        return next;
    }

    private static string NormalizeSlot(string? slot)
    {
        var s = slot?.Trim();
        if (s == null || !Slots.Contains(s))
            throw new ArgumentException($"Unknown sound slot '{slot}' — expected one of: {string.Join(", ", Slots)}.");
        return s;
    }

    // A repo scope is any non-empty name (repos on remote harnesses are legal too, so no
    // registry check); null/blank means the global scope. Control characters and absurd
    // lengths are rejected — the name becomes a sidecar file and log lines.
    private static string? NormalizeRepo(string? repo)
    {
        var r = repo?.Trim();
        if (string.IsNullOrEmpty(r)) return null;
        if (r.Length > 128 || r.Any(char.IsControl))
            throw new ArgumentException("Repository name must be at most 128 printable characters.");
        return r;
    }

    // Deterministic, collision-free directory key for a repo name: a filesystem-sanitized
    // prefix for readability plus a short SHA-256 tag for uniqueness. The .repo sidecar
    // inside the directory carries the exact name.
    private static string RepoKey(string repo)
    {
        var san = new string(repo.Select(c =>
            char.IsLetterOrDigit(c) || c is '-' or '_' or '.' ? c : '_').ToArray()).Trim('.');
        if (san.Length > 40) san = san[..40];
        if (san.Length == 0) san = "repo";
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(repo)))[..8].ToLowerInvariant();
        return san + "-" + hash;
    }

    private string RepoDirFor(string repo) => System.IO.Path.Combine(_reposDir, RepoKey(repo));

    private static string NamePathFor(string dir, string slot) => System.IO.Path.Combine(dir, slot + ".name");

    private static void DeleteRuleFiles(string dir, string slot)
    {
        foreach (var ext in AllowedExtensions)
        {
            var p = System.IO.Path.Combine(dir, slot + ext);
            try { if (File.Exists(p)) File.Delete(p); } catch { /* best-effort; replaced below anyway */ }
        }
        try { if (File.Exists(NamePathFor(dir, slot))) File.Delete(NamePathFor(dir, slot)); } catch { }
    }

    // Rebuild the tables from disk — the files ARE the persistence (mirrors the one-value-per-file
    // style of the toggle and mode above), so assigned sounds survive restarts with no registry.
    // The global slot files sit directly in _cuesDir (unchanged from before repo scopes existed);
    // each repo scope is a subdirectory of _reposDir with a .repo sidecar naming it exactly.
    private void LoadRules()
    {
        _rules = LoadSlotTable(_cuesDir);
        var repoRules = new Dictionary<string, Dictionary<string, (string Path, string Name)>>();
        try
        {
            if (Directory.Exists(_reposDir))
                foreach (var dir in Directory.GetDirectories(_reposDir))
                {
                    string repo;
                    try { repo = File.ReadAllText(System.IO.Path.Combine(dir, ".repo")).Trim(); }
                    catch { continue; }                              // no sidecar → not a scope we wrote
                    if (repo.Length == 0) continue;
                    var table = LoadSlotTable(dir);
                    if (table.Count > 0) repoRules[repo] = table;
                }
        }
        catch (Exception ex)
        {
            _logger.Error($"[COLLECTOR] host repo cue rules load failed: {ex.Message}");
        }
        _repoRules = repoRules;
    }

    private Dictionary<string, (string Path, string Name)> LoadSlotTable(string dir)
    {
        var rules = new Dictionary<string, (string, string)>();
        try
        {
            foreach (var slot in Slots)
            {
                var path = AllowedExtensions
                    .Select(ext => System.IO.Path.Combine(dir, slot + ext))
                    .FirstOrDefault(File.Exists);
                if (path == null) continue;
                string name;
                try { name = File.ReadAllText(NamePathFor(dir, slot)).Trim(); }
                catch { name = System.IO.Path.GetFileName(path); }
                rules[slot] = (path, string.IsNullOrWhiteSpace(name) ? System.IO.Path.GetFileName(path) : name);
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[COLLECTOR] host cue rules load failed ({dir}): {ex.Message}");
        }
        return rules;
    }

    /// <summary>The custom file an event of this type from this repo would play, or null when
    /// it would use a built-in cue. Public probe for the resolution precedence (also used by
    /// tests): repo(type) → repo(_default — ANY type from that repo) → global(type) →
    /// global(_default — unknown types only, the pre-repo-scope semantics).</summary>
    public (string Path, string Name)? EffectiveRule(string? eventType, string? repo = null)
    {
        var type = eventType ?? "";
        var r = repo?.Trim();
        if (!string.IsNullOrEmpty(r) && _repoRules.TryGetValue(r!, out var table))
        {
            if (table.TryGetValue(type, out var own)) return own;
            if (table.TryGetValue(SlotDefault, out var rdef)) return rdef;
        }
        var rules = _rules;
        if (rules.TryGetValue(type, out var g)) return g;
        if (!Slots.Contains(type) && rules.TryGetValue(SlotDefault, out var def)) return def;
        return null;
    }

    /// <summary>Cheap and non-blocking: debounce, then fire one cue on a background thread.
    /// Safe to call from inside the poll path for every event. The cue is event-determined:
    /// beep mode picks a distinct host sound per <paramref name="eventType"/>, and voice mode
    /// speaks a phrase that reflects it — "agent {sourceLabel} started" for a turn.start,
    /// "agent {sourceLabel} has finished" for a turn.ended.</summary>
    public void Notify(string? sourceLabel = null, string? eventType = null, string? repo = null)
    {
        if (!_enabled) return;

        var now = Environment.TickCount64;
        var last = Interlocked.Read(ref _lastBeepTicks);
        if (now - last < MinGapMs) return;                                   // within the debounce window
        if (Interlocked.CompareExchange(ref _lastBeepTicks, now, last) != last) return; // lost the race — someone else cued

        _ = Task.Run(() => Play(sourceLabel, eventType, repo: repo));
    }

    /// <summary>Play the host cue immediately, ignoring the enable flag and debounce — used by
    /// the "test" buttons to verify audio works on the host. Plays in <paramref name="mode"/>
    /// when it is a known mode, else the currently selected one, so the operator can audition
    /// beep and voice independently. Uses the canonical "finished" cue (no source label).</summary>
    public void PlayNow(string? mode = null) => _ = Task.Run(() => Play(null, "turn.ended", mode));

    /// <summary>Play, right now and toggle-ignoring, exactly what a live event of this slot's
    /// type (from <paramref name="repo"/>, when given) would play — the effective custom file
    /// when there is one, else the built-in cue in the current mode. Backs the per-slot "test"
    /// endpoint. Unknown slots throw.</summary>
    public void PlayEffectiveNow(string? slot, string? repo = null)
    {
        var s = NormalizeSlot(slot);
        // "_default" is not a real event type; any unmapped type string exercises that path.
        _ = Task.Run(() => Play(null, s == SlotDefault ? "test.other" : s, repo: repo));
    }

    // Play the cue for this event. The effective custom file (repo scope first, then global)
    // wins over both modes; otherwise voice speaks a type-appropriate phrase via SAPI and beep
    // plays a type-appropriate Windows notification sound (falling back to Console.Beep). An
    // optional modeOverride lets the mode test buttons force a mode (bypassing the custom file —
    // they audition the modes). All best-effort: an unplayable file and a failing voice both
    // fall through to the beep, and a host with no audio stays silent.
    private void Play(string? sourceLabel, string? eventType, string? modeOverride = null, string? repo = null)
    {
        var forced = modeOverride == ModeBeep || modeOverride == ModeVoice;
        if (!forced && EffectiveRule(eventType, repo) is { } rule)
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

    // Event-determined phrase: "started" for a turn.start, "has finished" for a turn.ended,
    // "someone is writing to …" for a chat.focus (the actor is the End User, not the agent),
    // a neutral phrase otherwise; naming the source when we know it, else "an agent".
    private static string PhraseFor(string? label, string? eventType)
    {
        var who = string.IsNullOrWhiteSpace(label) ? "an agent" : $"agent {label!.Trim()}";
        return eventType switch
        {
            "turn.start" => $"{who} started",
            "turn.ended" => $"{who} has finished",
            "chat.focus" => $"someone is writing to {who}",
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
                case "chat.focus": System.Media.SystemSounds.Question.Play(); return;
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
                case "chat.focus": Console.Beep(523, 90); Console.Beep(659, 90); break;   // soft double tap
                default:           Console.Beep(880, 150); break;
            }
        }
        catch { /* no audio device / unsupported host */ }
    }
}
