using System.Text.RegularExpressions;

namespace ClaudeWeb.Services.TaskGraph;

/// <summary>One pull request as <c>gh pr list</c> reports it (openspec policeman-syncs-cards).</summary>
public sealed record PrListItem(int Number, string Title, string Url, string State, bool IsDraft, string? HeadRefName, string? HeadRefOid, string? Body, string? Author, string? UpdatedAt);

/// <summary>
/// Tracing a pull request back to the card it delivers (openspec policeman-syncs-cards):
/// pure rules, so the policeman's judgement is mechanical and unit-tested. A PR is traced
/// to a card when, in this order of confidence:
///   1. an assignee (or the card itself) already records that PR URL or number;
///   2. an assignee (or the card) records the PR's head branch;
///   3. the PR's title, body or head branch names the card's <c>#ref</c> (the first
///      eight hex characters of its id, with or without the '#');
///   4. the PR's title contains the whole card title (case-insensitive), or vice versa.
/// Only cards that are not delivered and not manual are candidates; the strongest match
/// wins, and a tie at the same strength is no match (say so, do not guess).
/// </summary>
public static class PrTrace
{
    public sealed record Match(TaskGraphService.Node Node, string How, int Strength);

    private static readonly Regex Hex8 = new(@"(?<![0-9a-f])[0-9a-f]{8}(?![0-9a-f])", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>The card <paramref name="pr"/> delivers, or null. <paramref name="repoId"/>
    /// narrows the branch / linkage matches to assignees on that repo when given.</summary>
    public static Match? Trace(PrListItem pr, IReadOnlyList<TaskGraphService.Node> nodes, string? repoId = null)
    {
        Match? best = null;
        var tie = false;
        foreach (var n in nodes)
        {
            if (n.Manual || TaskLifecycle.IsDelivered(n.Status)) continue;
            var m = Judge(pr, n, repoId);
            if (m is null) continue;
            if (best is null || m.Strength > best.Strength) { best = m; tie = false; }
            else if (m.Strength == best.Strength) tie = true;
        }
        return tie ? null : best;
    }

    /// <summary>How strongly <paramref name="pr"/> points at <paramref name="n"/>, or null.</summary>
    public static Match? Judge(PrListItem pr, TaskGraphService.Node n, string? repoId = null)
    {
        var targets = TaskGraphService.AssigneesOf(n);
        var scoped = repoId is null ? targets : targets.Where(a => string.Equals(a.RepoId, repoId, StringComparison.Ordinal)).ToList();
        // 1. Recorded PR.
        foreach (var a in scoped)
            if (SamePr(a.PrUrl, a.PrNumber, pr)) return new Match(n, $"the assignee on {a.RepoId} records PR #{pr.Number}", 4);
        if (targets.Count == 0 && SamePr(n.PrUrl, n.PrNumber, pr)) return new Match(n, $"the card records PR #{pr.Number}", 4);
        // 2. Recorded branch = the PR's head.
        if (!string.IsNullOrWhiteSpace(pr.HeadRefName))
        {
            foreach (var a in scoped)
                if (string.Equals(a.Branch, pr.HeadRefName, StringComparison.Ordinal)) return new Match(n, $"the assignee on {a.RepoId} records branch {pr.HeadRefName}", 3);
            if (targets.Count == 0 && string.Equals(n.Branch, pr.HeadRefName, StringComparison.Ordinal)) return new Match(n, $"the card records branch {pr.HeadRefName}", 3);
        }
        // 3. The card's #ref in the PR's title, body or branch.
        var short8 = TaskGraphService.ShortId(n.Id);
        foreach (var text in new[] { pr.Title, pr.Body, pr.HeadRefName })
        {
            if (string.IsNullOrEmpty(text)) continue;
            foreach (System.Text.RegularExpressions.Match h in Hex8.Matches(text))
                if (string.Equals(h.Value, short8, StringComparison.OrdinalIgnoreCase)) return new Match(n, $"the PR names the card #{short8}", 2);
        }
        // 4. Titles contain each other.
        var ct = (n.Title ?? "").Trim();
        var pt = (pr.Title ?? "").Trim();
        if (ct.Length >= 8 && pt.Length >= 8 && (pt.Contains(ct, StringComparison.OrdinalIgnoreCase) || ct.Contains(pt, StringComparison.OrdinalIgnoreCase)))
            return new Match(n, "the PR title matches the card title", 1);
        return null;
    }

    private static bool SamePr(string? url, int? number, PrListItem pr)
    {
        if (number is { } k && k == pr.Number) return true;
        if (string.IsNullOrWhiteSpace(url)) return false;
        var r = PrRef.FromUrl(url);
        return r?.Number == pr.Number;
    }
}
