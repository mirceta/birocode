using System.Text.RegularExpressions;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The brain (plans/loop-autopilot-brain.md): given an agent's last assistant
/// message, pick ONE of the user's routine prompts — or escalate.
///
/// <para><b>The label space is the user's own mined history, not a hardcoded list.</b>
/// The set of routines is built by <see cref="BuildRoutines"/> from
/// <see cref="AutopilotDiscoveryService.DiscoveryResult"/>: each routine's
/// <see cref="Routine.Label"/> is a reply the user actually keeps typing (e.g.
/// "keep it", "deploy"), and its <see cref="Routine.Triggers"/> are the significant
/// words from the assistant messages that historically preceded that reply. So the
/// brain can only ever return one of the user's real recurring replies — or
/// <see cref="Verdict.Escalate"/>. Never free text, never a built-in default.</para>
///
/// <para>This is still the <b>stub</b> matcher (Slice 2): a deterministic word-overlap
/// score, not the eventual claude-CLI classifier. What changed from the first cut is
/// the <i>source</i> of the labels — the {label, confidence} → gate contract is
/// unchanged, so the real classifier can still be swapped in without touching the
/// engine, API, or UI.</para>
/// </summary>
public class PromptClassifier
{
    /// <param name="Escalate">true = stop and ask the human (hard/unsure/risky/no set).</param>
    /// <param name="Label">the chosen routine prompt when not escalating.</param>
    /// <param name="Confidence">0–1; below the threshold always escalates.</param>
    /// <param name="Reason">short human-readable why, for the audit log / UI.</param>
    public sealed record Verdict(bool Escalate, string? Label, double Confidence, string Reason);

    /// <summary>One entry in the brain's label space, derived from the user's history.
    /// <paramref name="Label"/> is the reply autopilot would send; <paramref name="Triggers"/>
    /// are the words that, when found in an assistant message, suggest that reply;
    /// <paramref name="BaseConfidence"/> reflects how routine the reply is (recurrence).</summary>
    public sealed record Routine(string Label, IReadOnlyCollection<string> Triggers, double BaseConfidence);

    private static readonly Regex Word = new(@"[a-z0-9]+", RegexOptions.Compiled);

    // Words too common to carry intent — excluded from both triggers and the message
    // tokens so the overlap reflects real signal, not "the"/"to"/"it".
    private static readonly HashSet<string> Stop = new(StringComparer.Ordinal)
    {
        "the","a","an","to","of","in","on","at","is","it","its","be","do","you","your",
        "i","we","me","my","and","or","but","if","so","for","with","this","that","these",
        "those","want","like","would","should","could","can","will","shall","now","then",
        "here","there","what","which","who","how","when","are","was","were","has","have",
        "had","not","no","yes","ok","okay","please","let","me","us","am","as","by","from",
        "out","up","off","just","also","any","all","one","two","more","next","done",
    };

    /// <summary>
    /// Turn the mined discovery result into the brain's label space. Each recurring
    /// routine reply becomes a <see cref="Routine"/> whose triggers are the significant
    /// words from the assistant messages that preceded it (plus the reply's own words),
    /// and whose base confidence climbs a little with how often it recurs. Routines
    /// that yield no usable triggers are dropped (they could never match).
    /// </summary>
    public static IReadOnlyList<Routine> BuildRoutines(AutopilotDiscoveryService.DiscoveryResult discovery)
    {
        var routines = new List<Routine>();
        foreach (var r in discovery.Routines)
        {
            var triggers = new HashSet<string>(StringComparer.Ordinal);
            foreach (var ctx in r.SampleContexts)
                foreach (var w in Significant(ctx))
                    triggers.Add(w);
            // The reply's own words help when the assistant echoes the action
            // ("ready to deploy?" → reply "deploy").
            foreach (var w in Significant(r.Text))
                triggers.Add(w);

            if (triggers.Count == 0) continue;

            // 0.78 at the minimum recurrence, +0.02 per extra occurrence, capped 0.97.
            var baseConf = Math.Min(0.97, 0.78 + 0.02 * Math.Max(0, r.Count - 3));
            routines.Add(new Routine(r.Text.Trim(), triggers, baseConf));
        }
        return routines;
    }

    /// <param name="routines">the label space — built from the user's mined history.</param>
    public Verdict Classify(
        string? assistantMessage, double threshold,
        IReadOnlyCollection<string> denyList, IReadOnlyList<Routine> routines)
    {
        if (string.IsNullOrWhiteSpace(assistantMessage))
            return new Verdict(true, null, 0, "no message to act on");

        // No mined routines yet → there is nothing the brain is allowed to send.
        // Escalate rather than fall back to any built-in default.
        if (routines.Count == 0)
            return new Verdict(true, null, 0, "no routine set yet — nothing to send");

        var msgTokens = Significant(assistantMessage).ToHashSet(StringComparer.Ordinal);
        if (msgTokens.Count == 0)
            return new Verdict(true, null, 0, "message has no actionable words");

        // Score each routine by how much of its trigger vocabulary the message hits.
        // Matching ~a quarter of the triggers (min 2 words) counts as a full match, so
        // a thin sample-context set isn't punished for the words it happens to lack.
        Routine? best = null;
        double bestStrength = 0;
        foreach (var r in routines)
        {
            var overlap = r.Triggers.Count(t => msgTokens.Contains(t));
            if (overlap == 0) continue;
            var need = Math.Max(2.0, Math.Ceiling(r.Triggers.Count * 0.25));
            var strength = Math.Min(1.0, overlap / need);
            if (strength > bestStrength || (strength == bestStrength && best != null && r.BaseConfidence > best.BaseConfidence))
            {
                bestStrength = strength;
                best = r;
            }
        }

        if (best is null)
            return new Verdict(true, null, 0, "no routine matched this message");

        // Confidence = match strength scaled by how routine the reply is, so a strong
        // content hit on a very frequent reply scores highest.
        var confidence = Math.Round(Math.Min(0.99, bestStrength * best.BaseConfidence), 2);

        // Risky-action fence: a deny-listed label always escalates, even if confident
        // (plans/loop-autopilot-safety.md). Match on the label, not incidental mentions.
        if (denyList.Any(d => best.Label.Contains(d, StringComparison.OrdinalIgnoreCase)))
            return new Verdict(true, best.Label, confidence, $"\"{best.Label}\" is deny-listed (risky)");

        if (confidence < threshold)
            return new Verdict(true, best.Label, confidence, $"below threshold ({confidence:0.00} < {threshold:0.00})");

        return new Verdict(false, best.Label, confidence, "confident routine match");
    }

    // Lowercased word tokens of length ≥ 3, minus stop-words — the signal carriers.
    private static IEnumerable<string> Significant(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) yield break;
        foreach (Match m in Word.Matches(text.ToLowerInvariant()))
        {
            var w = m.Value;
            if (w.Length >= 3 && !Stop.Contains(w)) yield return w;
        }
    }
}
