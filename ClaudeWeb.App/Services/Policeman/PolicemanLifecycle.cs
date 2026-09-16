using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;

namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// The policeman's LIFECYCLE — deterministic (openspec kanban-policeman-conversation): the states
/// its conversation is in and what moves it. Start arms a recipe loop with the ritual prompt;
/// the engine ticks it; every turn is accounted for and the session is rolled over at the
/// context cap with a mechanical handover; an errored or capped loop is re-armed; the Operator's
/// Stop, a pending question (escalate) and the gate are honoured. The model is inside one box
/// only — the turn itself — which the engine runs; this class never reads its words except for
/// their size. Rules are pure in <see cref="PolicemanLifecycleRules"/>; state is in
/// <see cref="ArchStateStore"/>; the arch is reached only through <see cref="IArchConversationHost"/>.
/// </summary>
public sealed class PolicemanLifecycle : IArchConversationHook
{
    private readonly ArchStateStore _state;
    private readonly LoopConfigStore _loops;
    private readonly RunSessionService _runs;
    private readonly TaskGraphService _graph;
    private readonly IArchConversationHost _arch;
    private readonly Logger _logger;

    public PolicemanLifecycle(ArchStateStore state, LoopConfigStore loops, RunSessionService runs, TaskGraphService graph, IArchConversationHost arch, Logger logger)
    {
        _state = state;
        _loops = loops;
        _runs = runs;
        _graph = graph;
        _arch = arch;
        _logger = logger;
    }

    private static string Key => PolicemanIdentity.ConversationId;
    private int IntervalSeconds => PolicemanLifecycleRules.CleanInterval(_state.Policeman.IntervalSeconds);
    private int ContextCap => PolicemanLifecycleRules.CleanCap(_state.Policeman.ContextCapTokens);
    private string Prompt() => PolicemanPrompt.Compose(_graph.Get().Goal);
    private void EnsureConversation() => _state.EnsureConversation(Key, PolicemanIdentity.ConversationName);

    /// <summary>The open session's id, for the provenance stamp on what the policeman records.</summary>
    public string? CurrentSessionId() => _state.Policeman.Sessions.LastOrDefault(s => s.EndedAt is null)?.SessionId;

    // ---- the Operator's controls -------------------------------------------------------------

    /// <summary>What the Kanban's Policeman subtab shows above the conversation.</summary>
    public object Status()
    {
        var p = _state.Policeman;
        var loop = _loops.Get(Key);
        var run = _runs.Get(Key);
        var board = _graph.Get();
        var verdict = BoardIntegrity.Assess(board.Nodes, _arch.Now(), _graph.StaleAfterMs);
        return new
        {
            conversationId = Key,
            name = PolicemanIdentity.ConversationName,
            exists = _state.HasConversation(Key),
            sessionId = _arch.ResolveSessionId(Key),
            enabled = p.Enabled,
            intervalSeconds = IntervalSeconds,
            contextCapTokens = ContextCap,
            maxTurnsPerSession = PolicemanLifecycleRules.MaxTurnsPerSession,
            lastContextTokens = p.LastContextTokens,
            turnsThisSession = p.TurnsThisSession,
            lastTurnAt = p.LastTurnAt == 0 ? (long?)null : p.LastTurnAt,
            rollovers = p.Rollovers,
            restarts = p.Restarts,
            lastRolloverAt = p.LastRolloverAt,
            handoverPending = p.HandoverPending,
            sessions = p.Sessions,
            loop = loop is null ? null : new
            {
                kind = loop.Kind, active = loop.Active, status = loop.Status, iterationsDone = loop.IterationsDone,
                maxIterations = loop.MaxIterations, lastSentAt = loop.LastSentAt, stopReason = loop.StopReason, stopDetail = loop.StopDetail,
                armedAt = loop.ArmedAt,
            },
            running = run?.Status == "running",
            verdict = new { checkedAt = verdict.CheckedAt, cards = verdict.Cards, honest = verdict.Honest, dishonest = verdict.Dishonest, stuck = verdict.Stuck, manual = verdict.Manual, flagged = verdict.Flagged },
            boardGoal = string.IsNullOrWhiteSpace(board.Goal) ? null : board.Goal,
            prompt = Prompt(),
            allowedTools = PolicemanToolPolicy.AllowedTools.OrderBy(t => t, StringComparer.Ordinal).ToList(),
        };
    }

    /// <summary>▶ Start: the conversation exists and its recipe loop is armed with the ritual
    /// prompt — uncapped in effect, since the tick re-arms it when capped.</summary>
    public ArchAgentService.ToolOutcome Start()
    {
        _arch.EnsureHome();
        EnsureConversation();
        var state = Arm();
        _state.SetPolicemanEnabled(true);
        _logger.Info($"[POLICE] armed on {Key} every {IntervalSeconds}s (cap {ContextCap} tokens, session {(state.SessionId is null ? "new" : state.SessionId[..8])})");
        return new ArchAgentService.ToolOutcome(true, "armed", $"policeman armed: one pass every {IntervalSeconds / 60} min");
    }

    /// <summary>■ Stop: the loop stops and stays stopped (the tick will not re-arm).</summary>
    public void Stop()
    {
        _loops.Stop(Key, LoopConfigStore.ArmedByOperator);
        _state.SetPolicemanEnabled(false);
        _logger.Info("[POLICE] stopped by the Operator");
    }

    /// <summary>👁 Check now: one pass at once (the loop, if armed, keeps its own clock). Busy
    /// when a turn is running.</summary>
    public ArchAgentService.ToolOutcome CheckNow()
    {
        _arch.EnsureHome();
        EnsureConversation();
        var (ok, error) = _arch.Send(Key, Prompt(), PolicemanIdentity.Actor);
        return ok ? new ArchAgentService.ToolOutcome(true, "sent", "policeman pass started") : new ArchAgentService.ToolOutcome(false, "busy", error);
    }

    public void SetSettings(int? intervalSeconds, int? contextCapTokens)
    {
        _state.SetPolicemanSettings(intervalSeconds, contextCapTokens);
        // A running loop carries the prompt it was armed with; the interval is read live.
        if (_loops.Get(Key) is { Active: true }) _loops.Update(Key, Prompt(), PolicemanIdentity.Sentinel, null);
    }

    /// <summary>↻ Roll over: cut the current session and start the next prompt in a fresh one,
    /// with a mechanical handover built from the board (the policeman's state lives on the
    /// cards, so nothing that matters is lost). The old session stays readable by id.</summary>
    public void Rollover(string reason)
    {
        var board = _graph.Get();
        var verdict = BoardIntegrity.Assess(board.Nodes, _arch.Now(), _graph.StaleAfterMs);
        var needs = board.Nodes.Where(n => n.NeedsHuman is not null)
            .Select(n => (TaskGraphService.CardRef(n.Id), n.Title, n.NeedsHuman!.By, n.NeedsHuman.Reason)).ToList();
        var summary = PolicemanPrompt.VerdictSummary(verdict, needs);
        var rolloversBefore = _state.Policeman.Rollovers;
        var prev = _state.BeginPolicemanRollover(reason, PolicemanPrompt.Handover(rolloversBefore, _arch.ResolveSessionId(Key), reason, summary), _arch.Now());
        _arch.ForgetSession(Key);
        _logger.Info($"[POLICE] rolled over (#{rolloversBefore + 1}): {reason}; previous session {(prev is null ? "none" : prev[..Math.Min(8, prev.Length)])}");
    }

    // ---- the engine's hooks (IArchConversationHook) ------------------------------------------

    public bool Owns(string? conversationId) => PolicemanIdentity.IsPoliceman(conversationId);

    /// <summary>Every engine tick: a forever loop that must not break down. Enabled + no active
    /// loop → re-arm (see <see cref="PolicemanLifecycleRules.ReArmReason"/>); an active loop's
    /// prompt is kept in step with the board goal; a loop the Operator stopped from the loops
    /// lane disables the policeman.</summary>
    public void OnEngineTick()
    {
        var p = _state.Policeman;
        if (!p.Enabled) return;
        EnsureConversation();
        var loop = _loops.Get(Key);
        if (loop is { Active: true })
        {
            if (!string.Equals(loop.Prompt, Prompt(), StringComparison.Ordinal)) _loops.Update(Key, Prompt(), PolicemanIdentity.Sentinel, null);
            return;
        }
        if (loop is { Status: "stopped" })
        {
            _state.SetPolicemanEnabled(false);
            _logger.Info("[POLICE] loop stopped from the loops lane — policeman disabled");
            return;
        }
        var why = PolicemanLifecycleRules.ReArmReason(loop?.Status, p.LastTurnAt, _arch.Now());
        if (why is null) return;
        Arm();
        _state.NotePolicemanRestart();
        _logger.Info($"[POLICE] re-armed: {why}");
    }

    /// <summary>After every policeman turn (the engine's and the Operator's): record the session
    /// and its context size; roll over when the cap is passed.</summary>
    public void AfterTurn(string conversationId, string? sessionId)
    {
        var tokens = _runs.Get(Key)?.LastContextTokens;
        _state.NotePolicemanTurn(sessionId, tokens, _arch.Now());
        var p = _state.Policeman;
        if (PolicemanLifecycleRules.NeedsRollover(p.LastContextTokens, ContextCap, p.TurnsThisSession, PolicemanLifecycleRules.MaxTurnsPerSession))
            Rollover(p.LastContextTokens is { } t && t >= ContextCap
                ? $"its context reached {t:N0} tokens (cap {ContextCap:N0})"
                : $"it took {p.TurnsThisSession} turns (cap {PolicemanLifecycleRules.MaxTurnsPerSession})");
    }

    /// <summary>A prompt about to go into the conversation gets the parked handover in front (once).</summary>
    public string DecorateSend(string conversationId, string text)
    {
        var handover = _state.TakePolicemanHandover();
        return handover is null ? text : handover + "\n\n" + text;
    }

    /// <summary>The policeman's own interval is its driven-loop quiet floor.</summary>
    public TimeSpan? QuietFloorFor(string conversationId) => TimeSpan.FromSeconds(IntervalSeconds);

    private LoopConfigStore.LoopState Arm() =>
        _loops.Start(Key, Prompt(), PolicemanIdentity.Sentinel, PolicemanLifecycleRules.LoopCap,
            recipeId: null, recipeName: PolicemanIdentity.RecipeName, mode: LoopConfigStore.ModeDrive,
            sessionId: _arch.ResolveSessionId(Key), armedBy: LoopConfigStore.ArmedByOperator);
}
