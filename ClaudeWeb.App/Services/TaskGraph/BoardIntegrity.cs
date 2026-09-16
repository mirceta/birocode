using System.Text.RegularExpressions;

namespace ClaudeWeb.Services.TaskGraph;

/// <summary>
/// The board "policeman" (openspec kanban-board-integrity, fleet task b2ea0809): the
/// checker that keeps the Kanban HONEST. It does not prompt, dispatch or move anything —
/// it judges every card against the REAL facts the existing verifier already records
/// (the assignee's clone, the PR on GitHub, the deploy log; openspec
/// kanban-lifecycle-columns / board-verify-remote) and flags:
///
///   dishonest — the card's column is AHEAD of what the harness verified (the same rule
///               behind the existing ⚠ unverified badge, <see cref="TaskLifecycle.IsUnverified"/>);
///   stuck     — an assignee was pinged, could not finish and could not open a PR: it
///               either reported TASK BLOCKED, or has shown no progress for the window;
///               the policeman stamps the card "human assistance requested";
///   manual    — the Operator handles the card by hand: not policed at all;
///   honest    — everything else.
///
/// It runs as the second step of every verifier pass (<see cref="TaskVerificationPoller"/>),
/// so the facts it judges are at most a minute old. Pure judgement (<see cref="Judge"/>)
/// is unit-tested; <see cref="Apply"/> only ever stamps and clears its OWN
/// <see cref="TaskGraphService.HumanRequest"/> marks — an agent's request_human or the
/// Operator's request is never touched (they compose: one state, several raisers).
/// </summary>
public static class BoardIntegrity
{
    /// <summary>The policeman CONVERSATION's actor tag (its flags and observations).</summary>
    public const string Policeman = "policeman";
    /// <summary>The Board check's own actor tag (openspec board-check-provenance): the
    /// mechanical judge stamps and clears under this name, so a card always says WHICH of the
    /// two wrote on it. Before the split both used "policeman", and the judge cleared the
    /// conversation's flags as if they were its own.</summary>
    public const string BoardCheck = "board-check";
    public const string Operator = "operator";
    public const string Agent = "agent";

    public const string Honest = "honest";
    public const string Dishonest = "dishonest";
    public const string Stuck = "stuck";
    public const string ManualState = "manual";

    private static readonly Regex Blocked = new(@"\bBLOCKED\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public sealed record CardIntegrity(string Id, string Title, string State, string? Reason);

    /// <summary>One pass's verdict: counts per state and the flagged cards (dishonest + stuck).</summary>
    public sealed record Summary(long CheckedAt, int Cards, int Honest, int Dishonest, int Stuck, int Manual, IReadOnlyList<CardIntegrity> Flagged);

    /// <summary>The pure judgement of one card at <paramref name="now"/>.
    /// <paramref name="stuckAfterMs"/> is the silence window (the board's stale window).</summary>
    public static CardIntegrity Judge(TaskGraphService.Node n, long now, long stuckAfterMs)
    {
        if (n.Manual) return new CardIntegrity(n.Id, n.Title, ManualState, "manual — the Operator handles it directly; not policed");

        var set = TaskGraphService.AssigneesOf(n);

        // Dishonest: the column claims more than the harness has verified. The reason IS
        // the existing warning text so the card reads the same everywhere.
        if (set.Count == 0)
        {
            if (TaskLifecycle.IsUnverified(n.Status, n.VerifiedStatus))
                return new CardIntegrity(n.Id, n.Title, Dishonest, "column ahead of reality — " + (n.Warning ?? TaskLifecycle.WarningFor(n.Status, n.VerifiedStatus, n.Pushed)));
        }
        else
        {
            foreach (var a in set)
                if (TaskLifecycle.IsUnverified(a.Status, a.VerifiedStatus))
                    return new CardIntegrity(n.Id, n.Title, Dishonest, "column ahead of reality — " + (a.Warning ?? TaskLifecycle.WarningFor(a.Status, a.VerifiedStatus, a.Pushed)));
        }

        // Stuck: pinged, no PR, and either an explicit block or silence past the window.
        foreach (var a in set)
        {
            var why = StuckReason(a, n, now, stuckAfterMs);
            if (why is not null) return new CardIntegrity(n.Id, n.Title, Stuck, why);
        }

        return new CardIntegrity(n.Id, n.Title, Honest, null);
    }

    /// <summary>Why one assignee counts as stuck, or null. Pure.</summary>
    public static string? StuckReason(TaskGraphService.Assignee a, TaskGraphService.Node n, long now, long stuckAfterMs)
    {
        if (TaskLifecycle.IsDelivered(a.Status)) return null;
        if (a.DispatchedAt is null) return null;           // never pinged: nothing to be stuck on
        if (a.PrUrl is not null || a.PrNumber is not null) return null; // a PR exists: it waits on review, not on the assignee

        // An explicit "TASK BLOCKED" relayed by the arch lands the card back in todo with
        // the reason in the note — the assignee said it cannot finish.
        if (a.Status == TaskLifecycle.Todo && !string.IsNullOrWhiteSpace(n.Note) && Blocked.IsMatch(n.Note))
        {
            var first = n.Note.Split('\n')[0].Trim();
            return $"the assignee reported it is blocked: {(first.Length > 160 ? first[..160] + "…" : first)}";
        }

        // Silence: in doing / committed with no PR and nothing new for the window.
        if (a.Status is TaskLifecycle.Doing or TaskLifecycle.Committed)
        {
            var last = Math.Max(a.DispatchedAt.Value, Math.Max(a.UpdatedAt, a.VerifiedAt ?? 0));
            var silent = now - last;
            if (silent > stuckAfterMs)
                return $"pinged, no PR and no progress for {Hours(silent)} (window {Hours(stuckAfterMs)})";
        }
        return null;
    }

    private static string Hours(long ms) => ms < 3600_000 ? $"{Math.Max(1, ms / 60_000)} min" : $"{ms / 3600_000.0:0.#} h";

    /// <summary>Judge every card (pure) and roll the verdicts up.</summary>
    public static Summary Assess(IReadOnlyList<TaskGraphService.Node> nodes, long now, long stuckAfterMs)
    {
        var judged = nodes.Select(n => Judge(n, now, stuckAfterMs)).ToList();
        return Summarize(judged, now);
    }

    public static Summary Summarize(IReadOnlyList<CardIntegrity> judged, long now) => new(
        now, judged.Count,
        judged.Count(j => j.State == Honest),
        judged.Count(j => j.State == Dishonest),
        judged.Count(j => j.State == Stuck),
        judged.Count(j => j.State == ManualState),
        judged.Where(j => j.State is Dishonest or Stuck).ToList());

    /// <summary>One Board check pass over the live board: stamp "human assistance requested"
    /// (by <see cref="BoardCheck"/>) on every stuck card that carries no request yet, and clear
    /// the Board check's OWN stamp from cards that are no longer stuck (progress, a PR,
    /// delivered, or flipped to manual). Never clears the policeman conversation's, an agent's
    /// or the Operator's request. A pre-split stamp ("policeman" with a mechanical reason) is
    /// treated as its own: re-stamped under the new name while still stuck, cleared otherwise.</summary>
    public static Summary Apply(TaskGraphService graph, long now, long stuckAfterMs)
    {
        var nodes = graph.Get().Nodes;
        var judged = new List<CardIntegrity>(nodes.Count);
        foreach (var n in nodes)
        {
            var j = Judge(n, now, stuckAfterMs);
            judged.Add(j);
            var legacy = n.NeedsHuman is { By: Policeman } h && IsMechanicalReason(h.Reason);
            if (j.State == Stuck)
            {
                if (n.NeedsHuman is null || legacy)
                    graph.SetNeedsHuman(n.Id, new TaskGraphService.HumanRequest(now, BoardCheck, j.Reason), now);
            }
            else if (n.NeedsHuman?.By == BoardCheck)
            {
                graph.SetNeedsHuman(n.Id, null, now, onlyIfBy: BoardCheck);
            }
            else if (legacy)
            {
                graph.SetNeedsHuman(n.Id, null, now, onlyIfBy: Policeman);
            }
        }
        return Summarize(judged, now);
    }

    /// <summary>Pure: whether a flag's reason is one the mechanical judge writes (the two
    /// <see cref="StuckReason"/> forms) — how a pre-split "policeman" stamp is told apart from
    /// the conversation's own.</summary>
    public static bool IsMechanicalReason(string? reason) =>
        reason is not null && (reason.StartsWith("pinged, no PR and no progress", StringComparison.Ordinal)
                               || reason.StartsWith("the assignee reported it is blocked", StringComparison.Ordinal));
}
