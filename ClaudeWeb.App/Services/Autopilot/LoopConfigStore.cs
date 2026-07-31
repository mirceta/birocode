using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// THE per-agent loop registry (openspec: unify-loop-types, revision 2): every
/// autopilot mode — 💡 <b>suggestion</b>, 📋 <b>recipe</b>, 🎯 <b>goal</b> — is one
/// <see cref="ILoop"/>-kinded loop instance stored here, keyed by repoId. ONE
/// dictionary slot per agent makes exclusive arming STRUCTURAL: arming any kind
/// replaces whatever was armed (no coordinator needed). Every instance also carries
/// the common MODE axis — suggest (the decided next prompt only pre-fills the
/// agent's composer via <c>PendingPrompt</c>) or drive (the engine sends it, capped
/// and audited). A recipe loop resends ONE fixed stored prompt; a goal loop stores
/// prompts composed ONCE at arm time (work + verification); a suggestion instance
/// stores no prompt (its next prompt comes from the classifier per turn). Driven
/// kinds only ever send STORED, byte-identical text — nothing is composed at send
/// time, so prompt inspection is honest. Legacy suggestion arming (autopilot.json
/// ArmedRepoIds + global AutoAdvance) is drained into instances once at startup.
///
/// Stored at <c>%APPDATA%\ClaudeWeb\loops.json</c> with the same atomic temp+rename
/// write and never-reseed-on-unreadable load guard as <see cref="AutopilotConfigStore"/>.
/// The durable fields (kind/prompt/goal/sentinel/cap/active/phase) and the live
/// counters (iterationsDone/status/lastSentAt) live together so a restart resumes an
/// in-flight loop where it left off. All sends are still fenced by
/// <see cref="AutopilotGate"/> and the global kill switch — this store only holds the
/// per-loop intent.
/// </summary>
public class LoopConfigStore
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    public const string DefaultSentinel = "LOOP_DONE";
    public const int DefaultMaxIterations = 10;
    public const string KindSuggestion = "suggestion";
    public const string KindRecipe = "recipe";
    public const string KindGoal = "goal";
    public const string KindQueue = "queue";
    // The common mode axis (revision 2, D9): what happens to a proposed next
    // prompt. "drive" = the engine sends it; "suggest" = it becomes the pending
    // prompt pre-filling the agent's composer for the human to send.
    public const string ModeSuggest = "suggest";
    public const string ModeDrive = "drive";
    public const string PhaseWork = "work";
    public const string PhaseVerify = "verify";
    /// <summary>Queue kind (openspec: queue-based-loop, D4): a step landed and its
    /// verification turn has not been sent yet. Distinct from <see cref="PhaseVerify"/>
    /// (the verification prompt itself has landed, its reply decides).</summary>
    public const string PhaseVerifyOwed = "verify-owed";
    /// <summary>The goal loop's verified-done token (docs/loop-driven-agent-convention.md):
    /// only meaningful in a verification turn's reply.</summary>
    public const string VerifiedToken = "GOAL_VERIFIED";
    /// <summary>The queue loop's step-verification token (openspec: queue-based-loop, D4) —
    /// deliberately NOT <see cref="VerifiedToken"/>, so a queue driving goal-contract
    /// agents can't cross-trigger. Only meaningful in a verification turn's reply.</summary>
    public const string StepVerifiedToken = "STEP_VERIFIED";
    /// <summary>Bound on the queue kind's sent-history (openspec: queue-loop-visibility,
    /// D3): oldest entries drop beyond this; the full trail stays in the audit log.</summary>
    public const int QueueSentTextsCap = 20;

    // The goal-loop composition templates (openspec: unify-loop-types, design D2).
    // {0} is the user's goal text. Composed ONCE at arm time and stored on the loop;
    // exposed (via the gated detail endpoint) so the dock can preview the exact
    // composition before arming. Wording is a draft to be tuned from real runs.
    public const string GoalWorkTemplate =
        "Work toward this goal until it is genuinely achieved:\n{0}\n\n"
        + "When the whole goal is genuinely achieved, end your reply with LOOP_DONE as the final line. "
        + "If you are blocked on a decision only the human can make, end your reply with "
        + "NEEDS_HUMAN: <your question> and stop.";
    public const string GoalVerifyTemplate =
        "You declared the goal done. The goal was:\n{0}\n\n"
        + "Critically verify it against the ACTUAL state of the repository — run the build, "
        + "the tests, the app as appropriate; do not trust your memory of the work. "
        + "If the goal is genuinely achieved, end your reply with GOAL_VERIFIED as the final line. "
        + "If it is not, list exactly what is missing and continue working toward the goal. "
        + "If you are blocked on a decision only the human can make, end your reply with "
        + "NEEDS_HUMAN: <your question> and stop.";

    public static string ComposeGoalWorkPrompt(string goal) => string.Format(GoalWorkTemplate, goal);
    public static string ComposeGoalVerifyPrompt(string goal) => string.Format(GoalVerifyTemplate, goal);

    // The queue kind's between-step verification template (openspec: queue-based-loop,
    // D4). {0} is the landed step's text (LastStepText). Unlike the goal templates this
    // is composed at SEND time — a live queue has no arm-time step list — but the
    // composition stays deterministic from two operator-visible texts: this stored
    // template (gated-inspectable) and the stash item shown above the composer.
    // Wording is a draft to be tuned from real runs, like the goal templates.
    public const string QueueVerifyTemplate =
        "Review your previous turn against the request below. The request was:\n{0}\n\n"
        + "Was it genuinely accomplished — actually done, not just discussed, partially done, "
        + "or answered with a question? If yes, end your reply with STEP_VERIFIED as the final line. "
        + "If not — including if you asked a question or hit a blocker — state the open question "
        + "or blocker plainly and do NOT write STEP_VERIFIED.";

    public static string ComposeQueueVerifyPrompt(string stepText) => string.Format(QueueVerifyTemplate, stepText);

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Data _data = new();

    /// <summary>Where the loop records live on disk, for the debug bundle
    /// (openspec: add-loop-debug-handoff) — so a pasted bundle tells an agent on
    /// the host exactly which file holds the durable loop state.</summary>
    public string FilePath => _path;

    public LoopConfigStore(Logger logger)
    {
        _logger = logger;
        // AppPaths (not %APPDATA% directly) so an isolated CLAUDEWEB_DATADIR
        // instance keeps its own loops instead of sharing the operator's live ones.
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "loops.json");
        Load();
    }

    // On-disk shape. A loop is "active" only while Status == "looping"; every stop
    // outcome clears Active so the engine no longer ticks it.
    private sealed class Entry
    {
        // "suggestion" | "recipe" | "goal" (openspec: unify-loop-types, revision 2 —
        // EVERY autopilot mode is a loop instance in this one slot). Additive:
        // pre-kind loops.json entries deserialize with null and normalize to recipe
        // on read, so legacy loops behave exactly as before.
        public string? Kind { get; set; }
        // "suggest" | "drive" (null loads as drive — the legacy loops all drove).
        public string? Mode { get; set; }
        public string Prompt { get; set; } = "";
        // Goal-kind only: the user's stated goal, the stored verification prompt
        // (Prompt holds the stored WORK prompt), and the phase ("work" | "verify").
        public string? Goal { get; set; }
        public string? VerifyPrompt { get; set; }
        public string? Phase { get; set; }
        // Suggest-mode: the next prompt the loop proposes, waiting for the human to
        // send it from the composer. Cleared on send, resolve, and new proposals.
        public string? PendingPrompt { get; set; }
        public string Sentinel { get; set; } = DefaultSentinel;
        public int MaxIterations { get; set; } = DefaultMaxIterations;
        public bool Active { get; set; }
        public int IterationsDone { get; set; }
        public string Status { get; set; } = "stopped"; // looping | done | escalate | capped | error | stopped
        public long LastSentAt { get; set; }
        // Why the loop stopped, written by Resolve (additive fields — old loops.json
        // files load with both null). Reason is the machine string naming the condition
        // that fired (sentinel | needs-human | deny-list | cap | error | user); Detail
        // is the human-readable specifics (the NEEDS_HUMAN question, the matched deny
        // word, "cap 10/10").
        public string? StopReason { get; set; }
        public string? StopDetail { get; set; }
        // The recipe this loop was armed from, if any (additive; display only —
        // the loop keeps its own copy of prompt/sentinel/cap, so a later recipe
        // edit never mutates a running loop).
        public string? RecipeId { get; set; }
        public string? RecipeName { get; set; }
        // When this instance was armed (unix ms). A new arming = a new generation:
        // the engine clears its per-repo dedup guards when this changes, so a
        // freshly armed loop acts on the agent's CURRENT trailing message even if
        // a previous instance already acted on that same message.
        public long ArmedAt { get; set; }
        // Driven kinds: the session id of the ONE conversation this loop drives
        // (openspec: fix-loop-conversation-identity). Seeded at arm time, advanced
        // to each builder-lane run's forked session id on completion. Null on old
        // loops.json entries and suggestion instances (additive).
        public string? SessionId { get; set; }
        // Queue kind only (openspec: queue-based-loop — all additive nullable, so
        // legacy loops.json entries load unchanged): the dock tab whose live stash
        // IS the queue (D2 — no snapshot, no cursor); whether between-step
        // verification is on (null loads as true, the default posture); the last
        // unloaded step's text, stamped when its send lands so a restart mid-step
        // still verifies the right thing; and how many stash items landed this arm
        // (IterationsDone keeps counting ALL sends, verification turns included).
        public string? QueueTabId { get; set; }
        public bool? VerifyEnabled { get; set; }
        public string? LastStepText { get; set; }
        public int? QueueSent { get; set; }
        // Queue kind, sent-history (openspec: queue-loop-visibility, D3): the texts of
        // the steps that actually landed this arm, newest last, bounded at
        // QueueSentTextsCap (drop-oldest). Prompt-bearing — disclosed only via the
        // gated detail/debug surfaces, never the ungated projection. Additive: null on
        // old entries loads as empty; a new arm creates a fresh Entry, so the history
        // resets structurally.
        public List<string>? QueueSentTexts { get; set; }
    }

    private sealed class Data
    {
        public Dictionary<string, Entry> Loops { get; set; } = new();
    }

    /// <summary>One loop's state, as the API and engine see it. <c>Kind</c> and
    /// <c>Mode</c> are always normalized; <c>Goal</c>/<c>VerifyPrompt</c>/<c>Phase</c>
    /// are null except for goal loops (whose <c>Prompt</c> is the stored work prompt).
    /// <c>MaxIterations</c> of 0 means uncapped (suggestion instances default to it —
    /// the cap only bounds drive-mode sends).</summary>
    public sealed record LoopState(
        string RepoId, string Kind, string Mode, string Prompt, string Sentinel, int MaxIterations,
        bool Active, int IterationsDone, string Status, long LastSentAt,
        string? StopReason, string? StopDetail, string? RecipeId, string? RecipeName,
        string? Goal, string? VerifyPrompt, string? Phase, string? PendingPrompt, long ArmedAt,
        string? SessionId,
        string? QueueTabId, bool VerifyEnabled, string? LastStepText, int QueueSent,
        IReadOnlyList<string> QueueSentTexts);

    public IReadOnlyList<LoopState> All()
    {
        lock (_gate)
            return _data.Loops
                .Select(kv => ToState(kv.Key, kv.Value))
                .OrderBy(s => s.RepoId, StringComparer.OrdinalIgnoreCase)
                .ToList();
    }

    public LoopState? Get(string repoId)
    {
        lock (_gate)
            return _data.Loops.TryGetValue(repoId, out var e) ? ToState(repoId, e) : null;
    }

    /// <summary>Arms (or re-arms) a RECIPE loop: resets counters and sets it running.
    /// When armed from a recipe, the recipe's id/name are stamped on for display.
    /// Replaces this agent's one loop slot — XOR by construction (revision 2, D8).</summary>
    public LoopState Start(string repoId, string prompt, string? sentinel, int? maxIterations,
        string? recipeId = null, string? recipeName = null, string? mode = null, string? sessionId = null)
    {
        lock (_gate)
        {
            LogDisplaced(repoId, KindRecipe);
            var e = new Entry
            {
                Kind = KindRecipe,
                Mode = CleanMode(mode),
                Prompt = prompt,
                Sentinel = string.IsNullOrWhiteSpace(sentinel) ? DefaultSentinel : sentinel.Trim(),
                MaxIterations = Math.Clamp(maxIterations ?? DefaultMaxIterations, 1, 100),
                Active = true,
                ArmedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                IterationsDone = 0,
                Status = "looping",
                LastSentAt = 0,
                RecipeId = recipeId,
                RecipeName = recipeName,
                SessionId = Clean(sessionId),
            };
            _data.Loops[repoId] = e;
            Save();
            _logger.Info($"[LOOP] armed recipe loop {repoId} ({e.Mode}, cap {e.MaxIterations}, sentinel \"{e.Sentinel}\", pinned {e.SessionId ?? "<none yet>"})");
            return ToState(repoId, e);
        }
    }

    /// <summary>Arms (or re-arms) a GOAL loop (openspec: unify-loop-types): composes the
    /// work + verification prompts from the templates ONCE, stores them verbatim, and
    /// starts in the work phase. The engine only ever sends the stored text.</summary>
    public LoopState StartGoal(string repoId, string goal, int? maxIterations, string? mode = null,
        string? sessionId = null)
    {
        lock (_gate)
        {
            LogDisplaced(repoId, KindGoal);
            var e = new Entry
            {
                Kind = KindGoal,
                Mode = CleanMode(mode),
                Goal = goal,
                Prompt = ComposeGoalWorkPrompt(goal),
                VerifyPrompt = ComposeGoalVerifyPrompt(goal),
                Phase = PhaseWork,
                Sentinel = DefaultSentinel,
                MaxIterations = Math.Clamp(maxIterations ?? DefaultMaxIterations, 1, 100),
                Active = true,
                ArmedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                IterationsDone = 0,
                Status = "looping",
                LastSentAt = 0,
                SessionId = Clean(sessionId),
            };
            _data.Loops[repoId] = e;
            Save();
            _logger.Info($"[LOOP] armed goal loop {repoId} ({e.Mode}, cap {e.MaxIterations}, pinned {e.SessionId ?? "<none yet>"})");
            return ToState(repoId, e);
        }
    }

    /// <summary>Arms (or re-arms) a 🗒️ QUEUE loop (openspec: queue-based-loop, D2/D8):
    /// binds the agent's one loop slot to a dock tab whose LIVE stash is the queue —
    /// no step list is copied here, the engine reads the stash head at each tick.
    /// Between-step verification defaults ON (D4); the caller (controller) guards
    /// against arming over an empty stash. Mirrors <see cref="StartGoal"/>: counters
    /// reset, ArmedAt stamped, session pinned.</summary>
    public LoopState StartQueue(string repoId, string tabId, bool? verifyEnabled,
        int? maxIterations, string? mode = null, string? sessionId = null)
    {
        lock (_gate)
        {
            LogDisplaced(repoId, KindQueue);
            var e = new Entry
            {
                Kind = KindQueue,
                Mode = CleanMode(mode),
                QueueTabId = tabId,
                VerifyEnabled = verifyEnabled ?? true,
                QueueSent = 0,
                Phase = PhaseWork,
                Sentinel = DefaultSentinel,
                MaxIterations = Math.Clamp(maxIterations ?? DefaultMaxIterations, 1, 100),
                Active = true,
                ArmedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                IterationsDone = 0,
                Status = "looping",
                LastSentAt = 0,
                SessionId = Clean(sessionId),
            };
            _data.Loops[repoId] = e;
            Save();
            _logger.Info($"[LOOP] armed queue loop {repoId} on tab {tabId} ({e.Mode}, verify {(e.VerifyEnabled == true ? "on" : "off")}, cap {e.MaxIterations}, pinned {e.SessionId ?? "<none yet>"})");
            return ToState(repoId, e);
        }
    }

    /// <summary>Engine, queue kind (openspec: queue-based-loop): a stash item's send
    /// LANDED — stamp its text (so a restart mid-step verifies the right thing), count
    /// it, and owe a verification turn (or go straight back to work when verification
    /// is opted out).</summary>
    public LoopState? RecordQueueStep(string repoId, string stepText)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            e.LastStepText = stepText;
            e.QueueSent = (e.QueueSent ?? 0) + 1;
            (e.QueueSentTexts ??= new()).Add(stepText);
            while (e.QueueSentTexts.Count > QueueSentTextsCap) e.QueueSentTexts.RemoveAt(0);
            e.Phase = e.VerifyEnabled != false ? PhaseVerifyOwed : PhaseWork;
            Save();
            return ToState(repoId, e);
        }
    }

    /// <summary>Arms (or re-arms) the SUGGESTION loop (revision 2 — suggestion is a
    /// loop instance like the others). Uncapped by default: the cap only bounds
    /// drive-mode sends.</summary>
    public LoopState StartSuggestion(string repoId, string? mode = null)
    {
        lock (_gate)
        {
            LogDisplaced(repoId, KindSuggestion);
            var e = new Entry
            {
                Kind = KindSuggestion,
                Mode = CleanMode(mode, defaultMode: ModeSuggest),
                Prompt = "",
                Sentinel = DefaultSentinel,
                MaxIterations = 0, // uncapped
                Active = true,
                ArmedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                IterationsDone = 0,
                Status = "looping",
                LastSentAt = 0,
            };
            _data.Loops[repoId] = e;
            Save();
            _logger.Info($"[LOOP] armed suggestion loop {repoId} ({e.Mode})");
            return ToState(repoId, e);
        }
    }

    /// <summary>Flips a live instance's suggest/drive mode WITHOUT resetting its
    /// counters, kind, prompts, or phase (revision 2, D9).</summary>
    public LoopState? SetMode(string repoId, string mode)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            e.Mode = CleanMode(mode, defaultMode: e.Mode ?? ModeDrive);
            Save();
            _logger.Info($"[LOOP] {repoId} mode -> {e.Mode}");
            return ToState(repoId, e);
        }
    }

    /// <summary>Engine: records a suggest-mode proposal as the instance's pending
    /// prompt (idempotent — saves only on change).</summary>
    public LoopState? SetPending(string repoId, string? prompt)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            if (e.PendingPrompt == prompt) return ToState(repoId, e);
            e.PendingPrompt = prompt;
            Save();
            return ToState(repoId, e);
        }
    }

    /// <summary>Pins (or advances) the ONE conversation a driven loop follows
    /// (openspec: fix-loop-conversation-identity): the engine's read and resume
    /// target. Called at first resolve (null-pin fallback) and on every
    /// builder-lane run completion — the fork's new session id replaces the old.
    /// Idempotent: saves only on change.</summary>
    public LoopState? SetSessionId(string repoId, string? sessionId)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            var clean = Clean(sessionId);
            if (e.SessionId == clean) return ToState(repoId, e);
            _logger.Info($"[LOOP] {repoId} pin {e.SessionId ?? "<none>"} -> {clean ?? "<none>"}");
            e.SessionId = clean;
            Save();
            return ToState(repoId, e);
        }
    }

    /// <summary>Engine: flips a goal loop's phase ("work" | "verify"). No-op for
    /// unknown repos; other kinds never call this.</summary>
    public LoopState? SetPhase(string repoId, string phase)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            e.Phase = phase;
            Save();
            return ToState(repoId, e);
        }
    }

    // Caller holds _gate. The slot replacement IS the XOR: note a displaced active
    // instance in the log (the record itself is replaced, matching "resolved as
    // user-stopped" semantics — the new instance owns the slot).
    private void LogDisplaced(string repoId, string newKind)
    {
        if (_data.Loops.TryGetValue(repoId, out var prev) && prev.Active && prev.Kind != newKind)
            _logger.Info($"[LOOP] {repoId}: active {prev.Kind ?? KindRecipe} loop displaced by arming the {newKind} loop");
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string CleanMode(string? mode, string defaultMode = ModeDrive) =>
        string.Equals(mode, ModeSuggest, StringComparison.OrdinalIgnoreCase) ? ModeSuggest
        : string.Equals(mode, ModeDrive, StringComparison.OrdinalIgnoreCase) ? ModeDrive
        : defaultMode;

    /// <summary>Edits a loop's fields without resetting its counter (used to tweak a
    /// running loop, e.g. raise the cap). No-op if the loop doesn't exist.</summary>
    public LoopState? Update(string repoId, string? prompt, string? sentinel, int? maxIterations)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            if (prompt != null) e.Prompt = prompt;
            if (!string.IsNullOrWhiteSpace(sentinel)) e.Sentinel = sentinel.Trim();
            if (maxIterations is int cap) e.MaxIterations = Math.Clamp(cap, 1, 100);
            Save();
            return ToState(repoId, e);
        }
    }

    /// <summary>Stops a loop by the user's hand (the Stop button).</summary>
    public LoopState? Stop(string repoId) => Resolve(repoId, "stopped", "user", "stopped by the user");

    /// <summary>Engine: terminal/stop outcome (done | escalate | capped | error | stopped),
    /// plus WHY it stopped (reason = the condition that fired, detail = its specifics).
    /// Clears Active so the loop no longer ticks; keeps the counter for the UI.</summary>
    public LoopState? Resolve(string repoId, string status, string? reason = null, string? detail = null)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            e.Active = false;
            e.Status = status;
            e.StopReason = reason;
            e.StopDetail = detail;
            e.PendingPrompt = null;
            Save();
            _logger.Info($"[LOOP] {repoId} -> {status} after {e.IterationsDone} iteration(s)"
                + (reason is null ? "" : $" ({reason}{(string.IsNullOrEmpty(detail) ? "" : $": {detail}")})"));
            return ToState(repoId, e);
        }
    }

    /// <summary>Engine: record one resend — bumps the iteration counter and timestamp.</summary>
    public LoopState? RecordSend(string repoId, long at)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            e.IterationsDone++;
            e.LastSentAt = at;
            e.Status = "looping";
            e.StopReason = null;
            e.StopDetail = null;
            e.PendingPrompt = null;
            Save();
            return ToState(repoId, e);
        }
    }

    private static LoopState ToState(string repoId, Entry e) =>
        new(repoId,
            e.Kind == KindGoal ? KindGoal
                : e.Kind == KindSuggestion ? KindSuggestion
                : e.Kind == KindQueue ? KindQueue
                : KindRecipe,
            e.Mode == ModeSuggest ? ModeSuggest : ModeDrive,
            e.Prompt, e.Sentinel,
            e.MaxIterations, e.Active, e.IterationsDone, e.Status, e.LastSentAt,
            e.StopReason, e.StopDetail, e.RecipeId, e.RecipeName,
            e.Goal, e.VerifyPrompt, e.Phase, e.PendingPrompt, e.ArmedAt,
            e.SessionId,
            e.QueueTabId, e.VerifyEnabled != false, e.LastStepText, e.QueueSent ?? 0,
            e.QueueSentTexts?.ToList() ?? (IReadOnlyList<string>)Array.Empty<string>());

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var data = JsonSerializer.Deserialize<Data>(File.ReadAllText(_path));
            if (data is null) return;
            data.Loops ??= new();
            _data = data;
        }
        catch (Exception ex)
        {
            _logger.Error($"[LOOP] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
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
            _logger.Error($"[LOOP] Failed to save {_path}: {ex.Message}");
        }
    }
}
