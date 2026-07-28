namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// 💡 The suggestion kind: watches an idle agent and asks the
/// <see cref="PromptClassifier"/> brain which of the user's routine prompts comes
/// next. Unlike the driven kinds it is open-ended — there is no sentinel and no
/// "done": a confident, non-risky verdict proposes that routine prompt as the next
/// prompt (the instance's mode then decides pre-fill vs. send, like every loop),
/// while an unclear or risky verdict is a non-terminal HOLD — the instance stays
/// armed and simply re-evaluates when the agent next speaks. The classifier gate
/// (threshold + label deny-list) already folded risk into the verdict, so a held
/// escalation here never disarms anything.
/// </summary>
public sealed class SuggestionLoop : ILoop
{
    private readonly PromptClassifier _brain;

    public SuggestionLoop(PromptClassifier brain) => _brain = brain;

    public string Kind => LoopConfigStore.KindSuggestion;

    public LoopDecision Decide(LoopContext ctx)
    {
        if (string.IsNullOrWhiteSpace(ctx.LastAssistant))
            return new LoopDecision.Hold("no recent agent message");

        var v = _brain.Classify(ctx.LastAssistant, ctx.Threshold, ctx.DenyList, ctx.Routines);
        return v.Escalate || string.IsNullOrWhiteSpace(v.Label)
            ? new LoopDecision.Hold(v.Reason, Escalate: true, v.Label, v.Confidence)
            : new LoopDecision.Propose(v.Label!, Confidence: v.Confidence);
    }
}
