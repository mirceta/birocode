using System.Text.RegularExpressions;

namespace ClaudeWeb.Services.Prompts;

/// <summary>
/// GOAL TEMPLATES (openspec arch-goal-templates, fleet task 545b9548): the second kind of entry in the arch's prompt
/// library. A cached prompt that encodes a goal conversation was a wall of text; a template is a parameterised STEP
/// PLAN — a purpose paragraph, typed inputs (the Prompts tab's placeholder types), an ordered list of steps with the
/// goal plan's shape (title, done-when, kind send | wait | transfer | verify | relay-loop | human | other), defaults
/// (cap, branch) and the goal it was captured from. Same store, same owner ("arch"), same usage counter; the Prompts tab
/// renders it as a stepper with input fields, and it is started either through the arch (sent to the chat to discuss)
/// or directly (start now). Placeholders in the purpose and the steps are {name}, one per input.
/// </summary>
public partial class PromptsService
{
    public const string KindGoalTemplate = "goal-template";
    public static readonly string[] InputTypes = { "agent", "repo", "machine", "task", "goal", "branch", "text", "number" };
    public static readonly string[] StepKinds = { "send", "wait", "transfer", "verify", "relay-loop", "human", "other" };
    public const int MaxSteps = 30;
    public const int MaxInputs = 12;
    public const int MaxPurposeLength = 4000;
    public const int MaxStepTextLength = 400;

    /// <param name="Name">the {name} the purpose and steps use: lowercase letters, digits, - and _</param>
    /// <param name="Type">agent | repo | machine | task | goal | branch | text | number</param>
    /// <param name="Label">what the field says (optional)</param>
    /// <param name="Default">a default value (optional)</param>
    public sealed record TemplateInput(string Name, string Type, string? Label = null, string? Default = null);
    public sealed record TemplateStep(string Title, string? Done = null, string Kind = "other");

    /// <summary>The body of a template add / update; validated by <see cref="CleanTemplate"/>.</summary>
    public sealed record TemplateDraft(string? Emoji, string? Label, string? Category, string? Purpose, IReadOnlyList<TemplateInput>? Inputs,
        IReadOnlyList<TemplateStep>? Steps, int? MaxIterations, string? Branch, string? SourceGoalId, string? Hint);

    private static readonly Regex InputName = new("^[a-z][a-z0-9_-]{0,30}$", RegexOptions.Compiled);

    /// <summary>Validated, trimmed parts of a template — or the reason it is refused.</summary>
    public static (bool Ok, string Error, TemplateDraft Clean) CleanTemplate(TemplateDraft d)
    {
        var label = CleanLabel(d.Label);
        if (label.Length == 0) return (false, "a template needs a name", d);
        var purpose = (d.Purpose ?? "").Trim();
        if (purpose.Length == 0) return (false, "a template needs a purpose (one paragraph: what the goal achieves)", d);
        if (purpose.Length > MaxPurposeLength) purpose = purpose[..MaxPurposeLength];
        var inputs = new List<TemplateInput>();
        foreach (var i in d.Inputs ?? Array.Empty<TemplateInput>())
        {
            var name = (i.Name ?? "").Trim().ToLowerInvariant();
            if (!InputName.IsMatch(name)) return (false, $"input \"{i.Name}\" needs a name of lowercase letters, digits, - or _", d);
            if (inputs.Any(x => x.Name == name)) return (false, $"input \"{name}\" is listed twice", d);
            var type = (i.Type ?? "").Trim().ToLowerInvariant();
            if (!InputTypes.Contains(type)) return (false, $"input \"{name}\" has an unknown type \"{i.Type}\" ({string.Join(" | ", InputTypes)})", d);
            inputs.Add(new TemplateInput(name, type, Clip(i.Label, MaxLabelLength), Clip(i.Default, MaxStepTextLength)));
        }
        if (inputs.Count > MaxInputs) return (false, $"at most {MaxInputs} inputs", d);
        var steps = new List<TemplateStep>();
        foreach (var s in d.Steps ?? Array.Empty<TemplateStep>())
        {
            var title = Clip(s.Title, MaxStepTextLength);
            if (title is null) continue;
            var kind = (s.Kind ?? "").Trim().ToLowerInvariant();
            steps.Add(new TemplateStep(title, Clip(s.Done, MaxStepTextLength), StepKinds.Contains(kind) ? kind : "other"));
        }
        if (steps.Count == 0) return (false, "a template needs at least one step", d);
        if (steps.Count > MaxSteps) return (false, $"at most {MaxSteps} steps", d);
        var cap = d.MaxIterations is { } c ? Math.Clamp(c, 1, 1000) : (int?)null;
        return (true, "", new TemplateDraft(CleanEmoji(string.IsNullOrWhiteSpace(d.Emoji) ? "🧭" : d.Emoji), label, CleanCategory(d.Category) ?? "Loops, goals & recurring",
            purpose, inputs, steps, cap, Clip(d.Branch, MaxLabelLength), Clip(d.SourceGoalId, 40), CleanHint(d.Hint)));
    }

    private static string? Clip(string? s, int max)
    {
        var t = (s ?? "").Trim();
        return t.Length == 0 ? null : t.Length > max ? t[..max] : t;
    }

    /// <summary>Adds a goal template to the arch library. Null + the reason when refused.</summary>
    public (Prompt? Template, string Error) AddTemplate(TemplateDraft draft)
    {
        var (ok, error, c) = CleanTemplate(draft);
        if (!ok) return (null, error);
        var p = new Prompt(Guid.NewGuid().ToString("N"), c.Emoji!, c.Label!, c.Purpose!, OwnerArch, c.Category, c.Hint, null, false,
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), 0, null, KindGoalTemplate, c.Purpose, c.Inputs!.ToList(), c.Steps!.ToList(), c.MaxIterations, c.Branch, c.SourceGoalId);
        lock (_gate) { _store.Prompts.Add(p); Save(); }
        _logger.Info($"[PROMPTS] Added goal template {p.Id} \"{p.Label}\" ({c.Steps!.Count} steps{(c.SourceGoalId is null ? "" : $", from goal {c.SourceGoalId}")})");
        return (p, "");
    }

    /// <summary>Replaces a goal template's parts (id, uses, creation kept). Null + the reason when refused / unknown.</summary>
    public (Prompt? Template, string Error) UpdateTemplate(string id, TemplateDraft draft)
    {
        var (ok, error, c) = CleanTemplate(draft);
        if (!ok) return (null, error);
        lock (_gate)
        {
            var i = _store.Prompts.FindIndex(p => p.Id == id);
            if (i < 0) return (null, "unknown template id");
            var cur = _store.Prompts[i];
            var up = cur with
            {
                Emoji = c.Emoji!, Label = c.Label!, Text = c.Purpose!, Category = c.Category, Hint = c.Hint, Kind = KindGoalTemplate,
                Purpose = c.Purpose, Inputs = c.Inputs!.ToList(), Steps = c.Steps!.ToList(), MaxIterations = c.MaxIterations, Branch = c.Branch,
                SourceGoalId = c.SourceGoalId ?? cur.SourceGoalId,
            };
            _store.Prompts[i] = up;
            Save();
            return (up, "");
        }
    }

    // ---- migration: cached prompts that were goal templates written as text -----------------------------------------

    /// <summary>The cached prompt "Agentic app goal: a repo agent builds its own harness app" (id ccf3ee7d…, captured
    /// from goal d750eceb) as the first goal template: the same seven gated steps, the {agent} / {text} / {branch} /
    /// {n} placeholders as typed inputs plus the example repos to study. Converted in place — same id, same uses.</summary>
    internal static TemplateDraft AgenticAppTemplate() => new(
        "🧪", "Agentic app goal: a repo agent builds its own harness app", "Loops, goals & recurring",
        "{agent} builds its own agentic app as a harness local app — {purpose}. It studies the harness's existing agent apps "
        + "(for example {examples}) first, designs before it codes, and ships in milestones on branch {branch}, each gated on its "
        + "closing line. Never re-send a brief already sent; relay any Operator question verbatim; no merge, no deploy.",
        new[]
        {
            new TemplateInput("agent", "agent", "the repo agent that builds its app"),
            new TemplateInput("purpose", "text", "what the app is for"),
            new TemplateInput("examples", "text", "example agent apps / repos to study", "the harness's own agent apps"),
            new TemplateInput("branch", "branch", "the branch it works on"),
            new TemplateInput("n", "number", "turn cap", "60"),
        },
        new[]
        {
            new TemplateStep("Wait for {agent}'s current task to finish", "its current turn has ended (list_agents: free)", "wait"),
            new TemplateStep("STUDY brief: survey the harness's existing agent apps ({examples}) and write FEATURE-ADOPTION.md (adopt / adapt / later / leave out), commit", "closing line \"STUDY: DONE <path>\"", "send"),
            new TemplateStep("DESIGN brief: app shape, port, control API (POST turn, GET turn/events/text, cancel, token file in a git-ignored data folder), agent-made tools (define → validate → register → persist → palette), decisions log, Local-tab registration; commit", "closing line \"DESIGN: DONE\"", "send"),
            new TemplateStep("M1: a skeleton that runs and answers on its port", "closing line \"M1: OK <url>\"", "send"),
            new TemplateStep("M2: the control API round trip from the harness", "closing line \"M2: OK\"", "send"),
            new TemplateStep("M3: history, command palette and one self-built tool", "closing line \"M3: OK\"", "send"),
            new TemplateStep("End-to-end check, push, PR on {branch} (no merge, no deploy)", "closing line \"TASK PR <id> <url>\"", "verify"),
        },
        60, null, "d750eceb",
        "Name the agent and what the app is for; the arch declares the seven steps, relays each closing line and never merges or deploys. Pattern from goal d750eceb (legal-research app).");

    private void MigrateLegacyTemplates()
    {
        lock (_gate)
        {
            var i = _store.Prompts.FindIndex(p => p.Id.StartsWith("ccf3ee7d", StringComparison.Ordinal) && p.Kind is null && SameOwner(p, OwnerArch));
            if (i < 0) return;
            var (ok, _, c) = CleanTemplate(AgenticAppTemplate());
            if (!ok) return;
            var cur = _store.Prompts[i];
            _store.Prompts[i] = cur with
            {
                Label = c.Label!, Text = c.Purpose!, Category = c.Category, Hint = c.Hint ?? cur.Hint, Kind = KindGoalTemplate, Purpose = c.Purpose,
                Inputs = c.Inputs!.ToList(), Steps = c.Steps!.ToList(), MaxIterations = c.MaxIterations, Branch = c.Branch, SourceGoalId = c.SourceGoalId,
            };
            Save();
            _logger.Info($"[PROMPTS] Migrated cached prompt {cur.Id} into a goal template ({c.Steps!.Count} steps, {c.Inputs!.Count} inputs)");
        }
    }
}
