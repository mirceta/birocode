namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// 📋 The recipe kind: drives one fixed stored ritual prompt (e.g. "Drive the
/// OpenSpec change"), turn after turn, and trusts the agent's own sentinel
/// (<c>LOOP_DONE</c>) as the stop condition — appropriate because a recipe's steps
/// are externally checkable (tasks ticked, commits made). The simplest ILoop:
/// after the shared <see cref="DrivenLoop"/> ladder, either the sentinel ends it
/// or the stored prompt is the next prompt.
/// </summary>
public sealed class RecipeLoop : DrivenLoop
{
    public override string Kind => LoopConfigStore.KindRecipe;

    protected override LoopDecision DecideCore(LoopContext ctx) =>
        SentinelHit(ctx)
            ? new LoopDecision.Stop("done", "sentinel", $"agent emitted \"{ctx.Instance.Sentinel}\"")
            : new LoopDecision.Propose(ctx.Instance.Prompt);
}
