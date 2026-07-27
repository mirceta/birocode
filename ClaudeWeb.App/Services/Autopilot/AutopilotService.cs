using System.Collections.Concurrent;
using ClaudeWeb.Services.Chat;
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
/// suggestion / 📋 recipe / 🎯 goal) for exactly one decision — hold, stop, or
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
/// discovery), so it needs no new hook into the live run buffer.
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
    private readonly AutopilotDiscoveryService _discovery;
    private readonly PromptsService _prompts;
    private readonly AutopilotAuditLog _audit;
    private readonly Logger _logger;

    private readonly ConcurrentDictionary<string, AgentState> _states = new();
    // Per-repo guard: the assistant-message snippet we last DROVE against (sent a
    // prompt for), so a tick that fires before the new run registers as busy can't
    // double-send.
    private readonly ConcurrentDictionary<string, string> _lastDriveSent = new();
    // Per-repo guard for SUGGEST mode: the snippet a pending proposal was recorded
    // against. Until the agent's reply changes, the instance is not re-decided —
    // this is what "the loop advances when the reply changes" means, and it keeps a
    // goal loop's phase from oscillating while its verification prompt sits unsent.
    private readonly ConcurrentDictionary<string, string> _suggestWait = new();
    // The ArmedAt stamp last seen per repo — a change means a re-arm, which
    // resets both guards above (see Tick).
    private readonly ConcurrentDictionary<string, long> _armGen = new();
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
        AutopilotGate operatorGate, PromptClassifier brain, AutopilotDiscoveryService discovery,
        PromptsService prompts, AutopilotAuditLog audit, IEnumerable<ILoop> kinds, Logger logger)
    {
        _repos = repos;
        _sessions = sessions;
        _runs = runs;
        _cli = cli;
        _config = config;
        _loops = loops;
        _operatorGate = operatorGate;
        _brain = brain;
        _discovery = discovery;
        _prompts = prompts;
        _audit = audit;
        _logger = logger;
        _kinds = kinds.ToDictionary(k => k.Kind);

        DrainLegacyArming();
    }

    /// <summary>One-time migration (revision 2, D8): legacy autopilot.json
    /// ArmedRepoIds become armed suggestion loop instances (drive iff the legacy
    /// global auto-advance was on), then the legacy list is cleared so this never
    /// repeats. A repo that already has a loop instance keeps it — the loop won the
    /// slot under the old precedence rule too.</summary>
    private void DrainLegacyArming()
    {
        var cfg = _config.Get();
        if (cfg.ArmedRepoIds.Count == 0) return;
        var mode = cfg.AutoAdvance ? LoopConfigStore.ModeDrive : LoopConfigStore.ModeSuggest;
        foreach (var repoId in cfg.ArmedRepoIds)
        {
            if (_loops.Get(repoId) is { Active: true }) continue;
            _loops.StartSuggestion(repoId, mode);
        }
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

    /// <summary>The brain's current label space — the user's custom prompts, enriched by
    /// the (cached) mining pass. Cheap; safe to call every tick and from the API.</summary>
    public IReadOnlyList<PromptClassifier.Routine> Routines() => Routines(DateTimeOffset.UtcNow);

    private IReadOnlyList<PromptClassifier.Routine> Routines(DateTimeOffset now)
    {
        AutopilotDiscoveryService.DiscoveryResult mined;
        lock (_routineGate) mined = _mined;

        // Refresh the (expensive) mining cache at most once per window.
        if (now - _minedAt >= DiscoveryRefresh)
        {
            try
            {
                mined = _discovery.Discover();
                lock (_routineGate) { _mined = mined; _minedAt = now; }
            }
            catch (Exception ex)
            {
                _logger.Error($"[AUTOPILOT] discovery refresh failed (keeping previous): {ex.Message}");
                lock (_routineGate) mined = _mined;
            }
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

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // First tick after a short delay so startup isn't competing with the build.
        try { await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken); } catch { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { Tick(); }
            catch (Exception ex) { _logger.Error($"[AUTOPILOT] engine tick failed: {ex.Message}"); }

            try { await Task.Delay(Interval, stoppingToken); }
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

        foreach (var repo in _repos.GetAll().Where(r => r.Exists))
        {
            var loop = _loops.Get(repo.Id);

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
            var (sessionId, lastAssistant) = LastAssistantMessage(repo.Path);
            var snippet = Snippet(lastAssistant ?? "");

            // A NEW arm generation clears the per-repo dedup guards: a freshly
            // armed instance must act on the agent's CURRENT trailing message even
            // if a previous instance already acted on that very message.
            if (!_armGen.TryGetValue(repo.Id, out var gen) || gen != loop.ArmedAt)
            {
                _armGen[repo.Id] = loop.ArmedAt;
                _lastDriveSent.TryRemove(repo.Id, out _);
                _suggestWait.TryRemove(repo.Id, out _);
            }

            // Driven kinds need a session to resume into; wait for the agent to speak.
            if (!isSuggestionKind && string.IsNullOrWhiteSpace(sessionId)) continue;

            if (isSuggestionKind && string.IsNullOrWhiteSpace(lastAssistant))
            {
                Set(repo.Id, new AgentState(repo.Id, repo.Name, true, "idle", null, 0,
                    "no recent agent message", "", now));
                continue;
            }

            // Drive dedup: already sent against this exact trailing message (a tick
            // that fired before the new run registered busy) → don't double-send.
            if (loop.Mode == LoopConfigStore.ModeDrive
                && _lastDriveSent.TryGetValue(repo.Id, out var ds) && ds == snippet) continue;
            // Suggest dedup: a pending proposal is already recorded against this
            // message — the loop advances when the agent's reply changes (D9).
            if (loop.Mode == LoopConfigStore.ModeSuggest
                && _suggestWait.TryGetValue(repo.Id, out var sw) && sw == snippet) continue;

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
            var decision = impl.Decide(new LoopContext(
                loop, lastAssistant, run?.Status == "error", cfg.DenyList, cfg.Threshold, routines));

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
                if (SendPrompt(repo, sessionId!, loop, propose.Prompt, propose.Confidence, snippet, intercept, now))
                {
                    // Flip the phase only after the send actually fired — a failed
                    // slot claim leaves the loop as-is so the next tick retries.
                    if (propose.EnterPhase != null) _loops.SetPhase(repo.Id, propose.EnterPhase);
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
        LoopConfigStore.LoopState loop, string prompt, double confidence, string snippet,
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

        _audit.Record(new AutopilotAuditLog.Entry(
            now, repo.Id, repo.Name, prompt, confidence, snippet,
            isSuggestionKind ? "sent" : "loop"));
        _logger.Info(isSuggestionKind
            ? $"[AUTOPILOT] auto-sent \"{prompt}\" to \"{repo.Name}\" (conf {confidence:0.00})"
            : $"[LOOP] resent to \"{repo.Name}\" (iteration {iter}{(loop.MaxIterations > 0 ? $"/{loop.MaxIterations}" : "")})");

        if (intercept != null) { intercept.Label = prompt; intercept.Confidence = confidence; }

        _ = Task.Run(async () =>
        {
            try
            {
                await _cli.RunAsync(
                    prompt, sessionId, workingDirectory: path,
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

    // Newest transcript's session id + its last assistant message, read directly
    // (light: one file read, no metadata parse of every session like ListSessions
    // does). The session id is what an auto-send resumes.
    private (string? SessionId, string? Text) LastAssistantMessage(string repoPath)
    {
        try
        {
            var dir = SessionService.ProjectsDirectoryFor(repoPath);
            if (!Directory.Exists(dir)) return (null, null);
            var newest = new DirectoryInfo(dir).EnumerateFiles("*.jsonl")
                .OrderByDescending(f => f.LastWriteTimeUtc).FirstOrDefault();
            if (newest is null) return (null, null);
            var sessionId = Path.GetFileNameWithoutExtension(newest.Name);
            var msgs = _sessions.GetMessages(repoPath, sessionId);
            return (sessionId, msgs.LastOrDefault(m => m.Role == "assistant")?.Text);
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] read last message for {repoPath} failed: {ex.Message}");
            return (null, null);
        }
    }

    public static string Snippet(string text)
    {
        var s = text.Replace('\n', ' ').Replace('\r', ' ').Trim();
        return s.Length > 180 ? s[..180] + "…" : s;
    }
}
