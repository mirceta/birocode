namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// WHAT the policeman may touch — the one rule behind all three fences (openspec
/// policeman-tool-surface). The policeman observes, verifies, flags, and moves a card only to
/// what the facts prove; it never dispatches, edits, assigns, deletes, or drives loops and goals.
/// The same set is applied at three points, from the outside in:
///   1. the catalogue its session is OFFERED on tools/list (<see cref="Offered"/>);
///   2. the CLI's <c>--disallowedTools</c> for its turns (<see cref="CliDisallowed"/>), so the
///      model never even sees a withheld tool;
///   3. the call-time refusal in tools/call (<see cref="IsAllowed"/> → <see cref="Refusal"/>).
/// Any one fence is enough; three means a bug in one is caught by the next.
/// </summary>
public static class PolicemanToolPolicy
{
    public const string RefusedStatus = "policeman-observe-only";
    /// <summary>The prefix the CLI uses for a tool of the harness's MCP server.</summary>
    public const string McpToolPrefix = "mcp__arch__";

    /// <summary>Everything the policeman may call. Everything else in the arch's catalogue
    /// (send_task, dispatch_task, update_task, assign_task, create_task, delete_task,
    /// idea_to_task, adopt_branch, upgrade_peer, start/update/stop_loop, start/stop_arch_goal)
    /// is withheld.</summary>
    public static readonly IReadOnlySet<string> AllowedTools = new HashSet<string>(StringComparer.Ordinal)
    {
        // read
        "list_agents", "list_machines", "git_state", "read_transcript", "list_loops", "list_arch_goals",
        "list_tasks", "list_ideas", "recall", "remember",
        // the board's verdict and the policeman's own marks
        "board_integrity", "flag_needs_human", "clear_needs_human",
        // what it read in an agent's conversation
        "observe_card", "clear_observation",
        // moving a card to the facts
        "list_pull_requests", "sync_card",
    };

    public static bool IsAllowed(string toolName) => AllowedTools.Contains(toolName);

    /// <summary>The catalogue names the policeman is offered: the allowed subset, in catalogue order.</summary>
    public static IReadOnlyList<string> Offered(IEnumerable<string> catalogue) => catalogue.Where(IsAllowed).ToList();

    /// <summary>The catalogue names withheld from the policeman, sorted.</summary>
    public static IReadOnlyList<string> Withheld(IEnumerable<string> catalogue) =>
        catalogue.Where(n => !IsAllowed(n)).OrderBy(n => n, StringComparer.Ordinal).ToList();

    /// <summary>The CLI fence: the arch's built-in denials plus every withheld tool by its MCP name.</summary>
    public static IReadOnlyList<string> CliDisallowed(IEnumerable<string> builtInDenials, IEnumerable<string> catalogue) =>
        builtInDenials.Concat(Withheld(catalogue).Select(n => McpToolPrefix + n)).ToList();

    /// <summary>What a refused call answers, so the model learns the boundary instead of acting.</summary>
    public static string Refusal(string toolName) =>
        $"{toolName} is not available to the policeman: it observes, verifies, flags, and moves a card only to what the facts prove " +
        "(board_integrity, read_transcript, observe_card, clear_observation, list_pull_requests, sync_card, flag_needs_human, clear_needs_human, list_*, git_state, recall). " +
        "Say what should happen; the Operator or the arch acts on it.";
}
