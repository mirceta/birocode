namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// 🎯 The goal kind: the user states a goal; the instance stores a work prompt and
/// a verification prompt composed once at arm time (see
/// <see cref="LoopConfigStore.StartGoal"/>). A goal is a claim about the world, so
/// a done-claim is never trusted: in the work phase the sentinel proposes the
/// VERIFICATION prompt (entering the verify phase once it lands); only
/// <c>GOAL_VERIFIED</c> in a verification reply resolves <c>done</c> (reason
/// <c>verified</c>). A verification that found gaps proposes the work prompt again
/// (falling back to the work phase). A premature <c>GOAL_VERIFIED</c> during the
/// work phase is ignored — only <c>LOOP_DONE</c> triggers verification.
/// </summary>
public sealed class GoalLoop : DrivenLoop
{
    public override string Kind => LoopConfigStore.KindGoal;

    protected override LoopDecision DecideCore(LoopContext ctx)
    {
        var inst = ctx.Instance;

        if (inst.Phase == LoopConfigStore.PhaseVerify)
        {
            if (ctx.LastAssistant != null && ctx.LastAssistant.Contains(
                    LoopConfigStore.VerifiedToken, StringComparison.OrdinalIgnoreCase))
                return new LoopDecision.Stop("done", "verified",
                    $"verification turn emitted {LoopConfigStore.VerifiedToken}");

            // Verification found gaps (the agent was told to list them and keep
            // working) → back to the work phase with the work prompt.
            return new LoopDecision.Propose(inst.Prompt, EnterPhase: LoopConfigStore.PhaseWork);
        }

        if (SentinelHit(ctx))
            return new LoopDecision.Propose(inst.VerifyPrompt ?? inst.Prompt, EnterPhase: LoopConfigStore.PhaseVerify);

        return new LoopDecision.Propose(inst.Prompt);
    }
}
