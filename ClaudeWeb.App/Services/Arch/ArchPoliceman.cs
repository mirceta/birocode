using System.Text;
using ClaudeWeb.Services.TaskGraph;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The board policeman as an ARCH CONVERSATION (openspec kanban-policeman-conversation):
/// the pure rules. The policeman is the arch agent in a reserved sibling conversation
/// (<see cref="ConversationId"/>) driven forever by the existing recipe-loop engine with
/// ONE fixed prompt — "check that the Kanban is honest" — so it has everything an arch
/// conversation has (chat, tool-call history, loops lane, stop, kill switch, audit) and
/// nothing is reinvented. What is specific to it lives here:
///
///   • an OBSERVE-ONLY tool policy — it may read (list_*, read_transcript, git_state,
///     recall) and flag (board_integrity, flag_needs_human, clear_needs_human), never
///     dispatch, move, edit, assign, delete or arm anything (<see cref="IsToolAllowed"/>);
///   • the fixed ritual prompt (<see cref="Prompt"/>), re-sent every interval by the
///     loop; its sentinel (<see cref="Sentinel"/>) is never to be written, so the loop
///     never resolves as done;
///   • the CONTEXT CAP: a forever loop would grow its session without bound, so when the
///     last turn's context passes the cap (default 400k tokens) — or a turn count
///     fallback — the harness ROLLS the conversation over to a fresh session and prefixes
///     the next prompt with a mechanical handover (<see cref="Handover"/>). Nothing is
///     lost: the policeman's state IS the board (its stamps live on the cards), and the
///     old session stays listed for provenance (tool-call history by session id).
/// </summary>
public static class ArchPoliceman
{
    public const string ConversationId = "@arch:policeman";
    public const string ConversationName = "👮 Policeman";
    /// <summary>The recipe loop's sentinel: the policeman is told never to write it, so the
    /// loop never resolves "done". (A recipe loop needs one; this one is a tripwire.)</summary>
    public const string Sentinel = "POLICEMAN_RETIRED";
    /// <summary>The actor tag on a "check now" prompt the Operator pressed.</summary>
    public const string Actor = "policeman";
    public const string RecipeName = "policeman: keep the Kanban honest";
    public const string RefusedStatus = "policeman-observe-only";

    public const int DefaultIntervalSeconds = 300;
    public const int MinIntervalSeconds = 60;
    public const int MaxIntervalSeconds = 24 * 3600;
    public const int DefaultContextCapTokens = 400_000;
    public const int MinContextCapTokens = 20_000;
    /// <summary>Fallback rollover: a session that has taken this many turns is rolled over
    /// even if no usage figure was ever reported (a CLI that reports none).</summary>
    public const int MaxTurnsPerSession = 400;
    /// <summary>The recipe store clamps a cap to 1..100; the policeman's tick re-arms the loop
    /// the moment it is capped, so the cap is a heartbeat, not an end.</summary>
    public const int LoopCap = 100;
    public static readonly TimeSpan ErrorCooldown = TimeSpan.FromMinutes(10);
    public const int MaxSessionsKept = 60;

    public static bool IsPoliceman(string? key) => string.Equals(key, ConversationId, StringComparison.Ordinal);

    /// <summary>What the policeman may call. Everything else the arch has (send_task,
    /// dispatch_task, update_task, assign_task, create_task, delete_task, idea_to_task,
    /// adopt_branch, upgrade_peer, start/update/stop_loop, start/stop_arch_goal) is refused
    /// with <see cref="RefusedStatus"/> — it observes, verifies and flags; it never acts.</summary>
    public static readonly IReadOnlySet<string> AllowedTools = new HashSet<string>(StringComparer.Ordinal)
    {
        "list_agents", "list_machines", "git_state", "read_transcript", "list_loops", "list_arch_goals",
        "list_tasks", "list_ideas", "recall", "remember",
        "board_integrity", "flag_needs_human", "clear_needs_human",
        "list_pull_requests", "sync_card",
    };

    public static bool IsToolAllowed(string name) => AllowedTools.Contains(name);

    public static string RefusalDetail(string name) =>
        $"{name} is not available to the policeman: it observes, verifies, flags, and moves a card only to what the facts prove " +
        "(board_integrity, list_pull_requests, sync_card, flag_needs_human, clear_needs_human, list_*, read_transcript, git_state, recall). " +
        "Say what should happen; the Operator or the arch acts on it.";

    /// <summary>The ritual prompt the loop re-sends every interval. The board goal is inlined
    /// so the reference travels with the prompt (the arch reads it from list_tasks too).</summary>
    public static string Prompt(string? boardGoal)
    {
        var sb = new StringBuilder();
        sb.AppendLine("You are the board POLICEMAN — the standing checker that keeps the fleet Kanban HONEST (openspec kanban-board-integrity). This prompt is re-sent to you on a timer; do ONE pass each time:");
        sb.AppendLine();
        sb.AppendLine("1. Call board_integrity. It is the harness's own verdict from the REAL facts (the assignee's clone, the PR on GitHub, the deploy log): which cards are dishonest (their column is ahead of reality), which assignees are stuck (pinged, no PR, blocked or silent past the window), which cards are manual (not yours), and every card that already carries \"human assistance requested\" and who raised it.");
        sb.AppendLine("2. Call list_tasks, and where a verdict needs judgement read_transcript / git_state on the assignee, to CONFIRM or REFUTE each flagged card. The board goal below is the reference: say plainly when the board's state does not make sense for it.");
        sb.AppendLine("3. MOVE CARDS TO THE FACTS. For each managed repo call list_pull_requests: every PR comes traced back to the card it delivers when the harness can tell (tracedTo: how, sure, behind). When a card sits BEHIND its PR — still Doing while the PR is open, PR open while it is merged — call sync_card(id, pr, branch) to link the evidence and re-verify: the harness then moves the card to the column the facts support, forward only. When the trace is only a title match (sure = false), read the PR and the card first, and sync only if you are certain — say so in your verdict either way. Never move a card by claim; a card that says MORE than the facts stays where it is and is reported as dishonest.");
        sb.AppendLine("4. FLAG: flag_needs_human(id, reason) for an assignee that is genuinely stuck, or a card that keeps claiming more than the facts show and nobody is fixing it; clear_needs_human(id) when a card YOU flagged is honest again. You cannot dispatch, edit, assign, delete or move a card by claim — those tools are refused for you — so name what the Operator or the arch should do instead. Leave manual cards alone. Never re-ping anyone.");
        sb.AppendLine("5. Answer with a short verdict: N honest · N dishonest · N need human · N manual, then one line per card you moved (#ref — from → to — the PR) and per flagged card (#ref — why — what should happen). If nothing changed since your last pass, say \"no change\" and stop.");
        sb.AppendLine();
        sb.AppendLine("Only end with NEEDS_HUMAN: <question> when a decision that only the Operator can make blocks a flag. Never write the word POLICEMAN_RETIRED.");
        if (!string.IsNullOrWhiteSpace(boardGoal))
        {
            sb.AppendLine();
            sb.AppendLine("Board goal (set by the Operator): " + boardGoal.Trim());
        }
        return sb.ToString().TrimEnd();
    }

    /// <summary>The rollover rule (pure): the last reported context is at or over the cap, or
    /// the session has taken the fallback number of turns.</summary>
    public static bool NeedsRollover(long? lastContextTokens, int capTokens, int turnsThisSession, int maxTurns) =>
        (lastContextTokens is { } t && capTokens > 0 && t >= capTokens) || (maxTurns > 0 && turnsThisSession >= maxTurns);

    /// <summary>The mechanical handover prefixed to the first prompt of a fresh session: what
    /// the board says right now, so the new session starts from facts, not from memory.</summary>
    public static string Handover(int rollover, string? previousSessionId, string reason, string verdictSummary)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"[harness: context rolled over — this is session #{rollover + 1} of the policeman conversation; the previous session{(previousSessionId is null ? "" : $" {previousSessionId[..Math.Min(8, previousSessionId.Length)]}")} was cut because {reason}. Its transcript and tool calls stay in History. You keep no memory of it: everything you need is on the board, summarised here.]");
        sb.AppendLine(verdictSummary);
        sb.AppendLine("[Your standing prompt follows.]");
        return sb.ToString().TrimEnd();
    }

    /// <summary>One compact paragraph of the board's current integrity state for the handover.</summary>
    public static string VerdictSummary(BoardIntegrity.Summary s, IReadOnlyList<(string Ref, string Title, string By, string? Reason)> needsHuman)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Board now: {s.Cards} cards — {s.Honest} honest · {s.Dishonest} dishonest · {s.Stuck} stuck · {s.Manual} manual.");
        foreach (var f in s.Flagged) sb.AppendLine($"- {f.State}: {f.Title} — {f.Reason}");
        if (needsHuman.Count > 0)
        {
            sb.AppendLine("Cards carrying \"human assistance requested\":");
            foreach (var n in needsHuman) sb.AppendLine($"- {n.Ref} {n.Title} — by the {n.By}{(string.IsNullOrWhiteSpace(n.Reason) ? "" : $": {n.Reason}")}");
        }
        return sb.ToString().TrimEnd();
    }

    public static int CleanInterval(int? seconds) => seconds is { } s && s > 0 ? Math.Clamp(s, MinIntervalSeconds, MaxIntervalSeconds) : DefaultIntervalSeconds;
    public static int CleanCap(int? tokens) => tokens is { } t && t > 0 ? Math.Max(MinContextCapTokens, t) : DefaultContextCapTokens;
}
