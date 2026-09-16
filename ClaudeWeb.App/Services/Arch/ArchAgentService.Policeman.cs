using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.TaskGraph;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The policeman conversation (openspec kanban-policeman-conversation), the harness-bound
/// half: the reserved sibling conversation <see cref="ArchPoliceman.ConversationId"/> and
/// its forever recipe loop, start / stop / check-now / settings, the tick that keeps the loop
/// alive (re-arm when capped or errored, never over the Operator's Stop or a pending
/// question), the context accounting after every turn and the ROLLOVER to a fresh session
/// with a mechanical handover, plus the three board-integrity tools. The pure rules live in
/// <see cref="ArchPoliceman"/>; the state in <see cref="ArchStateStore"/>. Everything else —
/// the turn, the chat, the tool-call history, the loops lane, the kill switch, the audit —
/// is the arch's, unchanged.
/// </summary>
public partial class ArchAgentService
{
    public const string ActorPoliceman = ArchPoliceman.Actor;

    private string PolicemanKey => ArchPoliceman.ConversationId;

    /// <summary>The quiet floor for a driven loop on <paramref name="key"/>: the policeman's
    /// own interval, every other conversation the shared floor.</summary>
    public TimeSpan DrivenQuietFloorFor(string? key) =>
        ArchPoliceman.IsPoliceman(key) ? TimeSpan.FromSeconds(PolicemanIntervalSeconds) : DrivenQuietFloor;

    private int PolicemanIntervalSeconds => ArchPoliceman.CleanInterval(_state.Policeman.IntervalSeconds);
    private int PolicemanContextCap => ArchPoliceman.CleanCap(_state.Policeman.ContextCapTokens);

    private string PolicemanPrompt() => ArchPoliceman.Prompt(_graph.Get().Goal);

    private ArchStateStore.Conversation EnsurePolicemanConversation() =>
        _state.EnsureConversation(PolicemanKey, ArchPoliceman.ConversationName);

    /// <summary>What the Kanban's Policeman subtab shows above the conversation.</summary>
    public object PolicemanStatus()
    {
        var key = PolicemanKey;
        var p = _state.Policeman;
        var loop = _loops.Get(key);
        var run = _runs.Get(key);
        var board = _graph.Get();
        var verdict = BoardIntegrity.Assess(board.Nodes, Now(), _graph.StaleAfterMs);
        return new
        {
            conversationId = key,
            name = ArchPoliceman.ConversationName,
            exists = _state.HasConversation(key),
            sessionId = ResolveArchSessionId(key),
            enabled = p.Enabled,
            intervalSeconds = PolicemanIntervalSeconds,
            contextCapTokens = PolicemanContextCap,
            maxTurnsPerSession = ArchPoliceman.MaxTurnsPerSession,
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
            prompt = PolicemanPrompt(),
            allowedTools = ArchPoliceman.AllowedTools.OrderBy(t => t, StringComparer.Ordinal).ToList(),
        };
    }

    /// <summary>Start (or re-arm) the policeman: its conversation exists, its recipe loop is
    /// armed with the ritual prompt, uncapped in effect (the tick re-arms when capped).</summary>
    public ToolOutcome StartPoliceman()
    {
        EnsureHome();
        EnsurePolicemanConversation();
        var key = PolicemanKey;
        var state = _loops.Start(key, PolicemanPrompt(), ArchPoliceman.Sentinel, ArchPoliceman.LoopCap,
            recipeId: null, recipeName: ArchPoliceman.RecipeName, mode: LoopConfigStore.ModeDrive,
            sessionId: ResolveArchSessionId(key), armedBy: LoopConfigStore.ArmedByOperator);
        _state.SetPolicemanEnabled(true);
        _logger.Info($"[POLICE] armed on {key} every {PolicemanIntervalSeconds}s (cap {PolicemanContextCap} tokens, session {(state.SessionId is null ? "new" : Short(state.SessionId))})");
        return new ToolOutcome(true, "armed", $"policeman armed: one pass every {PolicemanIntervalSeconds / 60} min");
    }

    /// <summary>The Operator's Stop: the loop stops and stays stopped (the tick will not re-arm).</summary>
    public void StopPoliceman()
    {
        _loops.Stop(PolicemanKey, LoopConfigStore.ArmedByOperator);
        _state.SetPolicemanEnabled(false);
        _logger.Info("[POLICE] stopped by the Operator");
    }

    /// <summary>One pass now: the ritual prompt sent to the conversation at once (the loop, if
    /// armed, keeps its own clock). Busy when a turn is running.</summary>
    public ToolOutcome PolicemanCheckNow()
    {
        EnsureHome();
        EnsurePolicemanConversation();
        var (ok, error, _) = SendToArch(PolicemanKey, PolicemanPrompt(), ActorPoliceman);
        return ok ? new ToolOutcome(true, "sent", "policeman pass started") : new ToolOutcome(false, "busy", error);
    }

    public void SetPolicemanSettings(int? intervalSeconds, int? contextCapTokens)
    {
        _state.SetPolicemanSettings(intervalSeconds, contextCapTokens);
        // A running loop carries the prompt it was armed with; the interval is read live.
        if (_loops.Get(PolicemanKey) is { Active: true }) _loops.Update(PolicemanKey, PolicemanPrompt(), ArchPoliceman.Sentinel, null);
    }

    /// <summary>Engine tick: a forever loop that must not break down. Enabled + no active
    /// loop → re-arm, except while it holds a question for the Operator (escalate) or after
    /// the Operator's own Stop (which disables it). An errored turn re-arms after a cooldown,
    /// so a broken CLI is not hammered. The board goal changing re-arms the prompt text too.</summary>
    public void PolicemanTick()
    {
        var p = _state.Policeman;
        if (!p.Enabled) return;
        var key = PolicemanKey;
        EnsurePolicemanConversation();
        var loop = _loops.Get(key);
        if (loop is { Active: true })
        {
            // Keep the loop's prompt in step with the board goal (the goal is part of it).
            if (!string.Equals(loop.Prompt, PolicemanPrompt(), StringComparison.Ordinal))
                _loops.Update(key, PolicemanPrompt(), ArchPoliceman.Sentinel, null);
            return;
        }
        var now = Now();
        string? why = loop is null ? "no loop armed" : loop.Status switch
        {
            "capped" => "the loop cap was reached",
            "done" => "the loop resolved done (the sentinel must never be written)",
            "error" => now - p.LastTurnAt >= (long)ArchPoliceman.ErrorCooldown.TotalMilliseconds ? "an errored turn, after the cooldown" : null,
            "escalate" => null,   // it asked the Operator something: their reply resumes it
            "stopped" => null,    // the Operator stopped it from the loops lane: honour that
            _ => null,
        };
        if (loop is { Status: "stopped" }) { _state.SetPolicemanEnabled(false); _logger.Info("[POLICE] loop stopped from the loops lane — policeman disabled"); return; }
        if (why is null) return;
        _loops.Start(key, PolicemanPrompt(), ArchPoliceman.Sentinel, ArchPoliceman.LoopCap,
            recipeId: null, recipeName: ArchPoliceman.RecipeName, mode: LoopConfigStore.ModeDrive,
            sessionId: ResolveArchSessionId(key), armedBy: LoopConfigStore.ArmedByOperator);
        _state.NotePolicemanRestart();
        _logger.Info($"[POLICE] re-armed: {why}");
    }

    /// <summary>After every policeman turn (the engine's and the Operator's): record the
    /// session and its context size; roll over when the cap is passed.</summary>
    private void AfterPolicemanTurn(string? sessionId)
    {
        var key = PolicemanKey;
        var tokens = _runs.Get(key)?.LastContextTokens;
        var now = Now();
        _state.NotePolicemanTurn(sessionId, tokens, now);
        var p = _state.Policeman;
        if (ArchPoliceman.NeedsRollover(p.LastContextTokens, PolicemanContextCap, p.TurnsThisSession, ArchPoliceman.MaxTurnsPerSession))
            RolloverPoliceman(p.LastContextTokens is { } t && t >= PolicemanContextCap
                ? $"its context reached {t:N0} tokens (cap {PolicemanContextCap:N0})"
                : $"it took {p.TurnsThisSession} turns (cap {ArchPoliceman.MaxTurnsPerSession})");
    }

    /// <summary>Cut the current session and start the next prompt in a fresh one, with a
    /// mechanical handover built from the board (the policeman's state lives on the cards,
    /// so nothing that matters is lost). The old session's transcript and tool calls stay
    /// readable by session id.</summary>
    public void RolloverPoliceman(string reason)
    {
        var key = PolicemanKey;
        var board = _graph.Get();
        var verdict = BoardIntegrity.Assess(board.Nodes, Now(), _graph.StaleAfterMs);
        var needs = board.Nodes.Where(n => n.NeedsHuman is not null)
            .Select(n => (TaskGraphService.CardRef(n.Id), n.Title, n.NeedsHuman!.By, n.NeedsHuman.Reason)).ToList();
        var summary = ArchPoliceman.VerdictSummary(verdict, needs);
        var rolloversBefore = _state.Policeman.Rollovers;
        var prev = _state.BeginPolicemanRollover(reason, ArchPoliceman.Handover(rolloversBefore, ResolveArchSessionId(key), reason, summary), Now());
        _state.SetSessionId(key, null);
        if (_loops.Get(key) is not null) _loops.SetSessionId(key, null);
        _logger.Info($"[POLICE] rolled over (#{rolloversBefore + 1}): {reason}; previous session {(prev is null ? "none" : Short(prev))}");
    }

    /// <summary>A policeman prompt with the parked handover in front of it (once).</summary>
    private string DecoratePolicemanSend(string key, string text)
    {
        if (!ArchPoliceman.IsPoliceman(key)) return text;
        var handover = _state.TakePolicemanHandover();
        return handover is null ? text : handover + "\n\n" + text;
    }

    // ---- tools (openspec kanban-board-integrity) ------------------------------------------------

    /// <summary>The harness's verdict on the board, judged live from the recorded facts.</summary>
    public ToolOutcome ToolBoardIntegrity()
    {
        var board = _graph.Get();
        var now = Now();
        var s = BoardIntegrity.Assess(board.Nodes, now, _graph.StaleAfterMs);
        var flagged = s.Flagged.Select(f => new { id = f.Id, @ref = TaskGraphService.CardRef(f.Id), title = f.Title, state = f.State, reason = f.Reason }).ToList();
        var needsHuman = board.Nodes.Where(n => n.NeedsHuman is not null).Select(n => new
        {
            id = n.Id, @ref = TaskGraphService.CardRef(n.Id), title = n.Title, status = n.Status, manual = n.Manual,
            by = n.NeedsHuman!.By, reason = n.NeedsHuman.Reason, at = n.NeedsHuman.At, requestId = n.NeedsHuman.RequestId,
        }).ToList();
        AuditTool("board_integrity", null, $"{s.Dishonest} dishonest, {s.Stuck} stuck");
        return new ToolOutcome(true, "ok",
            $"{s.Cards} card(s): {s.Honest} honest, {s.Dishonest} dishonest, {s.Stuck} stuck, {s.Manual} manual; {needsHuman.Count} carry a human request",
            new { checkedAt = s.CheckedAt, cards = s.Cards, honest = s.Honest, dishonest = s.Dishonest, stuck = s.Stuck, manual = s.Manual, flagged, needsHuman, boardGoal = string.IsNullOrWhiteSpace(board.Goal) ? null : board.Goal, staleHours = _graph.StaleAfterMs / 3600_000.0 });
    }

    /// <summary>Stamp "human assistance requested" by the policeman, with a reason.</summary>
    public ToolOutcome ToolFlagNeedsHuman(string? id, string? reason)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        if (string.IsNullOrWhiteSpace(reason)) return new ToolOutcome(false, "error", "reason is required — say why a human is needed");
        var (resolved, err) = _graph.ResolveTaskRef(id);
        if (resolved is null) return new ToolOutcome(false, "error", err ?? $"no task {id}");
        var cur = _graph.Find(resolved)!;
        if (cur.Manual) return new ToolOutcome(false, "manual", $"task {TaskGraphService.CardRef(resolved)} is manual — the Operator handles it directly; not flagged");
        if (cur.NeedsHuman is { } existing && existing.By != BoardIntegrity.Policeman)
            return new ToolOutcome(true, "already", $"task {TaskGraphService.CardRef(resolved)} already carries a request by the {existing.By}: {existing.Reason}", cur);
        var node = _graph.SetNeedsHuman(resolved, new TaskGraphService.HumanRequest(Now(), BoardIntegrity.Policeman, reason.Trim()), Now())!;
        AuditTool("flag_needs_human", node.RepoId, "flagged");
        return new ToolOutcome(true, "flagged", $"task {TaskGraphService.CardRef(resolved)} \"{node.Title}\": human assistance requested — {reason.Trim()}", node);
    }

    /// <summary>Withdraw the policeman's own stamp; never another raiser's.</summary>
    public ToolOutcome ToolClearNeedsHuman(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        var (resolved, err) = _graph.ResolveTaskRef(id);
        if (resolved is null) return new ToolOutcome(false, "error", err ?? $"no task {id}");
        var cur = _graph.Find(resolved)!;
        if (cur.NeedsHuman is null) return new ToolOutcome(true, "clear", $"task {TaskGraphService.CardRef(resolved)} carries no request", cur);
        if (cur.NeedsHuman.By != BoardIntegrity.Policeman)
            return new ToolOutcome(false, "not-yours", $"the request on task {TaskGraphService.CardRef(resolved)} was raised by the {cur.NeedsHuman.By}; only the Operator resolves it");
        var node = _graph.SetNeedsHuman(resolved, null, Now(), onlyIfBy: BoardIntegrity.Policeman)!;
        AuditTool("clear_needs_human", node.RepoId, "cleared");
        return new ToolOutcome(true, "cleared", $"task {TaskGraphService.CardRef(resolved)} \"{node.Title}\": request withdrawn", node);
    }
}
