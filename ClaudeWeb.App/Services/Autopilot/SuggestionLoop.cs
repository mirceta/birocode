namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// 💡 The suggestion kind: watches an idle agent and asks the
/// <see cref="PromptClassifier"/> brain which of the user's routine prompts comes
/// next. Unlike the driven kinds it is open-ended — there is no sentinel and no
/// "done": a confident, non-risky verdict proposes that routine prompt as the next
/// prompt (the instance's mode then decides pre-fill vs. send, like every loop).
/// In SUGGEST mode even a below-threshold near-miss proposes — it only pre-fills
/// the composer with its honest confidence, and a human sends it, so the threshold
/// fences DRIVE sends only (fix-suggestion-loop-inert, D1). Risky (deny-listed)
/// and no-candidate verdicts are a non-terminal HOLD in every mode — the instance
/// stays armed and simply re-evaluates when the agent next speaks; a held
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

        // The engine may hand in a verdict it already computed off the tick path
        // (the CLI brain's cached result); otherwise ask the stub synchronously.
        var v = ctx.Verdict ?? _brain.Classify(ctx.LastAssistant, ctx.Threshold, ctx.DenyList, ctx.Routines);
        if (!v.Escalate && !string.IsNullOrWhiteSpace(v.Label))
            return new LoopDecision.Propose(v.Label!, Confidence: v.Confidence);

        // Suggest mode always pends the best candidate (fix-suggestion-loop-inert,
        // D1): a below-threshold near-miss still pre-fills the composer with its
        // honest confidence — a human sends every suggest-mode prompt, so the
        // threshold only fences DRIVE sends. Deny-listed candidates and verdicts
        // with no candidate at all stay holds; drive mode is unchanged.
        if (ctx.Instance.Mode == LoopConfigStore.ModeSuggest
            && !v.Denied && !string.IsNullOrWhiteSpace(v.Label))
            return new LoopDecision.Propose(v.Label!, Confidence: v.Confidence);

        return new LoopDecision.Hold(v.Reason, Escalate: true, v.Label, v.Confidence);
    }
}
