namespace ClaudeWeb.Services.TaskGraph;

/// <summary>
/// A cross-repo EFFORT (openspec cross-repo-effort-legs): one card whose assignees are typed
/// LEGS. A leg is an <see cref="TaskGraphService.Assignee"/> — it already carries its own
/// branch, PR and independently verified merge state — plus:
///
///   Role  — <c>driver</c> (the orchestrator, e.g. web-flow-autodev) or <c>driven</c> (the
///           product repo it drives: prg, skratek, a prgcopies checkout); null = untyped.
///   Path  — an AGENTLESS leg: a checkout on the machine (<c>prgcopies\copy1\prg</c>) that no
///           managed repo agent owns. Its RepoId is the synthetic <c>path:&lt;path&gt;</c>, so it
///           can never be attributed to the wrong managed agent, nothing pings it, and the
///           verifier probes the path itself.
///
/// The crux: the card is DONE only when EVERY leg is verified merged on GitHub. That is the
/// existing aggregate rule (the card is as far as its slowest leg) — what this class adds is
/// the legs being REPRESENTED (the Knjiga-pošte card had its prg leg nowhere on the board) and
/// the partial state being NAMED: <see cref="Summary.PartiallyMerged"/> for the card, and
/// <see cref="MismatchReason"/> for a column that claims merged while a leg is not.
/// </summary>
public static class Effort
{
    public const string Driver = "driver";
    public const string Driven = "driven";
    public const string AgentlessPrefix = "path:";

    public static string? CleanRole(string? role)
    {
        var r = role?.Trim().ToLowerInvariant();
        return r is Driver or Driven ? r : null;
    }

    public static bool IsRole(string? role) => CleanRole(role) is not null;

    /// <summary>A checkout path, trimmed, without a trailing separator; null for blank.</summary>
    public static string? CleanPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        var p = path.Trim().TrimEnd('\\', '/');
        return p.Length == 0 ? null : p;
    }

    /// <summary>The synthetic repo id of an agentless leg: <c>path:C:\prgcopies\copy1\prg</c>.</summary>
    public static string AgentlessRepoId(string path) => AgentlessPrefix + CleanPath(path);

    public static bool IsAgentless(TaskGraphService.Assignee a) =>
        a.Path is not null || a.RepoId.StartsWith(AgentlessPrefix, StringComparison.Ordinal);

    /// <summary>The checkout path of an agentless leg (from <c>Path</c> or the synthetic id); null for an agent leg.</summary>
    public static string? PathOf(TaskGraphService.Assignee a) =>
        a.Path ?? (a.RepoId.StartsWith(AgentlessPrefix, StringComparison.Ordinal) ? a.RepoId[AgentlessPrefix.Length..] : null);

    /// <summary>A leg a managed repo agent owns — the only kind that can be pinged or read.</summary>
    public static bool HasAgent(TaskGraphService.Assignee a) => !IsAgentless(a) && a.RepoId.Length > 0;

    /// <summary>The last two path segments: <c>copy1/prg</c>.</summary>
    public static string PathTail(string path)
    {
        var parts = path.Split(new[] { '\\', '/' }, StringSplitOptions.RemoveEmptyEntries);
        return parts.Length >= 2 ? parts[^2] + "/" + parts[^1] : (parts.Length == 1 ? parts[0] : path);
    }

    /// <summary>A leg's short label with no fleet knowledge: the path tail for an agentless leg,
    /// the repo id otherwise (callers that know handles pass their own labeller).</summary>
    public static string LegLabel(TaskGraphService.Assignee a) => IsAgentless(a) ? PathTail(PathOf(a)!) : a.RepoId;

    /// <summary>Verified merged on GitHub (pr-merged or done as the verifier recorded it).</summary>
    public static bool IsMerged(TaskGraphService.Assignee a) => TaskLifecycle.Rank(a.VerifiedStatus) >= TaskLifecycle.Rank(TaskLifecycle.PrMerged);

    /// <summary>Whether a leg matches a name the Operator or an agent may type: its path, its
    /// path tail, its repo id or its synthetic id (case-insensitive).</summary>
    public static bool Matches(TaskGraphService.Assignee a, string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return false;
        var q = name.Trim().TrimEnd('\\', '/');
        if (string.Equals(a.RepoId, q, StringComparison.OrdinalIgnoreCase)) return true;
        var p = PathOf(a);
        if (p is null) return false;
        return string.Equals(p, q, StringComparison.OrdinalIgnoreCase)
            || string.Equals(AgentlessPrefix + p, q, StringComparison.OrdinalIgnoreCase)
            || string.Equals(PathTail(p), q.Replace('\\', '/'), StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>The effort as a whole: how many legs, how many verified merged, the roles, and
    /// the two named states — <c>AllMerged</c> and <c>PartiallyMerged</c> (some but not all).</summary>
    public sealed record Summary(
        int Legs, int Merged, bool CrossRepo, bool AllMerged, bool PartiallyMerged,
        IReadOnlyList<TaskGraphService.Assignee> Drivers, IReadOnlyList<TaskGraphService.Assignee> Driven,
        IReadOnlyList<TaskGraphService.Assignee> Unmerged);

    public static Summary Summarize(TaskGraphService.Node n)
    {
        var legs = TaskGraphService.AssigneesOf(n);
        var merged = legs.Where(IsMerged).ToList();
        var unmerged = legs.Where(a => !IsMerged(a)).ToList();
        return new Summary(
            legs.Count, merged.Count, legs.Count > 1,
            AllMerged: legs.Count > 0 && unmerged.Count == 0,
            PartiallyMerged: legs.Count > 1 && merged.Count > 0 && unmerged.Count > 0,
            legs.Where(a => a.Role == Driver).ToList(), legs.Where(a => a.Role == Driven).ToList(), unmerged);
    }

    /// <summary>One leg's merge state in words: "PR #166 open", "merged (PR #21)", "no PR recorded".</summary>
    public static string MergeWord(TaskGraphService.Assignee a)
    {
        if (IsMerged(a)) return a.PrNumber is { } m ? $"merged (PR #{m})" : "merged";
        if (a.PrNumber is { } p) return $"PR #{p} {(TaskLifecycle.Rank(a.VerifiedStatus) >= TaskLifecycle.Rank(TaskLifecycle.PrOpened) ? "open, not merged" : "not verified")}";
        if (a.PrUrl is not null) return "PR recorded, not verified";
        return a.Branch is not null ? "no PR" : "no PR recorded";
    }

    /// <summary>Why a cross-repo card is ahead of reality, or null: the column claims merged
    /// (pr-merged / done) while a leg is not verified merged on GitHub. THIS is the rule that
    /// would have caught the Knjiga-pošte card — one merged leg never makes the card done.</summary>
    public static string? MismatchReason(TaskGraphService.Node n, Func<TaskGraphService.Assignee, string>? label = null)
    {
        var s = Summarize(n);
        if (!s.CrossRepo || s.AllMerged) return null;
        if (TaskLifecycle.Rank(n.Status) < TaskLifecycle.Rank(TaskLifecycle.PrMerged)) return null;
        var lab = label ?? LegLabel;
        var legs = TaskGraphService.AssigneesOf(n);
        var merged = legs.Where(IsMerged).Select(a => $"{lab(a)} {MergeWord(a)}").ToList();
        var unmerged = s.Unmerged.Select(a => $"{lab(a)} — {MergeWord(a)}").ToList();
        var word = n.Status == TaskLifecycle.Done ? "done" : "merged";
        return $"cross-repo effort: {s.Merged} of {s.Legs} legs merged on GitHub ({(merged.Count == 0 ? "none" : string.Join(", ", merged))}); not merged: {string.Join("; ", unmerged)} — the card is not {word} until every leg is merged";
    }
}
