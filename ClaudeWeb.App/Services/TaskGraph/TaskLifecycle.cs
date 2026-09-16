namespace ClaudeWeb.Services.TaskGraph;

/// <summary>
/// The task board's delivery lifecycle (openspec kanban-lifecycle-columns, amended by
/// openspec board-claims-advisory): the pure rules for the six statuses <c>todo →
/// doing → committed → pr-opened → pr-merged → done</c>. "Blocked" stays a derived
/// flag, not a status.
///
/// Two kinds of movement exist:
///   - a CLAIM (an agent's closing line relayed by the arch through update_task, the
///     arch's own judgement, the Operator's drag) MOVES the card to exactly what was
///     claimed, in either direction — the board is the arch's and the Operator's to
///     move;
///   - an OBSERVATION (the verifier reading git/PR state) annotates: it records the
///     verified state, ADVANCES a card forward when the facts exceed its status, and
///     never moves one back — a branch deleted after its merge must not un-merge the
///     task.
/// Verification is advisory: a card whose status is above what the harness verified
/// carries a warning badge (<see cref="WarningFor"/>) until the facts catch up.
/// </summary>
public static class TaskLifecycle
{
    public const string Todo = "todo";
    public const string Doing = "doing";
    public const string Committed = "committed";
    public const string PrOpened = "pr-opened";
    public const string PrMerged = "pr-merged";
    public const string Done = "done";

    /// <summary>Position in the lifecycle; an unknown string ranks as todo so a
    /// value from a newer peer degrades safely instead of throwing.</summary>
    public static int Rank(string? status) => Array.IndexOf(TaskGraphService.Statuses, status ?? Todo) is var i && i >= 0 ? i : 0;

    /// <summary>A prerequisite counts as finished — the work is on the default
    /// branch — from <c>pr-merged</c> on. This replaces every old
    /// <c>Status != "done"</c> check.</summary>
    public static bool IsDelivered(string? status) => status is PrMerged or Done;

    /// <summary>The status the harness vouches for: <c>doing</c> is conversational (a
    /// ping, an agent picking work up) and needs no facts; above it the verified state
    /// recorded on the card is the ceiling.</summary>
    public static int VerifiedCeiling(string? verifiedStatus) => Math.Max(Rank(Doing), Rank(verifiedStatus));

    /// <summary>Whether a card says more than the harness has verified (openspec
    /// board-claims-advisory): the status is above <c>max(doing, verified)</c>. Such a
    /// card keeps its status and carries the warning badge.</summary>
    public static bool IsUnverified(string? status, string? verifiedStatus) => Rank(status) > VerifiedCeiling(verifiedStatus);

    /// <summary>The badge text for a card, or null when the verified state covers its
    /// status: "claimed pr-merged, verified: doing — branch not on origin".</summary>
    public static string? WarningFor(string? status, string? verifiedStatus, bool? pushed)
    {
        if (!IsUnverified(status, verifiedStatus)) return null;
        var reason = pushed == false ? " — branch not on origin"
            : verifiedStatus is null ? " — no facts observed yet"
            : "";
        return $"claimed {status}, verified: {verifiedStatus ?? "nothing"}{reason}";
    }

    /// <summary>What the verifier observed about a task's recorded branch.</summary>
    public sealed record Facts(
        bool BranchExists, string? HeadCommit, bool HasCommits, bool OnOrigin,
        string? PrUrl, int? PrNumber, bool PrMerged, string? MergeCommit, bool MergeLive);

    /// <summary>The highest status the observed facts support. <paramref name="facts"/>
    /// speaks only about the recorded branch; a card with no facts stays put.
    /// <c>MergeLive</c> is "the merge commit is live on the machine that did the
    /// work" for deployed-harness repos, and simply true for every other repo
    /// (done = merged there).</summary>
    public static string? FromFacts(Facts facts)
    {
        if (facts.PrMerged) return facts.MergeLive ? Done : PrMerged;
        if (facts.PrNumber is not null && facts.OnOrigin) return PrOpened;
        if (facts.HasCommits) return Committed;
        return null;
    }

    /// <summary>Stale = sitting in the two hand-off states (<c>committed</c>:
    /// unpushed branch on one machine; <c>pr-opened</c>: PR waiting) with no
    /// activity for the window. Judged from the verified facts on the card.</summary>
    public static bool IsStale(string? status, long updatedAt, long now, long staleAfterMs) =>
        status is Committed or PrOpened && now - updatedAt > staleAfterMs;

    /// <summary>Migration of a pre-lifecycle status (board schema &lt; 2): a card keeps
    /// its status — nothing is downgraded — and a <c>done</c> without merge evidence on
    /// the card gets the warning badge until the verifier finds its merge.</summary>
    public static (string Status, bool Warn) MigrateStatus(string status, bool hasMergeEvidence) =>
        (status, status == Done && !hasMergeEvidence);
}
