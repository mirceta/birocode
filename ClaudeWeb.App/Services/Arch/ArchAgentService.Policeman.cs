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

    // ---- what the policeman READ (openspec policeman-observes-agents) --------------------------

    /// <summary>The open policeman session, for the provenance stamp on an observation.</summary>
    private string? CurrentPolicemanSessionId() => _state.Policeman.Sessions.LastOrDefault(s => s.EndedAt is null)?.SessionId;

    /// <summary>Record what the policeman read in an assignee's conversation: a fixed state
    /// and a one-sentence summary, stamped by the policeman, now, in this session. A no-op
    /// when nothing changed. Refused on a manual card.</summary>
    public ToolOutcome ToolObserveCard(string? id, string? state, string? summary)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        var st = state?.Trim().ToLowerInvariant();
        if (!CardObservations.IsState(st)) return new ToolOutcome(false, "error", $"state must be one of {CardObservations.StateList}");
        if (string.IsNullOrWhiteSpace(summary)) return new ToolOutcome(false, "error", "summary is required — one sentence in plain words saying what you read");
        var (resolved, err) = _graph.ResolveTaskRef(id);
        if (resolved is null) return new ToolOutcome(false, "error", err ?? $"no task {id}");
        var cur = _graph.Find(resolved)!;
        var cref = TaskGraphService.CardRef(resolved);
        if (cur.Manual) return new ToolOutcome(false, "manual", $"task {cref} is manual — the Operator handles it directly; not observed");
        var text = summary.Trim();
        if (text.Length > CardObservations.MaxSummary) text = text[..CardObservations.MaxSummary].TrimEnd() + "…";
        if (cur.Observation is { } prev && prev.By == BoardIntegrity.Policeman && prev.State == st && prev.Summary == text)
        {
            AuditTool("observe_card", cur.RepoId, "unchanged");
            return new ToolOutcome(true, "unchanged", $"task {cref} already reads {st}: {text}", cur);
        }
        var obs = new TaskGraphService.CardObservation(Now(), BoardIntegrity.Policeman, st!, text, CurrentPolicemanSessionId());
        var node = _graph.SetObservation(resolved, obs, Now())!;
        AuditTool("observe_card", node.RepoId, st!);
        var (word, _) = CardObservations.States[st!];
        return new ToolOutcome(true, "observed", $"task {cref} \"{node.Title}\": agent {word} — {text} (by the policeman, this session)", node);
    }

    /// <summary>Withdraw the policeman's own observation; never another reader's.</summary>
    public ToolOutcome ToolClearObservation(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        var (resolved, err) = _graph.ResolveTaskRef(id);
        if (resolved is null) return new ToolOutcome(false, "error", err ?? $"no task {id}");
        var cur = _graph.Find(resolved)!;
        var cref = TaskGraphService.CardRef(resolved);
        if (cur.Observation is null) return new ToolOutcome(true, "clear", $"task {cref} carries no observation", cur);
        if (cur.Observation.By != BoardIntegrity.Policeman) return new ToolOutcome(false, "not-yours", $"the observation on task {cref} was made by {cur.Observation.By}; not yours to clear");
        var node = _graph.SetObservation(resolved, null, Now(), onlyIfBy: BoardIntegrity.Policeman)!;
        AuditTool("clear_observation", node.RepoId, "cleared");
        return new ToolOutcome(true, "cleared", $"task {cref} \"{node.Title}\": observation withdrawn", node);
    }

    // ---- moving a card to the facts (openspec policeman-syncs-cards) ---------------------------

    /// <summary>The pull requests of one managed repo's GitHub remote, each traced back to the
    /// card it delivers (pure <see cref="PrTrace"/>), so a card sitting BEHIND its PR (Doing
    /// while the PR is open) can be found. Read-only; gh runs without a clone.</summary>
    public ToolOutcome ToolListPullRequests(string? machine, string? repoId, string? state)
    {
        var agent = ResolveAgentRef(machine, repoId);
        if (agent.Error is not null || agent.RepoId is null) return new ToolOutcome(false, "error", agent.Error ?? "repoId is required");
        var target = agent.Target;
        var rid = agent.RepoId;
        string? remoteUrl;
        string label;
        string auditKey;
        if (target.IsSelf)
        {
            var repo = _repos.GetAll().FirstOrDefault(r => r.Id == rid);
            if (repo is null || !IsManaged(rid)) { AuditTool("list_pull_requests", rid, Unmanaged); return new ToolOutcome(false, Unmanaged, $"{rid} is not a managed repo"); }
            remoteUrl = RemoteUrl(repo.Path);
            label = repo.Name;
            auditKey = rid;
        }
        else
        {
            var src = target.Source!;
            if (!IsManagedFleet(src.Id, rid)) { AuditTool("list_pull_requests", ArchStateStore.FleetKey(src.Id, rid), Unmanaged); return new ToolOutcome(false, Unmanaged, $"{rid} on {src.Label} is not a managed agent"); }
            var view = RemoteAgents(refreshPeers: false, nonBlocking: true).FirstOrDefault(a => a.SourceId == src.Id && a.RepoId == rid);
            if (view is null) return new ToolOutcome(false, Unreachable, $"{src.Label} did not report {rid}");
            remoteUrl = view.RemoteUrl;
            label = $"{view.Name} on {src.Label}";
            auditKey = ArchStateStore.FleetKey(src.Id, rid);
        }
        var ownerRepo = PrRef.OwnerRepoOf(remoteUrl);
        if (ownerRepo is null) return new ToolOutcome(false, "no-github-remote", $"{label} has no GitHub remote ({(string.IsNullOrWhiteSpace(remoteUrl) ? "none" : remoteUrl)}); its pull requests cannot be listed");
        var st = (state ?? "open").Trim().ToLowerInvariant();
        if (st is not ("open" or "merged" or "closed" or "all")) return new ToolOutcome(false, "error", "state must be open | merged | closed | all");
        var prs = _prProbe.ListPrs(ownerRepo, st, 50);
        var nodes = _graph.Get().Nodes;
        var traced = 0;
        var behind = 0;
        var items = prs.Select(pr =>
        {
            var m = PrTrace.Trace(pr, nodes, rid);
            var merged = string.Equals(pr.State, "MERGED", StringComparison.OrdinalIgnoreCase);
            var isBehind = m is not null && !merged && string.Equals(pr.State, "OPEN", StringComparison.OrdinalIgnoreCase) && TaskLifecycle.Rank(m.Node.Status) < TaskLifecycle.Rank(TaskLifecycle.PrOpened)
                        || m is not null && merged && TaskLifecycle.Rank(m.Node.Status) < TaskLifecycle.Rank(TaskLifecycle.PrMerged);
            if (m is not null) traced++;
            if (isBehind) behind++;
            return new
            {
                number = pr.Number, title = pr.Title, url = pr.Url, state = pr.State, draft = pr.IsDraft, headBranch = pr.HeadRefName, headCommit = pr.HeadRefOid,
                author = pr.Author, updatedAt = pr.UpdatedAt, body = pr.Body,
                tracedTo = m is null ? null : new
                {
                    id = m.Node.Id, @ref = TaskGraphService.CardRef(m.Node.Id), title = m.Node.Title, status = m.Node.Status,
                    how = m.How, sure = m.Strength >= 2, behind = isBehind,
                },
            };
        }).ToList();
        AuditTool("list_pull_requests", auditKey, $"{prs.Count} {st}, {traced} traced");
        return new ToolOutcome(true, "ok",
            $"{prs.Count} {st} PR(s) in {ownerRepo}: {traced} traced to a card, {behind} with the card BEHIND its PR (sync_card them)",
            new { ownerRepo, state = st, pullRequests = items });
    }

    /// <summary>Link a card to the branch / PR that delivers it and re-verify the board NOW:
    /// the card moves to the column the FACTS support — forward only, never by opinion
    /// (Doing → PR open once the PR is on GitHub; → Merged once merged). Refused on a manual
    /// card. Returns moved | linked | unchanged, always with the reason.</summary>
    public ToolOutcome ToolSyncCard(string? id, string? branch, string? pr, string? assignee, string? machine)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        var (resolved, err) = _graph.ResolveTaskRef(id);
        if (resolved is null) return new ToolOutcome(false, "error", err ?? $"no task {id}");
        var cur = _graph.Find(resolved)!;
        var cref = TaskGraphService.CardRef(resolved);
        if (cur.Manual) return new ToolOutcome(false, "manual", $"task {cref} is manual — the Operator handles it directly; not touched");
        if (!string.IsNullOrWhiteSpace(pr) && PrRef.FromUrl(pr) is null) return new ToolOutcome(false, "error", "pr must be a GitHub pull request URL (https://github.com/<owner>/<repo>/pull/<n>)");
        var set = TaskGraphService.AssigneesOf(cur);
        string? key = null;
        if (!string.IsNullOrWhiteSpace(assignee))
        {
            var agent = ResolveAgentRef(machine, assignee);
            if (agent.Error is not null || agent.RepoId is null) return new ToolOutcome(false, "error", agent.Error ?? $"could not resolve assignee \"{assignee}\"");
            key = TaskGraphService.AssigneeKey(agent.Target.IsSelf ? null : agent.Target.Source!.Id, agent.RepoId);
            if (set.All(a => a.Key != key))
                return new ToolOutcome(false, "error", $"{assignee.Trim()} is not an assignee of task {cref}; its assignees: {string.Join(", ", set.Select(a => AgentLabelOf(a.SourceId, a.RepoId)))}");
        }
        else if (set.Count > 1 && (!string.IsNullOrWhiteSpace(branch) || !string.IsNullOrWhiteSpace(pr)))
            return new ToolOutcome(false, "error", $"task {cref} has {set.Count} assignees ({string.Join(", ", set.Select(a => AgentLabelOf(a.SourceId, a.RepoId)))}); pass assignee to say whose branch / PR this is");

        var before = cur.Status;
        var linked = false;
        if (!string.IsNullOrWhiteSpace(branch) || !string.IsNullOrWhiteSpace(pr))
        {
            var after = _graph.RecordClaim(resolved, key, string.IsNullOrWhiteSpace(branch) ? null : branch.Trim(), null, string.IsNullOrWhiteSpace(pr) ? null : pr.Trim(), Now());
            linked = after is not null && !ReferenceEquals(after, cur);
        }
        // The harness moves the card, not the policeman: one verifier pass over the board,
        // exactly what the Operator's "Re-verify board" runs.
        var pass = _verifier.VerifyOnce();
        var node = _graph.Find(resolved)!;
        var moves = pass.Changes.Where(c => c.Id == resolved).Select(c => $"{(c.Assignee is null ? "" : c.Assignee + " ")}{c.From} → {c.To}").ToList();
        var short8 = TaskGraphService.ShortId(resolved);
        var notes = pass.Notes.Where(n => n.StartsWith(short8, StringComparison.Ordinal)).ToList();
        AuditTool("sync_card", node.RepoId, node.Status == before ? (linked ? "linked" : "unchanged") : $"{before} → {node.Status}");
        if (node.Status != before)
            return new ToolOutcome(true, "moved", $"task {cref} \"{node.Title}\": {before} → {node.Status} — the facts support it ({string.Join("; ", moves)})", node);
        var mine = key is null ? null : TaskGraphService.AssigneesOf(node).FirstOrDefault(a => a.Key == key);
        var verified = mine?.VerifiedStatus ?? node.VerifiedStatus;
        var why = notes.Count > 0 ? string.Join("; ", notes)
            : verified is null ? "no facts observed for the recorded branch / PR yet"
            : $"the facts support {verified}, which is not ahead of {node.Status}";
        return new ToolOutcome(true, linked ? "linked" : "unchanged",
            $"task {cref} \"{node.Title}\" stays at {node.Status}{(linked ? " (linkage recorded; the verifier keeps checking it every minute)" : "")} — {why}; a card is never moved by opinion, only by the facts", node);
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
