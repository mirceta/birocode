using System.Collections.Concurrent;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Prompts;
using ClaudeWeb.Services.Repositories;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The engine (plans/loop-autopilot-engine.md; openspec: unify-loop-types revision 2).
/// A hosted <see cref="BackgroundService"/> that, every ~10s, looks at each agent
/// (repo) with an ACTIVE loop instance that is idle, reads its last assistant
/// message, and asks the instance's <see cref="ILoop"/> implementation (💡
/// suggestion / 📋 recipe / 🎯 goal / 🗒️ queue) for exactly one decision — hold, stop, or
/// propose-a-prompt. The engine owns only MECHANICS, applied uniformly to every
/// kind: idle detection, per-message dedup, the cap check before any drive-mode
/// send, sending, pending-prompt recording, intercept/log/audit records.
///
/// A proposed prompt dispatches on the instance's MODE: <b>drive</b> sends it
/// (resuming the agent's session through the same <see cref="CliRunnerService"/>
/// path the chat UI uses, capped and audited); <b>suggest</b> records it as the
/// instance's pending prompt for the human to send from the composer — the loop
/// advances only when the agent's reply changes.
///
/// The gate (threshold + deny-list + kill switch + operator gate) lives in
/// <see cref="AutopilotConfigStore"/>/<see cref="AutopilotGate"/> and is applied
/// before any send: ambiguity or risk → escalate/hold, never auto-send.
///
/// It reads the last message from the on-disk transcript (the same source as
/// discovery); when a drive send's reply is missing there — the CLI can stream
/// a reply without ever persisting it — it falls back to the reply text the run
/// buffer witnessed (openspec: fix-loop-verify-stale-reply).
/// </summary>
public class AutopilotService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);
    private const int MaxLog = 50;
    private const int MaxIntercepts = 50;
    // The looped-agent escalation marker (docs/loop-driven-agent-convention.md): a
    // driven agent ends its reply with "NEEDS_HUMAN: <question>" when blocked on a
    // decision only the human can make. Deterministic string match, like the sentinel.
    public const string NeedsHumanMarker = "NEEDS_HUMAN:";

    private readonly RepositoryRegistry _repos;
    private readonly SessionService _sessions;
    private readonly RunSessionService _runs;
    private readonly CliRunnerService _cli;
    private readonly AutopilotConfigStore _config;
    private readonly LoopConfigStore _loops;
    private readonly AutopilotGate _operatorGate;
    private readonly PromptClassifier _brain;
    private readonly CliPromptClassifier _cliBrain;
    private readonly AutopilotDiscoveryService _discovery;
    private readonly PromptsService _prompts;
    private readonly AutopilotAuditLog _audit;
    private readonly DockRegistry _dock;
    private readonly BriefingRulesStore _briefing;
    private readonly FlagsStore _flags;
    private readonly Logger _logger;

    private readonly ConcurrentDictionary<string, AgentState> _states = new();
    // The assistant-message snippet each drive send was decided against. DEBUG
    // EVIDENCE ONLY since fix-loop-verify-stale-reply: reply freshness is temporal
    // (LastSentAt vs the reply's timestamp), never textual — snippet equality both
    // deadlocks on identical re-replies and mistakes ANY moved text (a synthetic
    // repair line, another writer) for the reply to our send.
    private readonly ConcurrentDictionary<string, string> _lastDriveSent = new();
    // DRIVE no-reply escape (fix-loop-noreply-stall; reworked by
    // fix-loop-verify-stale-reply): a run can complete without a reply landing
    // anywhere — an empty completion (seen live 2026-07-27), or a streamed reply
    // the CLI never persisted AND a restart dropped the run buffer. _driveNoReply
    // marks "run finished, no fresh reply" for one grace tick (covers transcript
    // flush); on the next tick the kind decides again with NO reply text (it
    // re-proposes its phase's prompt — stale text is never judged).
    // _driveNoReplyMisses counts consecutive reply-less runs so a pathological
    // agent stops (error/no-reply) instead of burning turns.
    private readonly ConcurrentDictionary<string, byte> _driveNoReply = new();
    private readonly ConcurrentDictionary<string, int> _driveNoReplyMisses = new();
    private const int MaxNoReplyRetries = 2;
    // Per-repo guard for SUGGEST mode: the snippet a pending proposal was recorded
    // against. Until the agent's reply changes, the instance is not re-decided —
    // this is what "the loop advances when the reply changes" means, and it keeps a
    // goal loop's phase from oscillating while its verification prompt sits unsent.
    private readonly ConcurrentDictionary<string, string> _suggestWait = new();
    // Queue kind, SUGGEST mode (openspec: queue-based-loop, D2): the stash item a
    // pending queue proposal was read from. Consume-on-land for a pend means "when
    // the pend's wait breaks" — the human sent it from the composer and the agent's
    // reply moved — so the ref rides here until that tick. In-memory like the
    // guards: a restart or re-arm forgets it and the item simply stays in the
    // stash (lossless, re-proposed from the head).
    private readonly ConcurrentDictionary<string, (StashRef Ref, string StepText)> _pendingConsume = new();
    // The ArmedAt stamp last seen per repo — a change means a re-arm, which
    // resets both guards above (see Tick).
    private readonly ConcurrentDictionary<string, long> _armGen = new();
    // The reply timestamp whose FLAG: lines were last lifted per repo, so a reply
    // that gets re-seen across ticks (e.g. while a suggest-mode loop waits) is
    // mined for flags exactly once. Keyed by timestamp, not arm generation: a
    // re-arm over the same trailing reply must not re-record its flags.
    private readonly ConcurrentDictionary<string, DateTime> _lastFlagMined = new();
    private readonly object _logGate = new();
    private readonly LinkedList<LogEntry> _log = new();
    // The live "Intercepted" feed: one entry per NEW agent message the engine grabs
    // and processes. Newest-first, capped. Dedup by repo+snippet so the same idle
    // message isn't re-intercepted every tick.
    private readonly object _interceptGate = new();
    private readonly LinkedList<InterceptEvent> _intercepts = new();
    private readonly ConcurrentDictionary<string, string> _lastIntercepted = new();

    // Kind name -> semantics implementation (revision 2, D7). Resolved once from DI.
    private readonly IReadOnlyDictionary<string, ILoop> _kinds;

    public AutopilotService(
        RepositoryRegistry repos, SessionService sessions, RunSessionService runs,
        CliRunnerService cli, AutopilotConfigStore config, LoopConfigStore loops,
        AutopilotGate operatorGate, PromptClassifier brain, CliPromptClassifier cliBrain,
        AutopilotDiscoveryService discovery,
        PromptsService prompts, AutopilotAuditLog audit, DockRegistry dock,
        BriefingRulesStore briefing, FlagsStore flags, IEnumerable<ILoop> kinds, Logger logger)
    {
        _repos = repos;
        _sessions = sessions;
        _runs = runs;
        _cli = cli;
        _config = config;
        _loops = loops;
        _briefing = briefing;
        _flags = flags;
        _operatorGate = operatorGate;
        _brain = brain;
        _cliBrain = cliBrain;
        _discovery = discovery;
        _prompts = prompts;
        _audit = audit;
        _dock = dock;
        _logger = logger;
        _kinds = kinds.ToDictionary(k => k.Kind);

        DrainLegacyArming();
    }

    /// <summary>Legacy autopilot.json ArmedRepoIds are DROPPED, not migrated
    /// (openspec: fix-loop-arm-freshness): a loop is armed only by an explicit user
    /// action, never by startup — the old drain silently resurrected armed
    /// suggestion loops the user never asked for this session. Clears the legacy
    /// list once, logging what was dropped.</summary>
    private void DrainLegacyArming()
    {
        var cfg = _config.Get();
        if (cfg.ArmedRepoIds.Count == 0) return;
        _logger.Info($"[LOOP] dropping legacy armed repos without arming (loops are off by default): {string.Join(", ", cfg.ArmedRepoIds)}");
        _config.ClearLegacyArming();
    }

    // The brain's label space is the user's EDITABLE custom prompts, enriched by a
    // mining pass over history. Mining scans every transcript, so only its RESULT is
    // cached (refreshed every few minutes); the label space itself is rebuilt from the
    // CURRENT custom-prompt list on every call (cheap), so an edit on the Routine-prompts
    // tab takes effect on the very next tick instead of waiting out the cache.
    private static readonly TimeSpan DiscoveryRefresh = TimeSpan.FromMinutes(5);
    private readonly object _routineGate = new();
    private AutopilotDiscoveryService.DiscoveryResult _mined =
        new(0, 0, Array.Empty<AutopilotDiscoveryService.RoutinePrompt>());
    private DateTimeOffset _minedAt = DateTimeOffset.MinValue;
    private bool _miningInFlight; // guarded by _routineGate

    /// <summary>The brain's current label space — the user's custom prompts, enriched by
    /// the (cached) mining pass. Cheap; safe to call every tick and from the API.</summary>
    public IReadOnlyList<PromptClassifier.Routine> Routines() => Routines(DateTimeOffset.UtcNow);

    private IReadOnlyList<PromptClassifier.Routine> Routines(DateTimeOffset now)
    {
        // Mining scans every transcript (~50s warm / ~2min cold) — it must never run
        // on the tick path or block an API caller (openspec fix-startup-handle-race):
        // return the cached result immediately and refresh via a single-flight
        // background task. Until the first pass lands, the label space is the user's
        // custom prompts alone.
        AutopilotDiscoveryService.DiscoveryResult mined;
        var startRefresh = false;
        lock (_routineGate)
        {
            mined = _mined;
            if (now - _minedAt >= DiscoveryRefresh && !_miningInFlight)
                _miningInFlight = startRefresh = true;
        }

        if (startRefresh)
        {
            _ = Task.Run(() =>
            {
                var sw = System.Diagnostics.Stopwatch.StartNew();
                try
                {
                    _logger.Info("[AUTOPILOT] mining transcripts in background...");
                    var fresh = _discovery.Discover();
                    lock (_routineGate) { _mined = fresh; _minedAt = DateTimeOffset.UtcNow; }
                    _logger.Info($"[AUTOPILOT] mining done in {sw.Elapsed.TotalSeconds:0}s " +
                        $"({fresh.Routines.Count} routine prompts from {fresh.SessionsScanned} sessions)");
                }
                catch (Exception ex)
                {
                    // Keep the previous cache; the stale _minedAt retries next call.
                    _logger.Error($"[AUTOPILOT] discovery refresh failed (keeping previous): {ex.Message}");
                }
                finally
                {
                    lock (_routineGate) _miningInFlight = false;
                }
            });
        }

        return PromptClassifier.BuildRoutines(_prompts.List(), mined);
    }

    /// <param name="Decision">off | running | idle | suggestion | escalate | paused | sent.</param>
    public sealed record AgentState(
        string RepoId, string RepoName, bool Armed, string Decision,
        string? Label, double Confidence, string Reason, string LastMessage, long UpdatedAt);

    public sealed record LogEntry(long At, string RepoName, string Outcome, string? Label, double Confidence);

    public IReadOnlyList<AgentState> States() =>
        _states.Values.OrderBy(s => s.RepoName, StringComparer.OrdinalIgnoreCase).ToList();

    public IReadOnlyList<LogEntry> Log()
    {
        lock (_logGate) return _log.ToList();
    }

    /// <summary>One intercepted agent message as it moves through the engine.
    /// Mutable so the auto-send path can flip <see cref="Phase"/> to "done" when
    /// the resumed run actually finishes (a real, multi-second in-flight window).
    /// <para><b>Phase</b>: processing | done. <b>Outcome</b> (null while processing):
    /// suggested | escalated | sent.</para></summary>
    public sealed class InterceptEvent
    {
        public required string Id { get; init; }
        public required long At { get; init; }
        public required string RepoId { get; init; }
        public required string RepoName { get; init; }
        public required string Snippet { get; init; }
        public string Phase { get; set; } = "processing";
        public string? Outcome { get; set; }
        public string? Label { get; set; }
        public double Confidence { get; set; }
        public long? DoneAt { get; set; }
    }

    public IReadOnlyList<InterceptEvent> Intercepts()
    {
        lock (_interceptGate) return _intercepts.ToList();
    }

    /// <summary>A point-in-time dump of the engine's per-repo IN-MEMORY evidence for
    /// the loop debug bundle (openspec: add-loop-debug-handoff) — the state that
    /// explains "why didn't it tick" and lives nowhere on disk: the busy flag, the
    /// current decision + hold reason, and the dedup guards that hold a loop until
    /// the agent's reply changes.</summary>
    public sealed record EngineDebug(
        bool Busy, double TickSeconds, AgentState? State,
        string? LastDriveSentSnippet, string? SuggestWaitSnippet,
        long? ArmGenerationSeen, string? LastInterceptedSnippet,
        IReadOnlyList<InterceptEvent> Intercepts, IReadOnlyList<LogEntry> Log);

    public EngineDebug DebugSnapshot(string repoId, string? repoName)
    {
        List<InterceptEvent> intercepts;
        lock (_interceptGate)
            intercepts = _intercepts.Where(i => i.RepoId == repoId).Take(10).ToList();
        List<LogEntry> log;
        lock (_logGate)
            log = _log.Where(l => l.RepoName == repoName).Take(10).ToList();
        return new EngineDebug(
            _runs.IsBusy(repoId),
            Interval.TotalSeconds,
            _states.TryGetValue(repoId, out var s) ? s : null,
            _lastDriveSent.TryGetValue(repoId, out var d) ? d : null,
            _suggestWait.TryGetValue(repoId, out var w) ? w : null,
            _armGen.TryGetValue(repoId, out var g) ? g : null,
            _lastIntercepted.TryGetValue(repoId, out var li) ? li : null,
            intercepts, log);
    }

    public override Task StartAsync(CancellationToken cancellationToken)
    {
        _runs.RunCompleted += OnRunCompleted;
        return base.StartAsync(cancellationToken);
    }

    public override Task StopAsync(CancellationToken cancellationToken)
    {
        _runs.RunCompleted -= OnRunCompleted;
        return base.StopAsync(cancellationToken);
    }

    /// <summary>The pin's lineage tracker (fix-loop-conversation-identity, D3):
    /// every <c>--resume</c> FORKS a new session id, so when a builder-lane run for
    /// a repo with an active DRIVEN loop completes with a captured session id, the
    /// loop's pin advances to that fork. Unconditional on who started the run:
    /// there is one builder conversation per repo and both legitimate writers move
    /// it — the loop's own sends AND the human (a suggest-mode pending prompt is
    /// sent by the human from the composer). Understanding jobs never claim the
    /// builder lane, so background work can't move the pin. A run that dies before
    /// its session event carries null and leaves the pin unmoved.</summary>
    private void OnRunCompleted(RunSessionService.RunCompletedEvent e)
    {
        if (e.Lane != "builder" || string.IsNullOrWhiteSpace(e.SessionId)) return;
        if (_loops.Get(e.RepoId) is not { Active: true } loop
            || loop.Kind == LoopConfigStore.KindSuggestion) return;
        _loops.SetSessionId(e.RepoId, e.SessionId);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // ConfigureAwait(false) throughout: a hosted service must never depend on
        // the ambient synchronization context — a captured WinForms context once
        // froze this engine at its first await (openspec fix-startup-handle-race).
        // First tick after a short delay so startup isn't competing with the build.
        try { await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken).ConfigureAwait(false); } catch { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { Tick(); }
            catch (Exception ex) { _logger.Error($"[AUTOPILOT] engine tick failed: {ex.Message}"); }

            try { await Task.Delay(Interval, stoppingToken).ConfigureAwait(false); }
            catch (OperationCanceledException) { break; }
        }
    }

    private void Tick()
    {
        // Operator gate off (the default) → the engine is idle, just like the
        // endpoints return 403 (plans/loop-autopilot-safety.md). No classifying,
        // no transcript reads — autopilot does nothing until the host opts in.
        if (!_operatorGate.Enabled)
        {
            if (!_states.IsEmpty) _states.Clear();
            return;
        }

        var cfg = _config.Get();
        var nowOffset = DateTimeOffset.UtcNow;
        var now = nowOffset.ToUnixTimeMilliseconds();

        // The label space the suggestion kind may pick from — the user's editable
        // custom prompts (enriched by the cached mining pass), not a built-in list.
        var routines = Routines(nowOffset);

        foreach (var repo in _repos.GetAll())
        {
            var loop = _loops.Get(repo.Id);

            // A missing repo folder RESOLVES an armed loop instead of silently
            // skipping it forever (fix-suggestion-loop-inert, D2): Resolve clears
            // Active, so this fires exactly once and the dock shows a terminal
            // error instead of an eternally-"looping" zombie. Repos without an
            // active loop are still just skipped.
            if (!repo.Exists)
            {
                if (loop is { Active: true })
                {
                    _loops.Resolve(repo.Id, "error", "repo-missing",
                        $"repo folder no longer exists: {repo.Path}");
                    _logger.Error($"[LOOP] {repo.Name}: repo folder missing ({repo.Path}) — resolving armed {loop.Kind} loop as error");
                }
                continue;
            }

            // No active instance → nothing to do; surface the terminal state if any.
            if (loop is not { Active: true })
            {
                Set(repo.Id, new AgentState(repo.Id, repo.Name, false, "off", null, 0,
                    loop is null ? "" : $"loop {loop.Status}", "", now));
                continue;
            }

            var isSuggestionKind = loop.Kind == LoopConfigStore.KindSuggestion;

            // Kill switch off → every armed instance is paused (reverts to manual).
            if (!cfg.Enabled)
            {
                Set(repo.Id, new AgentState(repo.Id, repo.Name, isSuggestionKind, "paused",
                    null, 0, "kill switch is off", "", now));
                continue;
            }

            // A running agent isn't idle — wait for its turn to finish.
            if (_runs.IsBusy(repo.Id))
            {
                Keep(repo.Id, "running", repo, isSuggestionKind, now);
                continue;
            }

            var run = _runs.Get(repo.Id);
            // Conversation identity (openspec: fix-loop-conversation-identity, D4):
            // driven kinds read from and resume the loop's PINNED session only —
            // the repo's transcript folder is shared by every conversation and every
            // --resume fork, so "newest file" is an unrelated-writer race. The
            // suggestion kind keeps the newest-file read by design (it reacts to
            // whatever the repo's current trailing message is; it drives nothing).
            string? sessionId;
            string? lastAssistant;
            DateTime? lastAssistantAt;
            if (isSuggestionKind)
            {
                (sessionId, lastAssistant, lastAssistantAt) = LastAssistantMessage(repo.Path);
            }
            else
            {
                sessionId = loop.SessionId;
                if (sessionId is null)
                {
                    // Null pin (pre-pin loops.json, or no transcript at arm time):
                    // resolve newest-file ONCE and lock it in — never per tick.
                    (sessionId, _, _) = LastAssistantMessage(repo.Path);
                    if (sessionId != null) _loops.SetSessionId(repo.Id, sessionId);
                }
                if (sessionId is null) { lastAssistant = null; lastAssistantAt = null; }
                else (lastAssistant, lastAssistantAt) = LastAssistantMessageIn(repo.Path, sessionId);
            }

            // Reply freshness is TEMPORAL (openspec: fix-loop-verify-stale-reply):
            // once a drive loop has sent this arming, the trailing transcript
            // message counts as the reply to that send only if it is NEWER than
            // the send. When the transcript has no fresh reply, fall back to the
            // reply the run buffer WITNESSED streaming (the CLI can complete a
            // run, bill it, stream the reply — and never persist it; seen live
            // 2026-07-31, escalating a queue verification against the previous
            // step's stale reply). Only when neither source is fresh is the reply
            // treated as missing — never judged, only retried or resolved no-reply.
            var replyMissing = false;
            if (!isSuggestionKind && loop.Mode == LoopConfigStore.ModeDrive
                && loop.LastSentAt > 0 && loop.LastSentAt >= loop.ArmedAt)
            {
                var sentUtc = DateTimeOffset.FromUnixTimeMilliseconds(loop.LastSentAt).UtcDateTime;
                if (lastAssistantAt is not { } replyAt || replyAt <= sentUtc)
                {
                    if (run is { } r && r.Status != "running"
                        && r.ReplyTextAtUtc is { } witnessedAt && witnessedAt > sentUtc
                        && !string.IsNullOrWhiteSpace(r.ReplyText))
                    {
                        lastAssistant = r.ReplyText;
                        lastAssistantAt = witnessedAt;
                        _logger.Info($"[LOOP] {repo.Name}: transcript has no reply newer than the last send — judging the run's streamed reply");
                    }
                    else
                    {
                        replyMissing = true;
                    }
                }
            }
            var snippet = Snippet(lastAssistant ?? "");

            // A NEW arm generation clears the per-repo dedup guards: a freshly
            // armed instance must act on the agent's CURRENT trailing message even
            // if a previous instance already acted on that very message.
            if (!_armGen.TryGetValue(repo.Id, out var gen) || gen != loop.ArmedAt)
            {
                _armGen[repo.Id] = loop.ArmedAt;
                _lastDriveSent.TryRemove(repo.Id, out _);
                _suggestWait.TryRemove(repo.Id, out _);
                _driveNoReply.TryRemove(repo.Id, out _);
                _driveNoReplyMisses.TryRemove(repo.Id, out _);
                // A stale pend must never consume into the NEW arming's queue —
                // the un-sent item is still in the stash, so nothing is lost.
                _pendingConsume.TryRemove(repo.Id, out _);
            }

            // Driven kinds need a session to resume into; wait for the agent to speak.
            if (!isSuggestionKind && string.IsNullOrWhiteSpace(sessionId)) continue;

            if (isSuggestionKind && string.IsNullOrWhiteSpace(lastAssistant))
            {
                Set(repo.Id, new AgentState(repo.Id, repo.Name, true, "idle", null, 0,
                    "no recent agent message", "", now));
                continue;
            }

            // Drive no-reply handling: our last send has no fresh reply in either
            // source. While the run is in flight, just wait. Once it has finished:
            // one grace tick (covers transcript flush), then let the kind decide
            // again WITH NO REPLY TEXT — it re-proposes its phase's prompt, and
            // every resend still bumps the iteration counter, so the cap bounds
            // retries too. After MaxNoReplyRetries consecutive reply-less runs,
            // stop the loop instead. Stale trailing text is never judged.
            if (loop.Mode == LoopConfigStore.ModeDrive && replyMissing
                && run?.Status != "stopped")
            {
                // An operator-stopped run skips the retry dance entirely: the
                // ladder resolves it stopped · by-operator below (advance-queue-loop,
                // D1) — resending the prompt the human just killed would fight them.
                if (run is null || run.Status == "running") continue;
                if (_driveNoReply.TryAdd(repo.Id, 0))
                {
                    Set(repo.Id, new AgentState(repo.Id, repo.Name, isSuggestionKind, "idle",
                        null, 0, $"run {run.Status} with no new reply — retrying", snippet, now));
                    continue;
                }
                _driveNoReply.TryRemove(repo.Id, out _);
                var misses = _driveNoReplyMisses.AddOrUpdate(repo.Id, 1, (_, n) => n + 1);
                if (misses > MaxNoReplyRetries)
                {
                    _loops.Resolve(repo.Id, "error", "no-reply",
                        $"agent produced no reply in {misses} consecutive runs");
                    _logger.Error($"[LOOP] {repo.Name}: no reply in {misses} consecutive runs — stopping");
                    Append(new LogEntry(now, repo.Name, "escalated", "no reply from agent", 0));
                    continue;
                }
                _logger.Info($"[LOOP] {repo.Name}: run {run.Status} produced no new reply — deciding again without one (retry {misses}/{MaxNoReplyRetries})");
            }
            else if (loop.Mode == LoopConfigStore.ModeDrive)
            {
                // A fresh reply arrived (or nothing was sent yet); episode over.
                _driveNoReply.TryRemove(repo.Id, out _);
                _driveNoReplyMisses.TryRemove(repo.Id, out _);
            }
            // Suggest dedup: a pending proposal is already recorded against this
            // message — the loop advances when the agent's reply changes (D9).
            if (loop.Mode == LoopConfigStore.ModeSuggest
                && _suggestWait.TryGetValue(repo.Id, out var sw) && sw == snippet) continue;

            // Queue kind, suggest mode (openspec: queue-based-loop, D2): reaching
            // here past the guard means the pend's wait broke — the human sent it
            // from the composer and the agent's reply moved. That IS the pend
            // being consumed: the item leaves the stash and the step is stamped
            // (entering verify-owed) BEFORE deciding on the new reply.
            if (loop.Mode == LoopConfigStore.ModeSuggest
                && _pendingConsume.TryRemove(repo.Id, out var pc))
            {
                _dock.RemoveStash(pc.Ref.TabId, pc.Ref.ItemId);
                loop = _loops.RecordQueueStep(repo.Id, pc.StepText) ?? loop;
                _logger.Info($"[LOOP] {repo.Name}: queue step consumed on reply (suggest mode)");
            }

            // The CLI brain runs OFF the tick path (fix-suggestion-loop-inert,
            // D5): the first tick that sees a new trailing message starts one
            // background classification and holds; a later tick consumes the
            // cached verdict. Placed BEFORE the interception block so the
            // intercept entry is created on the tick that actually decides.
            PromptClassifier.Verdict? cliVerdict = null;
            if (isSuggestionKind && cfg.Brain == AutopilotConfigStore.BrainCli
                && !string.IsNullOrWhiteSpace(lastAssistant))
            {
                var (v, inFlight) = _cliBrain.TryGetOrStart(
                    repo.Id, lastAssistant!, snippet, cfg.Threshold, cfg.DenyList, routines, cfg.BrainModel);
                if (inFlight)
                {
                    Set(repo.Id, new AgentState(repo.Id, repo.Name, true, "idle",
                        null, 0, "classifying with the CLI brain…", snippet, now));
                    continue;
                }
                cliVerdict = v;
            }

            // Interception feed (suggestion kind only, as before): one entry the
            // first time we see this trailing message for the repo.
            InterceptEvent? intercept = null;
            if (isSuggestionKind
                && (!_lastIntercepted.TryGetValue(repo.Id, out var li) || li != snippet))
            {
                _lastIntercepted[repo.Id] = snippet;
                intercept = BeginIntercept(repo, snippet, now);
            }

            // The kind's SEMANTICS — one decision (revision 2, D7).
            if (!_kinds.TryGetValue(loop.Kind, out var impl))
            {
                _logger.Error($"[LOOP] {repo.Name}: no implementation for kind \"{loop.Kind}\"");
                continue;
            }
            // Pre-arm freshness gate (openspec: fix-loop-arm-freshness): for DRIVEN
            // kinds, a trailing reply older than this arming is the human's previous
            // conversation, not a response to the loop — deciding on it fired the
            // deny-list/sentinel/NEEDS_HUMAN ladder against stale history (iteration
            // 0 escalates). Decide as if the agent had not spoken yet, so the first
            // act is sending the stored prompt. A missing timestamp keeps the old
            // behavior; the suggestion kind acts on the current message by design.
            var preArm = !isSuggestionKind && lastAssistantAt is { } atUtc
                && atUtc < DateTimeOffset.FromUnixTimeMilliseconds(loop.ArmedAt).UtcDateTime;
            // Null LastAssistant uniformly means "the agent has not answered yet"
            // (openspec: fix-loop-verify-stale-reply): pre-arm history and a
            // send whose reply never landed both decide as if unanswered — the
            // kind (re)proposes its phase's prompt and judges nothing.
            var noReply = preArm || replyMissing;
            // Non-blocking FLAG: capture (docs/loop-driven-agent-convention.md):
            // lift the fresh reply's "FLAG: <sentence>" lines into the ledger
            // BEFORE the kind judges it, so a reply that also stops the loop
            // (sentinel, NEEDS_HUMAN, deny-list) still gets its flags kept. Never
            // feeds the decision ladder; pre-arm history is never mined (those
            // flags belong to the human's previous conversation, if anything).
            // The channel switch (FlagsStore.Enabled) fences capture and the
            // briefing's teaching line together — off means off end to end.
            if (_flags.Enabled
                && !isSuggestionKind && !noReply && !string.IsNullOrWhiteSpace(lastAssistant)
                && lastAssistantAt is { } minedAt
                && (!_lastFlagMined.TryGetValue(repo.Id, out var mined) || mined != minedAt))
            {
                _lastFlagMined[repo.Id] = minedAt;
                var flagLines = FlagsStore.ExtractFlagLines(lastAssistant!);
                if (flagLines.Count > 0)
                {
                    var kept = _flags.Record(repo.Id, repo.Name, loop.Kind, loop.IterationsDone, flagLines);
                    _logger.Info($"[FLAGS] {repo.Name}: {flagLines.Count} FLAG line(s) in the reply, {kept} new");
                }
            }
            var decision = impl.Decide(new LoopContext(
                loop,
                noReply ? null : lastAssistant,
                !preArm && run?.Status == "error",
                !preArm && run?.Status == "stopped",
                // Per-arm deny-list when the instance carries one (advance-queue-loop,
                // D2); null = the global default. An empty per-arm list is honored —
                // it is the operator's explicit "no deny terms this arm".
                loop.DenyList ?? cfg.DenyList, cfg.Threshold, routines, cliVerdict,
                // Queue kind (openspec: queue-based-loop, D2): the bound tab's LIVE
                // stash, read this tick — null when the tab no longer exists (the
                // kind resolves error). Other kinds never look.
                loop.Kind == LoopConfigStore.KindQueue
                    ? _dock.GetStash(loop.QueueTabId ?? "")
                    : null));

            Execute(repo, loop, decision, sessionId, snippet, intercept, now);
        }
    }

    /// <summary>The shared MECHANICS for a kind's decision (revision 2, D7/D9).</summary>
    private void Execute(
        RepositoryRegistry.RepositoryInfo repo, LoopConfigStore.LoopState loop,
        LoopDecision decision, string? sessionId, string snippet,
        InterceptEvent? intercept, long now)
    {
        var isSuggestionKind = loop.Kind == LoopConfigStore.KindSuggestion;
        var prev = _states.TryGetValue(repo.Id, out var p) ? p : null;

        switch (decision)
        {
            case LoopDecision.Stop stop:
                // Error stops repeat while the run stays errored — resolve once.
                if (loop.Status != stop.Status)
                {
                    _loops.Resolve(repo.Id, stop.Status, stop.Reason, stop.Detail);
                    _logger.Info($"[LOOP] {repo.Name} {loop.Kind} -> {stop.Status} ({stop.Reason}: {stop.Detail})");
                }
                if (intercept != null)
                    FinishIntercept(intercept, "escalated", null, 0, now);
                return;

            case LoopDecision.Hold hold:
            {
                var state = hold.Escalate ? "escalate" : "idle";
                Set(repo.Id, new AgentState(repo.Id, repo.Name, isSuggestionKind, state,
                    hold.Label, hold.Confidence, hold.Reason, snippet, now));
                if (hold.Escalate && (prev is null || prev.Decision != state || prev.Label != hold.Label))
                    Append(new LogEntry(now, repo.Name, "escalated", hold.Label, hold.Confidence));
                if (intercept != null)
                    FinishIntercept(intercept, "escalated", hold.Label, hold.Confidence, now);
                return;
            }

            case LoopDecision.Propose propose:
                if (loop.Mode == LoopConfigStore.ModeSuggest)
                {
                    // Suggest: record the pending prompt (pre-fills the composer);
                    // nothing is sent, the counter does not advance, and we hold
                    // until the agent's reply changes.
                    _loops.SetPending(repo.Id, propose.Prompt);
                    if (propose.EnterPhase != null) _loops.SetPhase(repo.Id, propose.EnterPhase);
                    // Queue kind: remember which stash item this pend was read
                    // from — consumed only when the wait breaks (see Tick), never
                    // at decide time (D2).
                    if (propose.ConsumeStash is { } pendRef)
                        _pendingConsume[repo.Id] = (pendRef, propose.Prompt);
                    _suggestWait[repo.Id] = snippet;
                    Set(repo.Id, new AgentState(repo.Id, repo.Name, isSuggestionKind, "suggestion",
                        propose.Prompt, propose.Confidence, "pending — pre-filled for you to send", snippet, now));
                    if (prev is null || prev.Decision != "suggestion" || prev.Label != propose.Prompt)
                        Append(new LogEntry(now, repo.Name, "suggested", Snippet(propose.Prompt), propose.Confidence));
                    if (intercept != null)
                        FinishIntercept(intercept, "suggested", propose.Prompt, propose.Confidence, now);
                    return;
                }

                // Drive: the cap gates every send, including a goal loop's
                // verification send (0 = uncapped, the suggestion default).
                if (loop.MaxIterations > 0 && loop.IterationsDone >= loop.MaxIterations)
                {
                    var detail = $"cap {loop.IterationsDone}/{loop.MaxIterations} reached"
                        + (propose.EnterPhase == LoopConfigStore.PhaseVerify ? " before verification" : "");
                    _loops.Resolve(repo.Id, "capped", "cap", detail);
                    if (intercept != null) FinishIntercept(intercept, "escalated", null, 0, now);
                    return;
                }
                if (string.IsNullOrWhiteSpace(sessionId)) return;
                // The situational briefing (openspec: loop-agent-briefing, D1/D2):
                // composed HERE, at the one drive choke point, so every driven kind
                // is covered and the suggest branch above stays structurally raw.
                // propose.Prompt remains the RAW stored text everywhere below —
                // consume refs, RecordQueueStep, audit, state snippets — only the
                // text handed to the CLI is the composition. The suggestion kind's
                // auto-sends are routine prompts, not loop-driven work; they stay
                // unbriefed.
                string? briefed = null;
                var briefingRev = 0;
                if (loop.Kind != LoopConfigStore.KindSuggestion)
                {
                    var (rev, rules) = _briefing.EnabledTexts();
                    briefingRev = rev;
                    briefed = LoopConfigStore.ComposeBriefedPrompt(
                        loop.Kind, propose.EnterPhase, loop.Sentinel, propose.Prompt, rules,
                        _flags.Enabled);
                }
                if (SendPrompt(repo, sessionId!, loop, propose.Prompt, briefed, briefingRev,
                        propose.Confidence, snippet, intercept, now))
                {
                    // Consume-on-land (queue kind, D2/D3): the head item leaves the
                    // stash only now that its send actually fired, and the step is
                    // stamped — RecordQueueStep sets the phase itself (verify-owed,
                    // or straight back to work when verification is opted out), so
                    // the proposal's EnterPhase is superseded for this case.
                    if (propose.ConsumeStash is { } sref)
                    {
                        _dock.RemoveStash(sref.TabId, sref.ItemId);
                        _loops.RecordQueueStep(repo.Id, propose.Prompt, briefingRev);
                    }
                    // Flip the phase only after the send actually fired — a failed
                    // slot claim leaves the loop as-is so the next tick retries.
                    else if (propose.EnterPhase != null) _loops.SetPhase(repo.Id, propose.EnterPhase);
                    Set(repo.Id, new AgentState(repo.Id, repo.Name, isSuggestionKind, "sent",
                        Snippet(propose.Prompt), propose.Confidence,
                        isSuggestionKind ? $"auto-sent \"{propose.Prompt}\"" : $"{loop.Kind} loop sent",
                        snippet, now));
                    if (isSuggestionKind)
                        Append(new LogEntry(now, repo.Name, "sent", propose.Prompt, propose.Confidence));
                }
                else if (intercept != null)
                {
                    FinishIntercept(intercept, "suggested", propose.Prompt, propose.Confidence, now);
                }
                return;
        }
    }

    /// <summary>
    /// The ONE send path (revision 2): sends a decided prompt to the agent, resuming
    /// its session through the same detached-run path the chat UI uses. Returns false
    /// without sending if the run slot is already claimed (the next tick retries).
    /// Every send bumps the instance's iteration counter and is audited — outcome
    /// "sent" for the suggestion kind (matching the old auto-advance rows), "loop"
    /// for the driven kinds — so unattended sends stay durably recorded. A suggestion
    /// intercept stays "processing" (spinner) for the whole resumed run and flips to
    /// "sent" only when the run completes.
    /// </summary>
    private bool SendPrompt(
        RepositoryRegistry.RepositoryInfo repo, string sessionId,
        LoopConfigStore.LoopState loop, string prompt, string? briefedPrompt, int briefingRev,
        double confidence, string snippet,
        InterceptEvent? intercept, long now)
    {
        // Atomically claim the builder slot. If a turn is already running for this
        // repo (started by the user or a prior tick), don't pile on.
        if (!_runs.TryBeginRun(repo.Id, "builder", out var session)) return false;

        _lastDriveSent[repo.Id] = snippet;
        var state = _loops.RecordSend(repo.Id, now);
        var iter = state?.IterationsDone ?? loop.IterationsDone + 1;
        var isSuggestionKind = loop.Kind == LoopConfigStore.KindSuggestion;
        var path = repo.Path;
        // What the CLI receives vs what the records carry (openspec:
        // loop-agent-briefing, D3): the agent gets the briefed composition; audit,
        // sent-history, and the chat's synthetic user bubble keep the RAW stored
        // text plus the briefed flag + rules revision, so truncated surfaces stay
        // readable and the exact sent text stays reconstructable.
        var sendText = briefedPrompt ?? prompt;
        var briefed = briefedPrompt != null;

        _audit.Record(new AutopilotAuditLog.Entry(
            now, repo.Id, repo.Name, prompt, confidence, snippet,
            isSuggestionKind ? "sent" : "loop", briefed, briefingRev));
        _logger.Info(isSuggestionKind
            ? $"[AUTOPILOT] auto-sent \"{prompt}\" to \"{repo.Name}\" (conf {confidence:0.00})"
            : $"[LOOP] resent to \"{repo.Name}\" (iteration {iter}{(loop.MaxIterations > 0 ? $"/{loop.MaxIterations}" : "")})");

        if (intercept != null) { intercept.Label = prompt; intercept.Confidence = confidence; }

        _ = Task.Run(async () =>
        {
            try
            {
                // A loop send bypasses the composer, so no client ever draws the
                // prompt bubble. Publish the prompt into the run's seq buffer
                // ahead of the CLI's events: attached clients render it live and
                // late attachers get it in the ?after=N replay (openspec
                // fix-loop-prompt-render).
                await session.EmitAsync(new { type = "user", text = prompt, actor = "loop", briefed, briefingRev });
                await _cli.RunAsync(
                    sendText, sessionId, workingDirectory: path,
                    emit: session.EmitAsync, ct: session.Cts.Token);
            }
            catch (Exception ex)
            {
                _logger.Error($"[LOOP] {loop.Kind} send run for \"{repo.Name}\" crashed: {ex.Message}");
            }
            finally
            {
                session.Complete();
                if (intercept != null)
                    FinishIntercept(intercept, "sent", prompt, confidence,
                        DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            }
        });
        return true;
    }

    private InterceptEvent BeginIntercept(RepositoryRegistry.RepositoryInfo repo, string snippet, long now)
    {
        var ev = new InterceptEvent
        {
            Id = Guid.NewGuid().ToString("n"),
            At = now, RepoId = repo.Id, RepoName = repo.Name, Snippet = snippet,
        };
        lock (_interceptGate)
        {
            _intercepts.AddFirst(ev);
            while (_intercepts.Count > MaxIntercepts) _intercepts.RemoveLast();
        }
        return ev;
    }

    private void FinishIntercept(InterceptEvent ev, string outcome, string? label, double confidence, long doneAt)
    {
        lock (_interceptGate)
        {
            ev.Phase = "done";
            ev.Outcome = outcome;
            ev.Label = label;
            ev.Confidence = confidence;
            ev.DoneAt = doneAt;
        }
    }

    private void Set(string repoId, AgentState state) => _states[repoId] = state;

    // Preserve the last suggestion fields while flipping only the decision (e.g. running).
    private void Keep(string repoId, string decision, RepositoryRegistry.RepositoryInfo repo, bool armed, long now)
    {
        if (_states.TryGetValue(repoId, out var prev))
            _states[repoId] = prev with { Decision = decision, UpdatedAt = now };
        else
            _states[repoId] = new AgentState(repoId, repo.Name, armed, decision, null, 0, "", "", now);
    }

    private void Append(LogEntry entry)
    {
        lock (_logGate)
        {
            _log.AddFirst(entry);
            while (_log.Count > MaxLog) _log.RemoveLast();
        }
    }

    // Newest transcript's session id + its last assistant message (with its UTC
    // timestamp, for the pre-arm freshness gate in Tick), read directly (light:
    // one file read, no metadata parse of every session like ListSessions does).
    // The session id is what an auto-send resumes.
    private (string? SessionId, string? Text, DateTime? AtUtc) LastAssistantMessage(string repoPath)
    {
        try
        {
            var dir = SessionService.ProjectsDirectoryFor(repoPath);
            if (!Directory.Exists(dir)) return (null, null, null);
            var newest = new DirectoryInfo(dir).EnumerateFiles("*.jsonl")
                .OrderByDescending(f => f.LastWriteTimeUtc).FirstOrDefault();
            if (newest is null) return (null, null, null);
            var sessionId = Path.GetFileNameWithoutExtension(newest.Name);
            var (text, at) = LastAssistantMessageIn(repoPath, sessionId);
            return (sessionId, text, at);
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] read last message for {repoPath} failed: {ex.Message}");
            return (null, null, null);
        }
    }

    // The pinned read (fix-loop-conversation-identity, D4): the last assistant
    // message of ONE named session — a fixed file, immune to whatever else writes
    // to the repo's shared transcript folder. A missing/empty session reads as
    // "the agent has not spoken yet", which sends the stored prompt into the pin.
    // Synthetic lines (the CLI's "No response requested." resume repair) are not
    // agent replies and are skipped (openspec: fix-loop-verify-stale-reply) — a
    // repair carries a CURRENT timestamp, so without this it would pass the
    // temporal freshness gate and be judged as a verification verdict.
    private (string? Text, DateTime? AtUtc) LastAssistantMessageIn(string repoPath, string sessionId)
    {
        try
        {
            var last = _sessions.GetMessages(repoPath, sessionId)
                .LastOrDefault(m => m.Role == "assistant" && !m.Synthetic);
            return (last?.Text, last?.Timestamp?.ToUniversalTime());
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] read session {sessionId} for {repoPath} failed: {ex.Message}");
            return (null, null);
        }
    }

    public static string Snippet(string text)
    {
        var s = text.Replace('\n', ' ').Replace('\r', ' ').Trim();
        return s.Length > 180 ? s[..180] + "…" : s;
    }
}
