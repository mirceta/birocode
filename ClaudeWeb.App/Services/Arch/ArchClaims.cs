using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The claimed rule and the branch hand-over (openspec arch-branch-handover) — pure,
/// so the table is unit-testable without a harness.
///
/// A managed repo whose checked-out branch the arch did not ask for, adopt, or record
/// for a dispatched task is on an <b>unassigned branch</b>. It is <c>claimed</c> —
/// the Operator's — while a human was the last to work on it inside the activity
/// window (default 2 h), or when the Operator pinned it as theirs. Outside that window
/// it is <c>available</c> again, tagged <see cref="ReasonUnassignedBranch"/>: reads
/// are allowed and a send goes out only if the task text names the branch the arch
/// found, so the agent is told where it is working. A hand-over (the dock's "Hand to
/// arch", the arch's <c>adopt_branch</c> on the Operator's ask) records the branch in
/// the assignments store exactly as if the arch had asked for it; "take back" revokes.
/// </summary>
public static class ArchClaims
{
    public const string ReasonHumanActive = "human-active";
    public const string ReasonPinned = "pinned";
    public const string ReasonUnassignedBranch = "unassigned-branch";

    /// <summary>How long after the last human turn an unassigned branch stays claimed.</summary>
    public static readonly TimeSpan DefaultHumanWindow = TimeSpan.FromHours(2);

    /// <summary>A turn that starts this soon after an arch send is the arch's own turn
    /// (the same tolerance the dock's last-actor label uses).</summary>
    public const long ArchSendMatchMs = 15_000;

    /// <summary>The effective availability plus why. <see cref="ClaimedReason"/> is
    /// <see cref="ReasonHumanActive"/> or <see cref="ReasonPinned"/> when claimed,
    /// <see cref="ReasonUnassignedBranch"/> when available on a branch nobody assigned
    /// (the arch must name it in a send), null otherwise.</summary>
    public sealed record Verdict(string Availability, string? ClaimedReason)
    {
        public bool OnUnassignedBranch => ClaimedReason is ReasonHumanActive or ReasonUnassignedBranch;
    }

    /// <summary>The rule: unmanaged wins, then busy, then pinned, then the branch test —
    /// the default branch and every arch-known branch are available; an unassigned
    /// branch is claimed while a human was active on it within <paramref name="humanWindow"/>
    /// of <paramref name="now"/>, else available with the unassigned-branch reason. A
    /// dirty tree never claims (it is not an input).</summary>
    public static Verdict Classify(bool managed, bool busy, string? branch, string? defaultBranch,
        IReadOnlyCollection<string> archBranches, bool pinned, long? lastHumanAt, long now, TimeSpan humanWindow)
    {
        if (!managed) return new(ArchAgentService.Unmanaged, null);
        if (busy) return new(ArchAgentService.Busy, null);
        if (pinned) return new(ArchAgentService.Claimed, ReasonPinned);
        if (string.IsNullOrWhiteSpace(branch) || branch == "unknown") return new(ArchAgentService.Available, null);
        if (string.Equals(branch, defaultBranch, StringComparison.Ordinal)) return new(ArchAgentService.Available, null);
        if (archBranches.Contains(branch, StringComparer.Ordinal)) return new(ArchAgentService.Available, null);
        if (lastHumanAt is { } h && now - h < (long)humanWindow.TotalMilliseconds && now >= h)
            return new(ArchAgentService.Claimed, ReasonHumanActive);
        return new(ArchAgentService.Available, ReasonUnassignedBranch);
    }

    /// <summary>The window in effect: the operator's minutes when set (&gt; 0), else the default.</summary>
    public static TimeSpan Window(int minutes) => minutes > 0 ? TimeSpan.FromMinutes(minutes) : DefaultHumanWindow;

    /// <summary>When a human last started a turn on <paramref name="repoId"/> (local
    /// source only): the latest <c>turn.start</c> that does not sit within
    /// <see cref="ArchSendMatchMs"/> after an arch send. Null when no human turn is known.</summary>
    public static long? LastHumanTurnStart(IReadOnlyList<CollectorService.CollectorEvent> events, string repoId, IReadOnlyCollection<long> archSendTimes)
    {
        long? last = null;
        foreach (var ev in events)
        {
            if (ev.Type != "turn.start") continue;
            if (!string.Equals(ev.SourceId, CollectorService.SelfId, StringComparison.Ordinal)) continue;
            if (ArchAgentService.RepoIdOf(ev.Source) != repoId) continue;
            if (archSendTimes.Any(s => ev.At >= s - 1000 && ev.At - s < ArchSendMatchMs)) continue;
            if (last is null || ev.At > last) last = ev.At;
        }
        return last;
    }

    /// <summary>Whether a send to a repo on an unassigned (but not claimed) branch may go:
    /// the task text names the branch, or the send's own <c>branch</c> argument is it.</summary>
    public static bool SendNamesBranch(Verdict verdict, string? branch, string text, string? branchArg)
    {
        if (verdict.ClaimedReason != ReasonUnassignedBranch || string.IsNullOrWhiteSpace(branch)) return true;
        if (!string.IsNullOrWhiteSpace(branchArg) && string.Equals(branchArg.Trim(), branch, StringComparison.Ordinal)) return true;
        return text.Contains(branch, StringComparison.Ordinal);
    }

    /// <summary>The branch to record for a dispatched task when the branch watch sees the
    /// assignee on one: the task is <c>doing</c> and was dispatched, the repo sits on a
    /// non-default branch the arch does not know yet. Null = nothing to record.</summary>
    public static string? TaskBranchToRecord(string status, long? dispatchedAt, string? branch, string? defaultBranch, IReadOnlyCollection<string> archBranches)
    {
        if (status != "doing" || dispatchedAt is null) return null;
        if (string.IsNullOrWhiteSpace(branch) || branch == "unknown") return null;
        if (string.Equals(branch, defaultBranch, StringComparison.Ordinal)) return null;
        if (archBranches.Contains(branch, StringComparer.Ordinal)) return null;
        return branch;
    }

    /// <summary>The audit outcome of a hand-over, as written on both the tool audit
    /// and the log: who handed what over, or took it back.</summary>
    public static string HandoverOutcome(bool adopt, string branch, string by) =>
        adopt ? $"adopted {branch} (handed over by {by})" : $"revoked {branch} (taken back by {by})";

    // ---- the assignments record ------------------------------------------------------

    /// <summary>One repo's assignment file in the arch home (<c>assignments/&lt;repoId&gt;.json</c>).
    /// <see cref="Branches"/>: branches the arch asked for in sends. <see cref="Adopted"/>:
    /// branches handed over by the Operator (revocable). <see cref="TaskBranches"/>: task id
    /// → the branch the assignee created for a dispatched task. <see cref="Pinned"/>: the
    /// Operator's "mine" — claimed whatever the branch.</summary>
    public sealed record Assignment(
        string RepoId, string Name, List<string> Branches, string? LastActor, long LastSentAt, string? LastText,
        List<string>? Adopted = null, Dictionary<string, string>? TaskBranches = null, bool Pinned = false,
        long? AdoptedAt = null, string? AdoptedBy = null)
    {
        /// <summary>Every branch that keeps the repo available to the arch.</summary>
        public IReadOnlyCollection<string> ArchBranches
        {
            get
            {
                var set = new HashSet<string>(Branches ?? new(), StringComparer.Ordinal);
                if (Adopted is not null) set.UnionWith(Adopted);
                if (TaskBranches is not null) set.UnionWith(TaskBranches.Values);
                return set;
            }
        }

        public bool IsAdopted(string? branch) => branch is not null && Adopted is not null && Adopted.Contains(branch, StringComparer.Ordinal);

        public Assignment Normalized() => this with { Branches = Branches ?? new(), Adopted = Adopted ?? new(), TaskBranches = TaskBranches ?? new(StringComparer.Ordinal) };

        public Assignment Adopt(string branch, string by, long now)
        {
            var adopted = new List<string>(Adopted ?? new());
            if (!adopted.Contains(branch, StringComparer.Ordinal)) adopted.Add(branch);
            return this with { Adopted = adopted, AdoptedAt = now, AdoptedBy = by };
        }

        public Assignment Revoke(string branch)
        {
            var adopted = (Adopted ?? new()).Where(b => !string.Equals(b, branch, StringComparison.Ordinal)).ToList();
            var tasks = (TaskBranches ?? new(StringComparer.Ordinal)).Where(kv => !string.Equals(kv.Value, branch, StringComparison.Ordinal))
                .ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal);
            return this with { Adopted = adopted, TaskBranches = tasks };
        }

        public Assignment WithTaskBranch(string taskId, string branch)
        {
            var tasks = new Dictionary<string, string>(TaskBranches ?? new(StringComparer.Ordinal), StringComparer.Ordinal) { [taskId] = branch };
            return this with { TaskBranches = tasks };
        }

        public Assignment WithPinned(bool pinned) => this with { Pinned = pinned };
    }
}
