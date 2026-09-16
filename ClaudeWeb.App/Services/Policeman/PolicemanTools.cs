using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.TaskGraph;
using ToolOutcome = ClaudeWeb.Services.Arch.ArchAgentService.ToolOutcome;

namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// WHAT each policeman tool does — deterministically — when the model calls it (openspec
/// kanban-board-integrity, policeman-syncs-cards, policeman-observes-agents). The model chooses
/// WHEN to call and with what; the code here decides WHAT happens, and every outcome says why:
///   • <see cref="BoardIntegrityVerdict"/> — the mechanical judge's live verdict (read);
///   • <see cref="FlagNeedsHuman"/> / <see cref="ClearNeedsHuman"/> — the policeman's 🆘 stamp,
///     refused on a manual card, never another raiser's to clear;
///   • <see cref="ObserveCard"/> / <see cref="ClearObservation"/> — what it READ in an agent's
///     conversation, from a fixed vocabulary, stamped with who / when / which session;
///   • <see cref="ListPullRequests"/> — a repo's PRs traced back to cards (pure <see cref="PrTrace"/>);
///   • <see cref="SyncCard"/> — link a card's PR / branch and run one verifier pass: the HARNESS
///     moves the card, forward only, by the facts — never by the policeman's claim.
/// The fleet is reached only through <see cref="IAgentDirectory"/>; the board through
/// <see cref="TaskGraphService"/>; GitHub through <see cref="IPrFactsProbe"/>.
/// </summary>
public sealed class PolicemanTools
{
    private readonly TaskGraphService _graph;
    private readonly IPrFactsProbe _prProbe;
    private readonly TaskVerificationPoller _verifier;
    private readonly PolicemanLifecycle _lifecycle;
    private readonly IAgentDirectory _agents;

    public PolicemanTools(TaskGraphService graph, IPrFactsProbe prProbe, TaskVerificationPoller verifier, PolicemanLifecycle lifecycle, IAgentDirectory agents)
    {
        _graph = graph;
        _prProbe = prProbe;
        _verifier = verifier;
        _lifecycle = lifecycle;
        _agents = agents;
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private const string By = BoardIntegrity.Policeman;

    // ---- the board's verdict ------------------------------------------------------------------

    /// <summary>The harness's verdict on the board, judged live from the recorded facts.</summary>
    public ToolOutcome BoardIntegrityVerdict()
    {
        var board = _graph.Get();
        var s = BoardIntegrity.Assess(board.Nodes, Now(), _graph.StaleAfterMs);
        var flagged = s.Flagged.Select(f => new { id = f.Id, @ref = TaskGraphService.CardRef(f.Id), title = f.Title, state = f.State, reason = f.Reason }).ToList();
        var needsHuman = board.Nodes.Where(n => n.NeedsHuman is not null).Select(n => new
        {
            id = n.Id, @ref = TaskGraphService.CardRef(n.Id), title = n.Title, status = n.Status, manual = n.Manual,
            by = n.NeedsHuman!.By, reason = n.NeedsHuman.Reason, at = n.NeedsHuman.At, requestId = n.NeedsHuman.RequestId,
        }).ToList();
        _agents.AuditTool("board_integrity", null, $"{s.Dishonest} dishonest, {s.Stuck} stuck");
        return new ToolOutcome(true, "ok",
            $"{s.Cards} card(s): {s.Honest} honest, {s.Dishonest} dishonest, {s.Stuck} stuck, {s.Manual} manual; {needsHuman.Count} carry a human request",
            new { checkedAt = s.CheckedAt, cards = s.Cards, honest = s.Honest, dishonest = s.Dishonest, stuck = s.Stuck, manual = s.Manual, flagged, needsHuman, boardGoal = string.IsNullOrWhiteSpace(board.Goal) ? null : board.Goal, staleHours = _graph.StaleAfterMs / 3600_000.0 });
    }

    // ---- the policeman's 🆘 stamp -------------------------------------------------------------

    /// <summary>Stamp "human assistance requested" by the policeman, with a reason.</summary>
    public ToolOutcome FlagNeedsHuman(string? id, string? reason)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        if (string.IsNullOrWhiteSpace(reason)) return new ToolOutcome(false, "error", "reason is required — say why a human is needed");
        var (resolved, err) = _graph.ResolveTaskRef(id);
        if (resolved is null) return new ToolOutcome(false, "error", err ?? $"no task {id}");
        var cur = _graph.Find(resolved)!;
        var cref = TaskGraphService.CardRef(resolved);
        if (cur.Manual) return new ToolOutcome(false, "manual", $"task {cref} is manual — the Operator handles it directly; not flagged");
        if (cur.NeedsHuman is { } existing && existing.By != By)
            return new ToolOutcome(true, "already", $"task {cref} already carries a request by the {existing.By}: {existing.Reason}", cur);
        var node = _graph.SetNeedsHuman(resolved, new TaskGraphService.HumanRequest(Now(), By, reason.Trim()), Now())!;
        _agents.AuditTool("flag_needs_human", node.RepoId, "flagged");
        return new ToolOutcome(true, "flagged", $"task {cref} \"{node.Title}\": human assistance requested — {reason.Trim()}", node);
    }

    /// <summary>Withdraw the policeman's own stamp; never another raiser's.</summary>
    public ToolOutcome ClearNeedsHuman(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        var (resolved, err) = _graph.ResolveTaskRef(id);
        if (resolved is null) return new ToolOutcome(false, "error", err ?? $"no task {id}");
        var cur = _graph.Find(resolved)!;
        var cref = TaskGraphService.CardRef(resolved);
        if (cur.NeedsHuman is null) return new ToolOutcome(true, "clear", $"task {cref} carries no request", cur);
        if (cur.NeedsHuman.By != By)
            return new ToolOutcome(false, "not-yours", $"the request on task {cref} was raised by the {cur.NeedsHuman.By}; only the Operator resolves it");
        var node = _graph.SetNeedsHuman(resolved, null, Now(), onlyIfBy: By)!;
        _agents.AuditTool("clear_needs_human", node.RepoId, "cleared");
        return new ToolOutcome(true, "cleared", $"task {cref} \"{node.Title}\": request withdrawn", node);
    }

    // ---- what the policeman READ ---------------------------------------------------------------

    /// <summary>Record what the policeman read in an assignee's conversation: a fixed state and a
    /// one-sentence summary, stamped by the policeman, now, in this session. A no-op when nothing
    /// changed. Refused on a manual card.</summary>
    public ToolOutcome ObserveCard(string? id, string? state, string? summary)
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
        if (cur.Observation is { } prev && prev.By == By && prev.State == st && prev.Summary == text)
        {
            _agents.AuditTool("observe_card", cur.RepoId, "unchanged");
            return new ToolOutcome(true, "unchanged", $"task {cref} already reads {st}: {text}", cur);
        }
        var obs = new TaskGraphService.CardObservation(Now(), By, st!, text, _lifecycle.CurrentSessionId());
        var node = _graph.SetObservation(resolved, obs, Now())!;
        _agents.AuditTool("observe_card", node.RepoId, st!);
        var (word, _) = CardObservations.States[st!];
        return new ToolOutcome(true, "observed", $"task {cref} \"{node.Title}\": agent {word} — {text} (by the policeman, this session)", node);
    }

    /// <summary>Withdraw the policeman's own observation; never another reader's.</summary>
    public ToolOutcome ClearObservation(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        var (resolved, err) = _graph.ResolveTaskRef(id);
        if (resolved is null) return new ToolOutcome(false, "error", err ?? $"no task {id}");
        var cur = _graph.Find(resolved)!;
        var cref = TaskGraphService.CardRef(resolved);
        if (cur.Observation is null) return new ToolOutcome(true, "clear", $"task {cref} carries no observation", cur);
        if (cur.Observation.By != By) return new ToolOutcome(false, "not-yours", $"the observation on task {cref} was made by {cur.Observation.By}; not yours to clear");
        var node = _graph.SetObservation(resolved, null, Now(), onlyIfBy: By)!;
        _agents.AuditTool("clear_observation", node.RepoId, "cleared");
        return new ToolOutcome(true, "cleared", $"task {cref} \"{node.Title}\": observation withdrawn", node);
    }

    // ---- moving a card to the facts -------------------------------------------------------------

    /// <summary>The pull requests of one managed repo's GitHub remote, each traced back to the card
    /// it delivers (pure <see cref="PrTrace"/>), so a card sitting BEHIND its PR can be found.
    /// Read-only; gh runs without a clone.</summary>
    public ToolOutcome ListPullRequests(string? machine, string? repoId, string? state)
    {
        var agent = _agents.ResolveAgent(machine, repoId);
        if (agent.Error is not null || agent.RepoId is null) return new ToolOutcome(false, "error", agent.Error ?? "repoId is required");
        var remote = _agents.GitHubRemoteOf(agent);
        if (remote.Refusal is not null) return remote.Refusal;
        if (remote.OwnerRepo is null) return new ToolOutcome(false, "no-github-remote", $"{remote.Label} has no GitHub remote ({(string.IsNullOrWhiteSpace(remote.RemoteUrl) ? "none" : remote.RemoteUrl)}); its pull requests cannot be listed");
        var st = (state ?? "open").Trim().ToLowerInvariant();
        if (st is not ("open" or "merged" or "closed" or "all")) return new ToolOutcome(false, "error", "state must be open | merged | closed | all");
        var prs = _prProbe.ListPrs(remote.OwnerRepo, st, 50);
        var nodes = _graph.Get().Nodes;
        var traced = 0;
        var behind = 0;
        var items = prs.Select(pr =>
        {
            var m = PrTrace.Trace(pr, nodes, agent.RepoId);
            var isBehind = m is not null && CardIsBehind(m.Node.Status, pr.State);
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
        _agents.AuditTool("list_pull_requests", remote.AuditKey, $"{prs.Count} {st}, {traced} traced");
        return new ToolOutcome(true, "ok",
            $"{prs.Count} {st} PR(s) in {remote.OwnerRepo}: {traced} traced to a card, {behind} with the card BEHIND its PR (sync_card them)",
            new { ownerRepo = remote.OwnerRepo, state = st, pullRequests = items });
    }

    /// <summary>A card is behind its PR when the PR is open and the column is below PR open, or
    /// the PR is merged and the column is below Merged.</summary>
    public static bool CardIsBehind(string cardStatus, string prState)
    {
        if (string.Equals(prState, "MERGED", StringComparison.OrdinalIgnoreCase)) return TaskLifecycle.Rank(cardStatus) < TaskLifecycle.Rank(TaskLifecycle.PrMerged);
        if (string.Equals(prState, "OPEN", StringComparison.OrdinalIgnoreCase)) return TaskLifecycle.Rank(cardStatus) < TaskLifecycle.Rank(TaskLifecycle.PrOpened);
        return false;
    }

    /// <summary>Link a card to the branch / PR that delivers it and re-verify the board NOW: the
    /// card moves to the column the FACTS support — forward only, never by opinion. Refused on a
    /// manual card. Returns moved | linked | unchanged, always with the reason.</summary>
    public ToolOutcome SyncCard(string? id, string? branch, string? pr, string? assignee, string? machine)
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
            var agent = _agents.ResolveAgent(machine, assignee);
            if (agent.Error is not null || agent.RepoId is null) return new ToolOutcome(false, "error", agent.Error ?? $"could not resolve assignee \"{assignee}\"");
            key = TaskGraphService.AssigneeKey(agent.Target.IsSelf ? null : agent.Target.Source!.Id, agent.RepoId);
            if (set.All(a => a.Key != key))
                return new ToolOutcome(false, "error", $"{assignee.Trim()} is not an assignee of task {cref}; its assignees: {string.Join(", ", set.Select(a => _agents.AgentLabel(a.SourceId, a.RepoId)))}");
        }
        else if (set.Count > 1 && (!string.IsNullOrWhiteSpace(branch) || !string.IsNullOrWhiteSpace(pr)))
            return new ToolOutcome(false, "error", $"task {cref} has {set.Count} assignees ({string.Join(", ", set.Select(a => _agents.AgentLabel(a.SourceId, a.RepoId)))}); pass assignee to say whose branch / PR this is");

        var before = cur.Status;
        var linked = false;
        if (!string.IsNullOrWhiteSpace(branch) || !string.IsNullOrWhiteSpace(pr))
        {
            var after = _graph.RecordClaim(resolved, key, string.IsNullOrWhiteSpace(branch) ? null : branch.Trim(), null, string.IsNullOrWhiteSpace(pr) ? null : pr.Trim(), Now());
            linked = after is not null && !ReferenceEquals(after, cur);
        }
        // The harness moves the card, not the policeman: one verifier pass, exactly what the
        // Operator's "Re-verify board" runs.
        var pass = _verifier.VerifyOnce();
        var node = _graph.Find(resolved)!;
        var moves = pass.Changes.Where(c => c.Id == resolved).Select(c => $"{(c.Assignee is null ? "" : c.Assignee + " ")}{c.From} → {c.To}").ToList();
        var short8 = TaskGraphService.ShortId(resolved);
        var notes = pass.Notes.Where(n => n.StartsWith(short8, StringComparison.Ordinal)).ToList();
        _agents.AuditTool("sync_card", node.RepoId, node.Status == before ? (linked ? "linked" : "unchanged") : $"{before} → {node.Status}");
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
}
