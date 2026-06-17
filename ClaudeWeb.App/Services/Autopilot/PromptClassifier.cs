namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The brain (plans/loop-autopilot-brain.md): given an agent's last assistant
/// message, pick ONE of the user's routine prompts — or escalate. This is the
/// <b>stub</b> implementation (Slice 2): a deterministic keyword match over a fixed
/// routine set, with the same {label, confidence} → gate contract the real
/// claude-CLI classifier will satisfy, so it can be swapped in without touching the
/// engine, API, or UI.
///
/// Constrained-label-set is the whole safety idea: it can only ever return one of
/// the known routine prompts or <see cref="Verdict.Escalate"/> — never free text.
/// </summary>
public class PromptClassifier
{
    /// <param name="Escalate">true = stop and ask the human (hard/unsure/risky).</param>
    /// <param name="Label">the chosen routine prompt when not escalating.</param>
    /// <param name="Confidence">0–1; below the threshold always escalates.</param>
    /// <param name="Reason">short human-readable why, for the audit log / UI.</param>
    public sealed record Verdict(bool Escalate, string? Label, double Confidence, string Reason);

    // A routine prompt + the phrases in an ASSISTANT message that call for it, with a
    // base confidence. Specific asks score high; a bare yes/no question scores low so
    // it falls below the default 0.85 threshold and escalates (ambiguity → escalate).
    private sealed record Rule(string Label, double Confidence, string[] Triggers);

    private static readonly Rule[] Rules =
    {
        new("play it back", 0.92, new[] { "play it back", "play back", "playback", "want me to play" }),
        new("deploy",       0.90, new[] { "deploy", "ship it", "ready to ship" }),
        new("push it",      0.90, new[] { "push to origin", "push it", "merge to main", "ready to push", "shall i push" }),
        new("keep it",      0.88, new[] { "keep it", "roll back", "rollback", "keep or roll" }),
        new("continue",     0.86, new[] { "continue", "keep going", "carry on", "shall i proceed", "proceed?" }),
        new("now test it",  0.84, new[] { "test it", "run the tests", "should i test", "want me to test" }),
        new("yes",          0.70, new[] { "shall i", "should i", "want me to", "do you want me", "is that ok", "ok?" }),
    };

    public Verdict Classify(string? assistantMessage, double threshold, IReadOnlyCollection<string> denyList)
    {
        if (string.IsNullOrWhiteSpace(assistantMessage))
            return new Verdict(true, null, 0, "no message to act on");

        var text = assistantMessage.ToLowerInvariant();

        // Best (highest-confidence) rule whose any trigger appears in the message.
        Rule? best = null;
        foreach (var rule in Rules)
            if ((best is null || rule.Confidence > best.Confidence) &&
                rule.Triggers.Any(t => text.Contains(t)))
                best = rule;

        if (best is null)
            return new Verdict(true, null, 0, "no confident routine match");

        // Risky-action fence: a deny-listed label always escalates, even if confident
        // (plans/loop-autopilot-safety.md). Match on the label, not incidental mentions,
        // so "keep it" still advances after a message that merely says "deployed".
        if (denyList.Any(d => best.Label.Contains(d, StringComparison.OrdinalIgnoreCase)))
            return new Verdict(true, best.Label, best.Confidence, $"\"{best.Label}\" is deny-listed (risky)");

        if (best.Confidence < threshold)
            return new Verdict(true, best.Label, best.Confidence, $"below threshold ({best.Confidence:0.00} < {threshold:0.00})");

        return new Verdict(false, best.Label, best.Confidence, "confident routine match");
    }
}
