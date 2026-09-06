namespace ClaudeWeb.Services.TaskGraph;

/// <summary>
/// The task board's delivery lifecycle (openspec kanban-lifecycle-columns): the
/// pure rules for the six statuses <c>todo → doing → committed → pr-opened →
/// pr-merged → done</c>. "Blocked" stays a derived flag, not a status.
///
/// Two kinds of movement exist and they are not equal:
///   - a CLAIM (an agent's closing line, relayed by the arch through
///     update_task) may move a card forward only as far as the harness has
///     verified — everything from <c>committed</c> up needs observed facts;
///     backward moves are always free;
///   - an OBSERVATION (the verifier reading git/PR state) moves a card forward
///     only, never back — a branch deleted after its merge must not un-merge
///     the task.
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

    /// <summary>The highest status a claim may set: <c>doing</c> is
    /// conversational (a ping, an agent picking work up), everything above it
    /// requires the harness-verified state recorded on the card.</summary>
    public static int CeilingRank(TaskGraphService.Node node) =>
        Math.Max(Rank(Doing), Rank(node.VerifiedStatus));

    /// <summary>Clamp a claimed status: backward always passes, forward lands at
    /// the ceiling. Returns the status to apply and whether it was clamped.</summary>
    public static (string Applied, bool Clamped) ClampClaim(TaskGraphService.Node node, string requested)
    {
        var req = Rank(requested);
        if (req <= Rank(node.Status)) return (requested, false); // backward or same: free
        var ceiling = CeilingRank(node);
        return req <= ceiling ? (requested, false) : (TaskGraphService.Statuses[ceiling], true);
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
    /// activity for the window.</summary>
    public static bool IsStale(string? status, long updatedAt, long now, long staleAfterMs) =>
        status is Committed or PrOpened && now - updatedAt > staleAfterMs;

    /// <summary>Migration of a pre-lifecycle status (board schema &lt; 2):
    /// <c>done</c> becomes <c>pr-merged</c> only with merge evidence on the
    /// card; otherwise <c>committed</c> — the warning badge is the caller's job.
    /// Everything else keeps its status.</summary>
    public static (string Status, bool Warn) MigrateStatus(string status, bool hasMergeEvidence) =>
        status == Done ? (hasMergeEvidence ? (PrMerged, false) : (Committed, true)) : (status, false);
}
