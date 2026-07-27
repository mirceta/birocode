namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The common loop abstraction (openspec: unify-loop-types, revision 2 — D7). Every
/// autopilot mode — 💡 suggestion, 📋 recipe, 🎯 goal — is an implementation of this
/// interface. An implementation owns its kind's SEMANTICS only: given the agent's
/// trailing state it yields exactly one <see cref="LoopDecision"/> — what the
/// agent's NEXT prompt is, or that there is none. All MECHANICS — idle detection,
/// dedup, the cap check before a drive-mode send, sending vs. pre-filling the
/// composer (the instance's suggest/drive mode), auditing, state records — live in
/// the engine (<see cref="AutopilotService"/>) and are applied uniformly to every
/// kind's decisions. Implementations are stateless singletons; all per-agent state
/// lives on the <see cref="LoopConfigStore.LoopState"/> instance in the context.
/// </summary>
public interface ILoop
{
    /// <summary>The kind this implementation serves (a <see cref="LoopConfigStore"/> Kind* constant).</summary>
    string Kind { get; }

    /// <summary>Decides the next step for an idle agent: hold, stop, or propose.</summary>
    LoopDecision Decide(LoopContext ctx);
}

/// <summary>Everything a kind may look at: its own instance record, the agent's
/// trailing assistant message, whether the last run errored, and the global gate
/// inputs (deny list; classifier threshold + label space, used by the suggestion
/// kind only).</summary>
public sealed record LoopContext(
    LoopConfigStore.LoopState Instance,
    string? LastAssistant,
    bool RunErrored,
    IReadOnlyList<string> DenyList,
    double Threshold,
    IReadOnlyList<PromptClassifier.Routine> Routines);

/// <summary>The one value a kind returns — exactly one of the three cases below.</summary>
public abstract record LoopDecision
{
    private LoopDecision() { }

    /// <summary>Terminal: resolve the instance (<c>Status</c> = done | escalate |
    /// capped | error) with the reason that fired and its human-readable detail.</summary>
    public sealed record Stop(string Status, string Reason, string Detail) : LoopDecision;

    /// <summary>Stay armed, do nothing this turn — the suggestion kind's non-terminal
    /// verdicts. <c>Escalate</c> distinguishes "needs the human's eyes" from plain
    /// idle; <c>Label</c>/<c>Confidence</c> carry the classifier verdict for display.</summary>
    public sealed record Hold(string Reason, bool Escalate = false, string? Label = null, double Confidence = 0) : LoopDecision;

    /// <summary><c>Prompt</c> is the agent's next prompt; the ENGINE dispatches on the
    /// instance's mode (drive → send, suggest → pend into the composer).
    /// <c>EnterPhase</c>, when set, is applied once the proposal lands (a goal loop's
    /// work/verify transitions).</summary>
    public sealed record Propose(string Prompt, string? EnterPhase = null, double Confidence = 1.0) : LoopDecision;
}

/// <summary>
/// Shared ladder for the DRIVEN kinds (recipe, goal) — the ordered safety checks that
/// precede any kind-specific sentinel handling, preserved exactly from the
/// pre-interface engine: (1) run errored → stop <c>error</c>; (2) the
/// <c>NEEDS_HUMAN:</c> marker → stop <c>escalate</c> (checked before sentinels, so a
/// reply carrying both means blocked, not done); (3) a deny-listed term in the reply
/// → stop <c>escalate</c>. All matching is deterministic, case-insensitive string
/// search — no classifier, no LLM judge. The suggestion kind does NOT use this
/// ladder: it never drives a blocked agent (its escalations are non-terminal holds),
/// and its deny handling is the classifier gate's label check.
/// </summary>
public abstract class DrivenLoop : ILoop
{
    public abstract string Kind { get; }

    public LoopDecision Decide(LoopContext ctx)
    {
        if (ctx.RunErrored)
            return new LoopDecision.Stop("error", "error", "the agent's run errored");

        var last = ctx.LastAssistant;
        if (last != null)
        {
            var idx = last.IndexOf(AutopilotService.NeedsHumanMarker, StringComparison.OrdinalIgnoreCase);
            if (idx >= 0)
            {
                var question = AutopilotService.Snippet(last[(idx + AutopilotService.NeedsHumanMarker.Length)..]);
                return new LoopDecision.Stop("escalate", "needs-human",
                    string.IsNullOrEmpty(question) ? "the agent asked for the human" : question);
            }

            var hit = ctx.DenyList.FirstOrDefault(d =>
                !string.IsNullOrEmpty(d) && last.Contains(d, StringComparison.OrdinalIgnoreCase));
            if (hit != null)
                return new LoopDecision.Stop("escalate", "deny-list", $"reply mentions deny-listed \"{hit}\"");
        }

        return DecideCore(ctx);
    }

    protected abstract LoopDecision DecideCore(LoopContext ctx);

    protected static bool SentinelHit(LoopContext ctx) =>
        !string.IsNullOrEmpty(ctx.Instance.Sentinel)
        && FinalLineContains(ctx.LastAssistant, ctx.Instance.Sentinel);

    /// <summary>Completion tokens (the sentinel, <c>GOAL_VERIFIED</c>) count only on
    /// the reply's FINAL non-empty line (fix-loop-conversation-identity, D5) — the
    /// contract docs/loop-driven-agent-convention.md states ("end your reply with …
    /// as the final line"). Containment within that one line, case-insensitive, so
    /// trailing punctuation survives; a reply that merely quotes or mentions the
    /// token earlier no longer completes a loop. <c>NEEDS_HUMAN:</c> and the
    /// deny-list stay whole-reply matches above: their false-positive direction is
    /// "stop and ask a human", the safe side.</summary>
    protected static bool FinalLineContains(string? reply, string token)
    {
        if (string.IsNullOrWhiteSpace(reply)) return false;
        foreach (var raw in reply.Split('\n').Reverse())
        {
            var line = raw.Trim();
            if (line.Length == 0) continue;
            return line.Contains(token, StringComparison.OrdinalIgnoreCase);
        }
        return false;
    }
}
