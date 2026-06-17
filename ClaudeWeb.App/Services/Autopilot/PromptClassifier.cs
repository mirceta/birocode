using System.Text.RegularExpressions;
using ClaudeWeb.Services.Prompts;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The brain (plans/loop-autopilot-brain.md): given an agent's last assistant
/// message, pick ONE of the user's routine prompts — or escalate.
///
/// <para><b>The label space is the user's own editable custom prompts, not a
/// hardcoded list and not raw mined history.</b> The set of routines is built by
/// <see cref="BuildRoutines"/> from the user's curated prompt library
/// (<see cref="PromptsService"/> / the "Routine prompts" tab): each routine's
/// <see cref="Routine.Label"/> is the prompt text autopilot would send (e.g.
/// "keep it", "deploy"), and its <see cref="Routine.Triggers"/> are the significant
/// words of that prompt — enriched, when the prompt matches a mined routine, with
/// the words from the assistant messages that historically preceded that reply. So
/// the brain can only ever return a prompt the user explicitly put in their list —
/// or <see cref="Verdict.Escalate"/>. Never free text, never an un-approved reply.</para>
///
/// <para>Mining (<see cref="AutopilotDiscoveryService"/>) still runs, but only to
/// <i>suggest drafts</i> the user can promote into their list — it no longer feeds
/// the recommender directly. An empty prompt library means an empty label space:
/// the brain escalates everything until the user adds prompts.</para>
///
/// <para>This is still the <b>stub</b> matcher (Slice 2): a deterministic word-overlap
/// score, not the eventual claude-CLI classifier. The {label, confidence} → gate
/// contract is unchanged, so the real classifier can still be swapped in without
/// touching the engine, API, or UI.</para>
/// </summary>
public class PromptClassifier
{
    /// <param name="Escalate">true = stop and ask the human (hard/unsure/risky/no set).</param>
    /// <param name="Label">the chosen routine prompt when not escalating.</param>
    /// <param name="Confidence">0–1; below the threshold always escalates.</param>
    /// <param name="Reason">short human-readable why, for the audit log / UI.</param>
    public sealed record Verdict(bool Escalate, string? Label, double Confidence, string Reason);

    /// <summary>One entry in the brain's label space — one of the user's editable custom
    /// prompts. <paramref name="Label"/> is the prompt text autopilot would send;
    /// <paramref name="Triggers"/> are the words that, when found in an assistant message,
    /// suggest that prompt; <paramref name="BaseConfidence"/> reflects how confident a
    /// match should score (higher when the prompt matches a frequently-recurring mined reply).</summary>
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
    /// Build the brain's label space from the user's <b>editable custom prompts</b>
    /// (their curated library). Each prompt's <see cref="Routine.Label"/> is its text
    /// (what autopilot sends); its triggers are the significant words of the prompt's
    /// text + label, <i>enriched</i> with the assistant-context words of a mined routine
    /// when the prompt matches one — so a hand-typed "deploy" still benefits from the
    /// real "ready to deploy?"-style contexts discovery already found. Base confidence
    /// is a solid default for a curated prompt, raised when it maps to a frequently
    /// recurring mined reply. Prompts that yield no usable triggers are dropped.
    /// <paramref name="discovery"/> is used only for this enrichment — it never adds
    /// routines of its own, so the label space is exactly the user's curated list.
    /// </summary>
    public static IReadOnlyList<Routine> BuildRoutines(
        IReadOnlyList<PromptsService.Prompt> customPrompts,
        AutopilotDiscoveryService.DiscoveryResult discovery)
    {
        // Index mined routines by normalised key, so a custom prompt can borrow the
        // assistant-context words (and recurrence) of a matching mined reply.
        var minedByKey = new Dictionary<string, AutopilotDiscoveryService.RoutinePrompt>(StringComparer.Ordinal);
        foreach (var r in discovery.Routines)
        {
            var k = NormaliseKey(r.Text);
            if (k.Length > 0) minedByKey[k] = r;
        }

        var routines = new List<Routine>();
        foreach (var p in customPrompts)
        {
            var text = (p.Text ?? string.Empty).Trim();
            if (text.Length == 0) continue;

            var triggers = new HashSet<string>(StringComparer.Ordinal);
            foreach (var w in Significant(text)) triggers.Add(w);
            foreach (var w in Significant(p.Label)) triggers.Add(w);

            // A curated prompt starts confident; if it matches a mined routine, pull in
            // that routine's preceding-assistant words and let recurrence lift it.
            double baseConf = 0.85;
            if (minedByKey.TryGetValue(NormaliseKey(text), out var mined) ||
                (NormaliseKey(p.Label).Length > 0 && minedByKey.TryGetValue(NormaliseKey(p.Label), out mined)))
            {
                foreach (var ctx in mined.SampleContexts)
                    foreach (var w in Significant(ctx))
                        triggers.Add(w);
                baseConf = Math.Min(0.97, 0.82 + 0.02 * Math.Max(0, mined.Count - 3));
            }

            if (triggers.Count == 0) continue;
            routines.Add(new Routine(text, triggers, baseConf));
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

        // No custom prompts yet → there is nothing the brain is allowed to send.
        // Escalate rather than fall back to any built-in default.
        if (routines.Count == 0)
            return new Verdict(true, null, 0, "no routine prompts yet — add some on the Routine prompts tab");

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

    private static readonly Regex Whitespace = new(@"\s+", RegexOptions.Compiled);

    // Mirrors AutopilotDiscoveryService.Normalise so a custom prompt's text/label can
    // be matched against the mined routine keys (lowercase, whitespace collapsed,
    // surrounding punctuation trimmed) — "Deploy.", "deploy" and "deploy\n" all equal.
    private static string NormaliseKey(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return "";
        var s = Whitespace.Replace(text.Trim().ToLowerInvariant(), " ");
        return s.Trim(' ', '.', '!', '?', ',', ';', ':');
    }
}
