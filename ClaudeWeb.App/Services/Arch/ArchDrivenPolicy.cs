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
/// <item><b>Repeats are paced, never parked.</b> Re-sending the SAME work prompt the
/// arch agent just answered would spin it ("still waiting…") every tick while the repo
/// agents do the actual work. So a repeat waits — but only for whichever comes first:
/// a managed repo turn started or ended since the last arch turn (a wake), or the
/// quiet floor elapsing since the last send. The floor is what keeps a dark peer, a
/// timed-out send or a stuck repo agent from parking the loop forever: the arch gets a
/// periodic turn to re-check the fleet and escalate. A NEW prompt — the first send of
/// an arm, a verification prompt, a phase change, the next queue step — goes out at
/// once, exactly like a repo dock.</item>
/// </list>
/// "Repeat" is decided from the instance's own record (<c>IterationsDone</c>,
/// <c>LastSentAt</c> within this arm), never from process memory, so a re-arm or a
/// restart can never mistake the first send for a repeat.
/// </summary>
public static class ArchDrivenPolicy
{
    public const string WaitingForWake = "waiting for a managed repo turn";
    public static readonly TimeSpan DefaultQuietFloor = TimeSpan.FromMinutes(5);

    /// <summary>Has this instance sent at least once in the CURRENT arming?</summary>
    public static bool HasSentThisArm(LoopConfigStore.LoopState inst) =>
        inst.IterationsDone > 0 && inst.LastSentAt > 0 && inst.LastSentAt >= inst.ArmedAt;

    public static LoopDecision Apply(LoopDecision decision, LoopConfigStore.LoopState inst, string? lastSentPrompt,
        long nowMs, TimeSpan quietFloor, Func<bool> hasWake)
    {
        switch (decision)
        {
            case LoopDecision.Stop { Reason: "needs-human" } stop:
                return new LoopDecision.Hold($"{ArchLoop.WaitingPrefix}: {stop.Detail}", Escalate: true, Label: stop.Detail);

            case LoopDecision.Propose propose
                when propose.EnterPhase is null
                     && HasSentThisArm(inst)
                     && lastSentPrompt is not null
                     && string.Equals(propose.Prompt, lastSentPrompt, StringComparison.Ordinal):
            {
                if (hasWake()) return propose;
                var floor = quietFloor <= TimeSpan.Zero ? DefaultQuietFloor : quietFloor;
                var due = inst.LastSentAt + (long)floor.TotalMilliseconds;
                if (nowMs >= due) return propose; // the quiet floor: nudge the arch agent even in silence
                var left = TimeSpan.FromMilliseconds(due - nowMs);
                return new LoopDecision.Hold($"{WaitingForWake} · re-prompt in {(int)left.TotalMinutes}:{left.Seconds:00}");
            }

            default:
                return decision;
        }
    }
}
