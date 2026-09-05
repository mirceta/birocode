using ClaudeWeb.Services.Autopilot;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch agent's rules applied on top of a DRIVEN loop kind (goal, recipe, queue)
/// when the instance is the reserved <c>@arch</c> key (openspec arch-driven-loops).
/// The dock's loop kinds are reused as-is — same store, same engine, same control —
/// and only two things differ for a coordinator whose turns are mostly waiting:
/// <list type="number">
/// <item><b>A question is a hold.</b> A <c>NEEDS_HUMAN:</c> stop from the driven ladder
/// becomes the same escalated hold the standing arch loop uses (openspec
/// arch-standing-loop), so the loop stays armed while the Operator answers.</item>
/// <item><b>Re-prompts are paced by wakes.</b> Re-sending the SAME work prompt the
/// arch agent just answered would spin it ("still waiting…") every tick while the repo
/// agents do the actual work. A repeat of the last sent prompt goes out only when a
/// managed repo turn started or ended since the last arch turn (a wake exists); a new
/// prompt — the first send, a verification prompt, a phase change, the next queue
/// step — goes out at once, exactly like a repo dock.</item>
/// </list>
/// Pure and unit-testable: the engine passes the last prompt it sent to <c>@arch</c>
/// and a probe that composes (and, when the send lands, commits) the wake.
/// </summary>
public static class ArchDrivenPolicy
{
    public const string WaitingForWake = "waiting for a managed repo turn before re-prompting the arch agent";

    public static LoopDecision Apply(LoopDecision decision, string? lastSentPrompt, Func<bool> hasWake)
    {
        switch (decision)
        {
            case LoopDecision.Stop { Reason: "needs-human" } stop:
                return new LoopDecision.Hold($"{ArchLoop.WaitingPrefix}: {stop.Detail}", Escalate: true, Label: stop.Detail);

            case LoopDecision.Propose propose
                when propose.EnterPhase is null
                     && lastSentPrompt is not null
                     && string.Equals(propose.Prompt, lastSentPrompt, StringComparison.Ordinal):
                return hasWake() ? propose : new LoopDecision.Hold(WaitingForWake);

            default:
                return decision;
        }
    }
}
