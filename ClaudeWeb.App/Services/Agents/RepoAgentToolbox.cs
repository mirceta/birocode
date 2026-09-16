using ClaudeWeb.Services.TaskGraph;

namespace ClaudeWeb.Services.Agents;

/// <summary>
/// The harness tools a REPO AGENT gets (openspec cross-repo-effort-legs; the tool server the
/// human-delegation-watchers change planned as <c>repo-agent-tools</c> — this is that server's
/// first surface, so <c>request_human</c> lands here later instead of on a second one).
///
/// Agent SELF-INSPECTION: a repo agent asked "what are you doing?" by the policeman or the
/// Operator can answer truthfully instead of looking idle — <see cref="MyEffort"/> says which
/// efforts it is a leg of, its role (driver / driven), what it drives or who drives it, the
/// shared goal (the card's title and note) and every sibling leg's branch / PR / merge state.
/// <see cref="ReportLeg"/> lets a DRIVER record where a driven leg's work lives (branch, PR) —
/// the agentless prg checkout has no agent to report for itself — so the verifier can check
/// that leg on GitHub and the card can never go done off the driver's PR alone.
///
/// Identity comes from the harness, never from the model: the MCP URL the harness wrote into
/// the run's config names the repo, so a tool call can only ever speak for that agent.
/// </summary>
public sealed class RepoAgentToolbox
{
    public sealed record ToolOutcome(bool Ok, string Status, string Detail, object? Data = null);

    private readonly TaskGraphService _graph;
    private readonly Func<string?, string, string> _label;   // (sourceId, repoId) → the agent's handle
    private readonly Func<long> _now;

    public RepoAgentToolbox(TaskGraphService graph, Func<string?, string, string>? label = null, Func<long>? now = null)
    {
        _graph = graph;
        _label = label ?? ((src, repo) => src is null ? repo : $"{src}/{repo}");
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    /// <summary>The cards on which <paramref name="repoId"/> (a repo agent on THIS harness) is a leg.</summary>
    public IReadOnlyList<(TaskGraphService.Node Node, TaskGraphService.Assignee Mine)> MyCards(string repoId, bool includeDelivered = false) =>
        _graph.Get().Nodes
            .Select(n => (Node: n, Mine: TaskGraphService.AssigneesOf(n).FirstOrDefault(a => a.SourceId is null && a.RepoId == repoId)))
            .Where(t => t.Mine is not null && (includeDelivered || !TaskLifecycle.IsDelivered(t.Node.Status)))
            .Select(t => (t.Node, t.Mine!))
            .OrderByDescending(t => t.Node.UpdatedAt)
            .ToList();

    public string LegLabel(TaskGraphService.Assignee a) => Effort.IsAgentless(a) ? $"{Effort.PathTail(Effort.PathOf(a)!)} (no agent, {Effort.PathOf(a)})" : _label(a.SourceId, a.RepoId);

    private object LegJson(TaskGraphService.Assignee a, bool mine) => new
    {
        leg = LegLabel(a), key = a.Key, role = a.Role, agentless = Effort.IsAgentless(a), path = Effort.PathOf(a), mine,
        status = a.Status, verifiedStatus = a.VerifiedStatus, merged = Effort.IsMerged(a), mergeState = Effort.MergeWord(a),
        branch = a.Branch, pushed = a.Pushed, prUrl = a.PrUrl, prNumber = a.PrNumber, mergeCommit = a.MergeCommit, warning = a.Warning,
        dispatchedAt = a.DispatchedAt,
    };

    /// <summary>"Which effort am I in?" — every card this agent is a leg of, with its role, the
    /// legs it drives / the driver it answers to, the shared goal and the siblings' states.</summary>
    public ToolOutcome MyEffort(string? repoId, bool includeDelivered = false)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", "the harness did not name this agent's repo — tool identity is missing");
        var cards = MyCards(repoId, includeDelivered);
        var efforts = cards.Select(t =>
        {
            var (n, mine) = t;
            var legs = TaskGraphService.AssigneesOf(n);
            var s = Effort.Summarize(n);
            var drivers = legs.Where(a => a.Role == Effort.Driver && a.Key != mine.Key).Select(LegLabel).ToList();
            var driven = legs.Where(a => a.Role == Effort.Driven && a.Key != mine.Key).Select(LegLabel).ToList();
            return new
            {
                id = n.Id, @ref = TaskGraphService.CardRef(n.Id), title = n.Title, goal = n.Note, status = n.Status,
                myRole = mine.Role, myLeg = LegJson(mine, true),
                iDrive = mine.Role == Effort.Driver ? driven : new List<string>(),
                drivenBy = mine.Role == Effort.Driven ? drivers : new List<string>(),
                legs = legs.Select(a => LegJson(a, a.Key == mine.Key)).ToList(),
                crossRepo = s.CrossRepo, legsMerged = s.Merged, legsTotal = s.Legs, partiallyMerged = s.PartiallyMerged, allMerged = s.AllMerged,
                doneRule = s.CrossRepo ? "the card is done only when EVERY leg's PR is verified merged on GitHub; a driven leg without a recorded branch/PR can never be verified — report_leg it" : null,
                needsHuman = n.NeedsHuman is null ? null : new { by = n.NeedsHuman.By, reason = n.NeedsHuman.Reason, at = n.NeedsHuman.At },
                observation = n.Observation is null ? null : new { state = n.Observation.State, summary = n.Observation.Summary, at = n.Observation.At },
                manual = n.Manual, externalOwner = n.ExternalOwner,
            };
        }).ToList();
        if (efforts.Count == 0)
            return new ToolOutcome(true, "none", $"you ({_label(null, repoId)}) are not a leg of any {(includeDelivered ? "" : "in-flight ")}card on the board", new { repoId, efforts });
        var lines = efforts.Select(e => $"{e.@ref} \"{e.title}\": you are {(e.myRole is null ? "an untyped leg" : "the " + e.myRole)}{(e.iDrive.Count > 0 ? ", driving " + string.Join(", ", e.iDrive) : "")}{(e.drivenBy.Count > 0 ? ", driven by " + string.Join(", ", e.drivenBy) : "")}; {e.legsMerged}/{e.legsTotal} legs merged{(e.partiallyMerged ? " (PARTIALLY merged — not done)" : "")}");
        return new ToolOutcome(true, "in-effort", string.Join("; ", lines), new { repoId, efforts });
    }

    /// <summary>Record where a leg's work lives (branch, commit, PR URL). Allowed on the agent's
    /// OWN leg, or — when it is the DRIVER of the card — on any driven leg (the agentless
    /// checkout it drives cannot report for itself). Never moves the column: the verifier does,
    /// from the facts.</summary>
    public ToolOutcome ReportLeg(string? repoId, string? task, string? leg, string? branch, string? commit, string? prUrl)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", "the harness did not name this agent's repo — tool identity is missing");
        if (string.IsNullOrWhiteSpace(branch) && string.IsNullOrWhiteSpace(commit) && string.IsNullOrWhiteSpace(prUrl)) return new ToolOutcome(false, "error", "give at least one of branch, commit, pr");
        if (!string.IsNullOrWhiteSpace(prUrl) && PrRef.FromUrl(prUrl) is null) return new ToolOutcome(false, "error", "pr must be a GitHub pull request URL (https://github.com/<owner>/<repo>/pull/<n>)");

        var (node, mine, err) = Locate(repoId, task);
        if (err is not null) return new ToolOutcome(false, "error", err);
        var legs = TaskGraphService.AssigneesOf(node!);
        TaskGraphService.Assignee target;
        if (string.IsNullOrWhiteSpace(leg) || leg.Trim().Equals("me", StringComparison.OrdinalIgnoreCase)) target = mine!;
        else
        {
            var found = legs.Where(a => Effort.Matches(a, leg) || string.Equals(LegLabel(a), leg.Trim(), StringComparison.OrdinalIgnoreCase) || string.Equals(_label(a.SourceId, a.RepoId), leg.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
            if (found.Count != 1) return new ToolOutcome(false, "error", $"leg \"{leg.Trim()}\" {(found.Count == 0 ? "is not a leg of" : "is ambiguous on")} {TaskGraphService.CardRef(node!.Id)}; its legs: {string.Join(", ", legs.Select(LegLabel))}");
            target = found[0];
        }
        if (target.Key != mine!.Key && mine.Role != Effort.Driver)
            return new ToolOutcome(false, "not-yours", $"leg {LegLabel(target)} is not yours to report: you are {(mine.Role is null ? "an untyped leg" : "the " + mine.Role)} of {TaskGraphService.CardRef(node!.Id)}, not its driver");
        if (target.Key != mine.Key && target.Role == Effort.Driver)
            return new ToolOutcome(false, "not-yours", $"leg {LegLabel(target)} is another driver's; report only your own leg or the legs you drive");

        var after = _graph.RecordClaim(node!.Id, target.Key, branch, commit, prUrl, _now());
        var cur = after is null ? target : TaskGraphService.AssigneesOf(after).First(a => a.Key == target.Key);
        var s = Effort.Summarize(after ?? node);
        return new ToolOutcome(true, "recorded",
            $"{TaskGraphService.CardRef(node.Id)} leg {LegLabel(cur)}: branch {cur.Branch ?? "-"}, PR {cur.PrUrl ?? "-"} recorded; the verifier checks it on its next pass (every minute). Card: {s.Merged}/{s.Legs} legs merged{(s.PartiallyMerged ? " — partially merged, not done" : "")}",
            new { id = node.Id, @ref = TaskGraphService.CardRef(node.Id), leg = LegJson(cur, cur.Key == mine.Key), legsMerged = s.Merged, legsTotal = s.Legs, partiallyMerged = s.PartiallyMerged });
    }

    /// <summary>The card meant: by reference when given, else the agent's ONE in-flight card.</summary>
    private (TaskGraphService.Node? Node, TaskGraphService.Assignee? Mine, string? Error) Locate(string repoId, string? task)
    {
        if (!string.IsNullOrWhiteSpace(task))
        {
            var (id, err) = _graph.ResolveTaskRef(task);
            if (id is null) return (null, null, err ?? $"no task {task}");
            var n = _graph.Find(id)!;
            var mine = TaskGraphService.AssigneesOf(n).FirstOrDefault(a => a.SourceId is null && a.RepoId == repoId);
            return mine is null ? (null, null, $"you are not a leg of {TaskGraphService.CardRef(id)} \"{n.Title}\"") : (n, mine, null);
        }
        var cards = MyCards(repoId);
        if (cards.Count == 1) return (cards[0].Node, cards[0].Mine, null);
        return (null, null, cards.Count == 0 ? "you are not a leg of any in-flight card; pass task when reporting a delivered one"
            : $"you are a leg of {cards.Count} in-flight cards ({string.Join(", ", cards.Select(c => TaskGraphService.CardRef(c.Node.Id)))}); pass task");
    }
}
