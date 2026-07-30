namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// 🗒️ The queue kind (openspec: queue-based-loop): the bound dock tab's LIVE prompt
/// stash IS the queue — no snapshot, no cursor (D2). Each decide proposes the stash's
/// HEAD item with the consume-on-land marker; the engine removes it from the stash
/// only when the send lands (drive) or the pend is consumed (suggest), so items
/// added, removed, or reordered while armed simply change what unloads next, and any
/// stop is lossless. Between steps, verification is the default (D4): after a step
/// lands the loop owes a verification turn (composed at send time from the stored
/// template + that step's text); only a final-line <c>STEP_VERIFIED</c> unloads the
/// next item — any other verification reply stops the queue as
/// <c>escalate · step-unverified</c>, because a question or blocker must reach the
/// human, not get buried under the next prompt. An empty stash resolves
/// <c>done · drained</c>. <c>LOOP_DONE</c> in step replies is deliberately ignored
/// (a queue is the operator's ritual, not the agent's claim); the shared
/// <see cref="DrivenLoop"/> ladder (errored run / <c>NEEDS_HUMAN:</c> / deny-list)
/// still stops it before the next item is unloaded.
/// </summary>
public sealed class QueueLoop : DrivenLoop
{
    public override string Kind => LoopConfigStore.KindQueue;

    protected override LoopDecision DecideCore(LoopContext ctx)
    {
        var inst = ctx.Instance;

        // The bound tab disappeared mid-arm → error, never a silent zombie (D2).
        if (ctx.QueueStash is null)
            return new LoopDecision.Stop("error", "stash-tab-gone",
                "the dock tab whose stash this queue was armed on no longer exists");

        if (inst.Phase == LoopConfigStore.PhaseVerify)
        {
            // The verification turn's reply decides: verified → fall through and
            // unload the next item; anything else — a question, a blocker, a
            // partial — needs the human (D4).
            if (!FinalLineContains(ctx.LastAssistant, LoopConfigStore.StepVerifiedToken))
                return new LoopDecision.Stop("escalate", "step-unverified",
                    $"verification reply was not {LoopConfigStore.StepVerifiedToken}: \"{AutopilotService.Snippet(ctx.LastAssistant ?? "")}\"");
        }
        else if (inst.Phase == LoopConfigStore.PhaseVerifyOwed && inst.VerifyEnabled)
        {
            // A step landed and its turn is over → verify it before anything else
            // (D3). Composed at send time from the stored template + the stamped
            // step text — deterministic from two operator-visible texts.
            return new LoopDecision.Propose(
                LoopConfigStore.ComposeQueueVerifyPrompt(inst.LastStepText ?? ""),
                EnterPhase: LoopConfigStore.PhaseVerify);
        }

        if (ctx.QueueStash.Count == 0)
            return new LoopDecision.Stop("done", "drained",
                $"queue: {inst.QueueSent} prompt(s) completed");

        var head = ctx.QueueStash[0];
        return new LoopDecision.Propose(head.Text,
            EnterPhase: LoopConfigStore.PhaseWork,
            ConsumeStash: new StashRef(inst.QueueTabId ?? "", head.Id));
    }
}
