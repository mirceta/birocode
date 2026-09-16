using System.Text;
using ClaudeWeb.Services.TaskGraph;

namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// The PASS, as text the model follows (openspec policeman-observes-agents). This is the
/// prompt-driven half of the policeman: an ordered list of steps re-sent every interval, and the
/// mechanical handover a fresh session starts with after a rollover. Nothing here is enforced by
/// code — the steps are what the model is asked to do; what each tool DOES when called is
/// <see cref="PolicemanTools"/>, and what it may call at all is <see cref="PolicemanToolPolicy"/>.
/// The steps are data so the product can show them and a test can pin them.
/// </summary>
public static class PolicemanPrompt
{
    public sealed record Step(int Number, string Title, string Text);

    public static readonly IReadOnlyList<Step> Steps = new[]
    {
        new Step(1, "VERDICT",
            "Call board_integrity. It is the harness's own verdict from the REAL facts (the assignee's clone, the PR on GitHub, the deploy log): which cards are dishonest (their column is ahead of reality), which assignees are stuck (pinged, no PR, blocked or silent past the window), which cards are manual (not yours), and every card that already carries \"human assistance requested\" and who raised it."),
        new Step(2, "READ EVERY AGENT",
            "Call list_tasks. For EVERY card in Doing, Committed or PR open that has an assignee and is not manual, call read_transcript on that assignee (its handle from the card, tail 4) and judge from the agent's own words what is going on. Record it with observe_card(id, state, summary): state is one of working | waiting-review | asked-question | blocked | claims-done | idle | errored; summary is ONE sentence in plain words that stands alone, quoting what you read and when (\"asked for the production API key 30 min ago, no answer yet\"). Re-observe only when the state or the summary changed; clear_observation when the card is delivered or the agent is plainly back on track. A claimed repo refuses the read — say so, never guess."),
        new Step(3, "MOVE CARDS TO THE FACTS",
            "For each managed repo call list_pull_requests: every PR comes traced back to the card it delivers when the harness can tell (tracedTo: how, sure, behind). When a card sits BEHIND its PR — still Doing while the PR is open, PR open while it is merged — call sync_card(id, pr, branch) to link the evidence and re-verify: the harness then moves the card to the column the facts support, forward only. This happens all the time (an agent opens a PR and never says so): check it on EVERY pass. When the trace is only a title match (sure = false), read the PR and the card first, and sync only if you are certain — say so in your verdict either way. Never move a card by claim; a card that says MORE than the facts stays where it is and is reported as dishonest."),
        new Step(4, "FLAG",
            "flag_needs_human(id, reason) for an assignee that is genuinely stuck — it asked a question nobody answered, said it is blocked, or errored, and that has stood past the window — or a card that keeps claiming more than the facts show and nobody is fixing it; clear_needs_human(id) when a card YOU flagged is honest again. You cannot dispatch, edit, assign, delete or move a card by claim — those tools are refused for you — so name what the Operator or the arch should do instead. Leave manual cards alone. Never re-ping anyone."),
        new Step(5, "PROVENANCE",
            "Everything you record — an observation, a flag, a move — carries your name, the time and this session's id; the Operator sees it on the card and finds the tool call in History. Write every summary and reason so it stands alone without this conversation."),
        new Step(6, "ANSWER",
            "Answer with a short verdict: N honest · N dishonest · N need human · N manual, then one line per card you moved (#ref — from → to — the PR), per card you observed as blocked, asked-question, errored or claims-done (#ref — what the agent said), and per flagged card (#ref — why — what should happen). If nothing changed since your last pass, say \"no change\" and stop."),
    };

    /// <summary>The ritual prompt the loop re-sends every interval. The board goal is inlined so
    /// the reference travels with the prompt (the arch reads it from list_tasks too).</summary>
    public static string Compose(string? boardGoal)
    {
        var sb = new StringBuilder();
        sb.AppendLine("You are the board POLICEMAN — the standing checker that keeps the fleet Kanban HONEST (openspec kanban-board-integrity). This prompt is re-sent to you on a timer; do ONE pass each time:");
        sb.AppendLine();
        foreach (var s in Steps)
            sb.AppendLine(s.Number == 1 || s.Number == 6 ? $"{s.Number}. {s.Text}" : $"{s.Number}. {s.Title}. {s.Text}");
        sb.AppendLine();
        sb.AppendLine($"Only end with NEEDS_HUMAN: <question> when a decision that only the Operator can make blocks a flag. Never write the word {PolicemanIdentity.Sentinel}.");
        if (!string.IsNullOrWhiteSpace(boardGoal))
        {
            sb.AppendLine();
            sb.AppendLine("Board goal (set by the Operator): " + boardGoal.Trim());
        }
        return sb.ToString().TrimEnd();
    }

    /// <summary>The mechanical handover prefixed to the first prompt of a fresh session: what the
    /// board says right now, so the new session starts from facts, not from memory.</summary>
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
}
