using System.Collections.Concurrent;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The engine (plans/loop-autopilot-engine.md, option A — backend polling). A hosted
/// <see cref="BackgroundService"/> that, every ~10s, looks at each <b>armed</b> agent
/// (repo) that is idle, reads its last assistant message, asks the
/// <see cref="PromptClassifier"/> brain for a routine prompt or escalate, and records
/// the verdict as that agent's state — plus an append-only suggestion log.
///
/// When <b>auto-advance</b> is on (Slice 3, off by default), a confident, non-risky
/// suggestion is not just surfaced — the engine SENDS that routine prompt to the
/// agent (resuming its session) through the same <see cref="CliRunnerService"/> path
/// the chat UI uses, and records the send in the append-only
/// <see cref="AutopilotAuditLog"/>. When auto-advance is off it stays suggest-only
/// (the original Slice 2 behaviour): it classifies and surfaces, never sends.
///
/// The gate (threshold + deny-list + kill switch + operator gate) lives in
/// <see cref="AutopilotConfigStore"/>/<see cref="AutopilotGate"/> and is applied
/// before any send: ambiguity or risk → escalate, never auto-send.
///
/// It reads the last message from the on-disk transcript (the same source as
/// discovery), so it needs no new hook into the live run buffer.
/// </summary>
public class AutopilotService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);
    private const int MaxLog = 50;
    private const int MaxIntercepts = 50;

    private readonly RepositoryRegistry _repos;
    private readonly SessionService _sessions;
    private readonly RunSessionService _runs;
    private readonly CliRunnerService _cli;
    private readonly AutopilotConfigStore _config;
    private readonly AutopilotGate _operatorGate;
    private readonly PromptClassifier _brain;
    private readonly AutopilotDiscoveryService _discovery;
    private readonly AutopilotAuditLog _audit;
    private readonly Logger _logger;

    private readonly ConcurrentDictionary<string, AgentState> _states = new();
    // Per-repo guard: the assistant-message snippet we last auto-sent against, so a
    // tick that fires before the new run registers as busy can't double-send.
    private readonly ConcurrentDictionary<string, string> _lastSent = new();
    private readonly object _logGate = new();
    private readonly LinkedList<LogEntry> _log = new();
    // The live "Intercepted" feed: one entry per NEW agent message the engine grabs
    // and processes. Newest-first, capped. Dedup by repo+snippet so the same idle
    // message isn't re-intercepted every tick.
    private readonly object _interceptGate = new();
    private readonly LinkedList<InterceptEvent> _intercepts = new();
    private readonly ConcurrentDictionary<string, string> _lastIntercepted = new();

    public AutopilotService(
        RepositoryRegistry repos, SessionService sessions, RunSessionService runs,
        CliRunnerService cli, AutopilotConfigStore config, AutopilotGate operatorGate,
        PromptClassifier brain, AutopilotDiscoveryService discovery,
        AutopilotAuditLog audit, Logger logger)
    {
        _repos = repos;
        _sessions = sessions;
        _runs = runs;
        _cli = cli;
        _config = config;
        _operatorGate = operatorGate;
        _brain = brain;
        _discovery = discovery;
        _audit = audit;
        _logger = logger;
    }

    // The brain's label space, mined from the user's own history. Rebuilding it scans
    // every transcript (the discovery pass), so it's cached and refreshed only every
    // few minutes — never on the 10s tick. Empty until the first refresh, which makes
    // the engine escalate everything rather than act on a stale/absent set.
    private static readonly TimeSpan RoutineRefresh = TimeSpan.FromMinutes(5);
    private readonly object _routineGate = new();
    private IReadOnlyList<PromptClassifier.Routine> _routines = Array.Empty<PromptClassifier.Routine>();
    private DateTimeOffset _routinesBuiltAt = DateTimeOffset.MinValue;

    public IReadOnlyList<PromptClassifier.Routine> Routines()
    {
        lock (_routineGate) return _routines;
    }

    // Rebuild the label space from discovery if it's never been built or has gone
    // stale. Called from the tick (so it tracks the operator turning the gate on),
    // but the scan itself runs at most once per RoutineRefresh window.
    private IReadOnlyList<PromptClassifier.Routine> EnsureRoutines(DateTimeOffset now)
    {
        lock (_routineGate)
            if (now - _routinesBuiltAt < RoutineRefresh)
                return _routines;

        IReadOnlyList<PromptClassifier.Routine> built;
        try
        {
            built = PromptClassifier.BuildRoutines(_discovery.Discover());
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] routine-set rebuild failed (keeping previous): {ex.Message}");
            lock (_routineGate) return _routines;
        }

        lock (_routineGate)
        {
            _routines = built;
            _routinesBuiltAt = now;
        }
        _logger.Info($"[AUTOPILOT] routine label space rebuilt: {built.Count} routines mined from history");
        return built;
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

        // The label space the brain may pick from — the user's mined routines, not a
        // built-in list. Refreshed at most every few minutes inside this call.
        var routines = EnsureRoutines(nowOffset);

        foreach (var repo in _repos.GetAll().Where(r => r.Exists))
        {
            var armed = cfg.ArmedRepoIds.Contains(repo.Id);

            // Not armed → it's listed as "off"; we don't classify it.
            if (!armed)
            {
                Set(repo.Id, new AgentState(repo.Id, repo.Name, false, "off", null, 0, "", "", now));
                continue;
            }

            // Kill switch off → armed agents are paused (reverts to manual), no classifying.
            if (!cfg.Enabled)
            {
                Set(repo.Id, new AgentState(repo.Id, repo.Name, true, "paused", null, 0, "kill switch is off", "", now));
                continue;
            }

            // A running agent isn't idle — wait for its turn to finish.
            if (_runs.IsBusy(repo.Id))
            {
                Keep(repo.Id, "running", repo, armed, now);
                continue;
            }

            var (sessionId, lastAssistant) = LastAssistantMessage(repo.Path);
            if (string.IsNullOrWhiteSpace(lastAssistant))
            {
                Set(repo.Id, new AgentState(repo.Id, repo.Name, true, "idle", null, 0, "no recent agent message", "", now));
                continue;
            }

            var v = _brain.Classify(lastAssistant, cfg.Threshold, cfg.DenyList, routines);
            var snippet = Snippet(lastAssistant);
            var prev = _states.TryGetValue(repo.Id, out var p) ? p : null;

            // Interception: record one feed entry the first time we see this trailing
            // message for the repo (so an idle agent isn't re-intercepted every tick).
            // It starts in "processing"; the resolve below — or, for an auto-send, the
            // run's completion — flips it to "done".
            InterceptEvent? intercept = null;
            if (!_lastIntercepted.TryGetValue(repo.Id, out var li) || li != snippet)
            {
                _lastIntercepted[repo.Id] = snippet;
                intercept = BeginIntercept(repo, snippet, now);
            }

            // Auto-advance (Slice 3): a confident, non-risky suggestion is SENT, not
            // just surfaced. Everything else (escalate, low confidence, deny-listed)
            // has already been folded into v.Escalate by the gate, so we only ever
            // send a verdict the gate cleared.
            if (!v.Escalate && cfg.AutoAdvance && cfg.Enabled
                && !string.IsNullOrWhiteSpace(v.Label) && !string.IsNullOrWhiteSpace(sessionId))
            {
                if (TrySend(repo, sessionId!, v, snippet, now, intercept))
                {
                    Set(repo.Id, new AgentState(
                        repo.Id, repo.Name, true, "sent", v.Label, v.Confidence,
                        $"auto-sent \"{v.Label}\"", snippet, now));
                    Append(new LogEntry(now, repo.Name, "sent", v.Label, v.Confidence));
                    continue; // intercept stays "processing" until the run completes
                }
                // Send didn't fire (already running, or no slot) — fall through to
                // surfacing the suggestion; next idle tick retries.
            }

            var decision = v.Escalate ? "escalate" : "suggestion";
            Set(repo.Id, new AgentState(
                repo.Id, repo.Name, true, decision, v.Label, v.Confidence, v.Reason, snippet, now));

            // Log only when the verdict for this agent actually changes (not every tick).
            if (prev is null || prev.Decision != decision || prev.Label != v.Label)
                Append(new LogEntry(now, repo.Name, v.Escalate ? "escalated" : "suggested", v.Label, v.Confidence));

            // Resolve the interception (suggest-only, or a send that didn't fire).
            if (intercept != null)
                FinishIntercept(intercept, v.Escalate ? "escalated" : "suggested", v.Label, v.Confidence, now);
        }
    }

    /// <summary>
    /// Sends the routine prompt <paramref name="v"/>.Label to the agent, resuming its
    /// session, through the same detached-run path the chat UI uses. Returns false
    /// without sending if the slot is already claimed or we just sent against this
    /// very message (the pre-busy double-send guard). Every real send is audited.
    /// </summary>
    private bool TrySend(
        RepositoryRegistry.RepositoryInfo repo, string sessionId,
        PromptClassifier.Verdict v, string snippet, long now, InterceptEvent? intercept)
    {
        // Guard: don't send twice against the same trailing message before the run
        // we just started shows up as busy. A genuinely new agent reply has a new
        // snippet, so the loop still advances naturally.
        if (_lastSent.TryGetValue(repo.Id, out var sent) && sent == snippet)
            return false;

        // Atomically claim the builder slot. If a turn is already running for this
        // repo (started by the user or a prior tick), don't pile on.
        if (!_runs.TryBeginRun(repo.Id, "builder", out var session))
            return false;

        _lastSent[repo.Id] = snippet;
        var prompt = v.Label!;
        var path = repo.Path;

        _audit.Record(new AutopilotAuditLog.Entry(
            now, repo.Id, repo.Name, prompt, v.Confidence, snippet, "sent"));
        _logger.Info($"[AUTOPILOT] auto-sent \"{prompt}\" to \"{repo.Name}\" (conf {v.Confidence:0.00})");

        // The intercept stays "processing" (spinner) for the whole resumed run — a
        // real in-flight window — and flips to "sent" only when the run completes.
        if (intercept != null) { intercept.Label = prompt; intercept.Confidence = v.Confidence; }

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
                _logger.Error($"[AUTOPILOT] auto-send run for \"{repo.Name}\" crashed: {ex.Message}");
            }
            finally
            {
                session.Complete();
                if (intercept != null)
                    FinishIntercept(intercept, "sent", prompt, v.Confidence,
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

    private static string Snippet(string text)
    {
        var s = text.Replace('\n', ' ').Replace('\r', ' ').Trim();
        return s.Length > 180 ? s[..180] + "…" : s;
    }
}
