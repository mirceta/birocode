using System.Text.RegularExpressions;
using ClaudeWeb.Services.TaskGraph;

namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// A HANDOFF ending (openspec policeman-handoff-detection): the reader concluded that an agent's
/// conversation resolved into a request for follow-up work owned by SOMEONE ELSE — "I wrote a
/// handoff for another agent", "this needs a prg agent to fix X", "once their fix is merged I'll
/// pull it" — and the observation is stamped <see cref="CardObservations.Handoff"/> with the
/// summary and, when the words name it, the target repo / agent. This class is the pure
/// correlation that keeps the badge honest: every pass it looks for the follow-up card the
/// handoff calls for, so the card reads "Handoff tracked — follow-up #ref exists" and is never
/// flagged once someone created that task, instead of nagging forever.
/// </summary>
public static class Handoffs
{
    /// <summary>A follow-up may have been created a little BEFORE the policeman read the words
    /// (the arch acted first): candidates go back this far from the observation.</summary>
    public static readonly TimeSpan LookBack = TimeSpan.FromHours(2);

    /// <summary>How many significant words of the handoff summary a candidate's title + note must
    /// share to count as the follow-up when nothing else links them.</summary>
    public const int SharedWords = 3;

    private static readonly Regex WordRx = new(@"[\p{L}\p{N}][\p{L}\p{N}\-_/\.]{3,}", RegexOptions.Compiled);
    private static readonly HashSet<string> Stop = new(StringComparer.OrdinalIgnoreCase)
    {
        "this", "that", "with", "from", "into", "then", "will", "once", "their", "there", "have", "been", "need", "needs", "needed",
        "task", "agent", "another", "other", "other's", "hand", "handoff", "hands", "handed", "over", "please", "should", "about", "after",
        "before", "which", "what", "when", "where", "they", "them", "also", "just", "done", "fix", "work", "merge", "merged", "pull", "create", "must", "then", "into", "onto",
    };

    /// <summary>The words that carry meaning in a summary or a title: ≥ 4 chars, not glue.</summary>
    public static HashSet<string> SignificantWords(string? text)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(text)) return set;
        foreach (Match m in WordRx.Matches(text))
        {
            var w = m.Value.Trim('.', '/', '-', '_');
            if (w.Length >= 4 && !Stop.Contains(w)) set.Add(w);
        }
        return set;
    }

    /// <summary>The card that answers this handoff, or null. In order of confidence: a card that
    /// names this card (its #ref or id) in its title or note; a card assigned to the target repo
    /// (resolved through <paramref name="resolveTargetRepo"/>) created since the handoff was read
    /// (less the look-back); a card whose title + note shares <see cref="SharedWords"/> significant
    /// words with the summary in the same window. Never the card itself, never a delivered card.</summary>
    public static TaskGraphService.Node? FollowUpFor(TaskGraphService.Node card, TaskGraphService.CardObservation obs,
        IReadOnlyList<TaskGraphService.Node> nodes, Func<string, string?> resolveTargetRepo)
    {
        var since = obs.At - (long)LookBack.TotalMilliseconds;
        var cref = TaskGraphService.ShortId(card.Id);
        var targetRepo = string.IsNullOrWhiteSpace(obs.Target) ? null : resolveTargetRepo(obs.Target!);
        var words = SignificantWords(obs.Summary);
        TaskGraphService.Node? byRef = null, byRepo = null, byWords = null;
        foreach (var n in nodes.OrderByDescending(n => n.CreatedAt))
        {
            if (n.Id == card.Id || TaskLifecycle.IsDelivered(n.Status)) continue;
            var text = (n.Title ?? "") + "\n" + (n.Note ?? "");
            if (text.Contains(cref, StringComparison.OrdinalIgnoreCase) || text.Contains(card.Id, StringComparison.OrdinalIgnoreCase)) { byRef ??= n; continue; }
            if (n.CreatedAt < since) continue;
            if (targetRepo is not null && TaskGraphService.AssigneesOf(n).Any(a => string.Equals(a.RepoId, targetRepo, StringComparison.Ordinal))) { byRepo ??= n; continue; }
            if (words.Count > 0 && words.Intersect(SignificantWords(text), StringComparer.OrdinalIgnoreCase).Count() >= SharedWords) byWords ??= n;
        }
        return byRef ?? byRepo ?? byWords;
    }

    /// <summary>The target as the card shows it: trimmed, capped.</summary>
    public static string? CleanTarget(string? target)
    {
        if (string.IsNullOrWhiteSpace(target)) return null;
        var t = target.Trim();
        if (t.Equals("null", StringComparison.OrdinalIgnoreCase) || t.Equals("none", StringComparison.OrdinalIgnoreCase) || t.Equals("unknown", StringComparison.OrdinalIgnoreCase)) return null;
        return t.Length > 80 ? t[..80] : t;
    }
}
