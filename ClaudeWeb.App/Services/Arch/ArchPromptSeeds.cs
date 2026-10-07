using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Prompts;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch agent's SEED PROMPTS (openspec arch-custom-prompts, fleet task ebc91192): one
/// cached prompt per Arch-examples category — the request templates mined from the real
/// arch conversations (openspec arch-examples-tab, <c>management/arch-examples.json</c>) —
/// phrased the way the Operator actually asks, with PLACEHOLDERS (<c>{machine}</c>,
/// <c>{agent}</c>, <c>{task}</c>, <c>{pr}</c>, <c>{url}</c>, <c>{branch}</c>, <c>{text}</c>…)
/// the composer renders as fill-in chips. A curated wording exists for every known category;
/// a category the miner adds later gets its template with the <c>&lt;placeholders&gt;</c>
/// converted. Seeds are keyed by the category id (<c>SeedId</c>), so a re-seed adds only the
/// missing ones and never touches what the Operator edited.
/// </summary>
public static class ArchPromptSeeds
{
    // The panel's groups, in display order.
    public const string GroupDeploy = "Deploy & fleet";
    public const string GroupCards = "Cards & board";
    public const string GroupAgents = "Agents";
    public const string GroupLoops = "Loops, goals & recurring";
    public const string GroupFiles = "Files";
    public const string GroupAsk = "Ask & nudge";
    public static readonly string[] Groups = { GroupDeploy, GroupCards, GroupAgents, GroupLoops, GroupFiles, GroupAsk };

    private sealed record Seed(string Id, string Group, string Emoji, string Label, string Text);

    // Curated wordings: the category's template + its "how to phrase it" tip, folded into one
    // prompt with placeholders. Order = the order they are seeded in.
    private static readonly Seed[] Curated =
    {
        new("redeploy-hub", GroupDeploy, "🚀", "Pull main and redeploy this hub only",
            "We merged PR #{pr} in birocode. Pull main and redeploy the harness on this computer only — report the commit and whether it restarted healthy."),
        new("redeploy-fleet", GroupDeploy, "🛰️", "Update all fleet harnesses except one",
            "We merged new PRs in birocode. Update all fleet harnesses to the newest main, except {machine} (it is busy) — each pulls main and redeploys; report which build each one is on."),
        new("provision-repo-agent", GroupDeploy, "🧱", "Provision a new repo agent",
            "Provision a new repo agent on {machine} for {url}: clone it as a sibling of the harness repo, register it, create its dock tab, and report when it answers."),
        new("scope-and-access", GroupDeploy, "🔑", "I changed scope / access — try again",
            "I put {machine}'s {agent} under your scope / turned on sends on {machine} — re-check and try again."),

        new("delegate-feature-task", GroupCards, "📝", "Create + dispatch a feature task to a free birocode agent",
            "Another task for a free birocode agent: {task}. Work end to end on a feature branch and open a descriptive PR with screenshots. Do not merge, do not deploy."),
        new("tracking-card", GroupCards, "📌", "Tracking-only card (do not contact the agent)",
            "Make a card for {agent} — it is already working on {task}. Do not contact the agent, we just want to track it on the board."),
        new("cross-repo-card", GroupCards, "🧩", "Cross-repo card, no dispatch",
            "Create a card for {task}. Assign {agent} and {agent} — both work on it. Do not send them anything, just create the card."),
        new("card-status-fix", GroupCards, "✅", "Move a card to done / reflect a merged PR",
            "We merged task {task} / PR #{pr} — reflect that on the card and move it to Done."),
        new("card-reassign", GroupCards, "🔁", "Reassign a card to another agent",
            "Reassign card {task} to {agent} — reflect it on the card; do not re-send unless I say so."),
        new("card-delete", GroupCards, "🗑️", "Delete a junk card",
            "Task {task} is junk / a duplicate — delete it."),
        new("card-clarify", GroupCards, "❓", "What is this card about?",
            "What is task {task} about? One paragraph, then whether it is still worth doing."),
        new("bug-report", GroupCards, "🐛", "Dashboard bug → bug card for the hub agent",
            "Bug on the management dashboard: {text} (machine {machine}). Make a bug card for the hub's birocode agent: find the cause and fix it — a PR with the root cause and screenshots, no merge, no deploy."),

        new("agents-status", GroupAgents, "👀", "Which agents are free?",
            "Which agents are free right now? One line per agent: machine, repo, branch, what it is doing."),
        new("agents-table", GroupAgents, "📊", "Table of what each prg agent is doing",
            "For every prg repo agent on the fleet list the machine, the path, the branch it works on and whether its PR is merged — as a table."),
        new("investigate", GroupAgents, "🔍", "Investigate what an agent did",
            "On {machine} check {agent}: what did it do, is it finished, did it post a PR? Give me the evidence, not a guess."),
        new("agent-git-order", GroupAgents, "🧹", "Reset an agent's repo to main",
            "Tell {agent} to abandon its branch, clear the dirty repo (uncommitted work may be dropped), return to main and pull from origin."),
        new("branch-handover", GroupAgents, "🤝", "Take over a branch",
            "Take over branch {branch} on {agent} — adopt it so the repo stops being claimed, then tell me what is on it."),
        new("merge-conflict-followup", GroupAgents, "🧯", "PR has merge conflicts — resolve them",
            "PR #{pr} has merge conflicts — tell the responsible agent to resolve them against main and repost the PR; if it is unknown, a free agent may take it over."),

        new("loop-on-agent", GroupLoops, "🎯", "Set a goal loop on an agent",
            "Set a goal loop on {agent}: goal {text}, cap {n} turns, drive mode. Confirm the loop id when it is armed."),
        new("run-goal", GroupLoops, "🏛️", "Run a goal conversation",
            "arch, run a goal: {text} on {agent}. Declare the steps first (send → wait → verify), mark them as you go, cap {n}."),
        new("recurring-task", GroupLoops, "⏰", "Recurring tracking card",
            "Create a recurring tracking-only card for {agent}: {text} — it already runs by itself inside the agent's app; never send it anything."),
        new("repo-agent-request", GroupLoops, "📨", "Fulfil an approved repo-agent request",
            "Fulfil the approved request from {agent}: {text}. Drive the involved agents until it is done and report."),

        new("hub-files", GroupFiles, "📦", "Transfer a file through the hub file system",
            "Transfer {file} from {machine}'s hub file system to {machine} via the hub file system; confirm the size on arrival."),

        new("explain-concept", GroupAsk, "💡", "Explain: what are goal conversations?",
            "Explain: what are goal conversations and how do they differ from this conversation? One concept, short."),
        new("nudge", GroupAsk, "👉", "Nudge: continue / is it done?",
            "Continue from where you left off. Is it done? Ping it again and tell me the status in one line."),
    };

    private static readonly Dictionary<string, Seed> ById = Curated.ToDictionary(s => s.Id, StringComparer.Ordinal);

    /// <summary>The curated seed set alone (no examples document).</summary>
    public static List<PromptsService.Prompt> All() => Curated.Select(ToPrompt).ToList();

    /// <summary>The seed set for this harness: every curated seed, plus one converted prompt
    /// per Arch-examples category the curated set does not know (so a category the miner
    /// adds later still gets a prompt). The examples document is <c>GET /api/arch/examples</c>'s.</summary>
    public static List<PromptsService.Prompt> FromExamples(JsonNode? examples)
    {
        var seeds = All();
        var known = new HashSet<string>(seeds.Select(s => s.SeedId!), StringComparer.Ordinal);
        if (examples?["categories"] is JsonArray cats)
        {
            foreach (var c in cats.OfType<JsonObject>())
            {
                var id = c["id"]?.ToString();
                if (string.IsNullOrWhiteSpace(id) || known.Contains(id) || id == "other") continue;
                var template = c["template"]?.ToString();
                if (string.IsNullOrWhiteSpace(template)) continue;
                var text = ConvertTemplate(template);
                var tip = c["tip"]?.ToString();
                seeds.Add(new PromptsService.Prompt("", "🗒️", c["name"]?.ToString() ?? id, text, PromptsService.OwnerArch,
                    c["endsInGoal"]?.GetValue<bool>() == true ? GroupLoops : GroupAsk, tip, id));
                known.Add(id);
            }
        }
        return seeds;
    }

    private static PromptsService.Prompt ToPrompt(Seed s) =>
        new("", s.Emoji, s.Label, s.Text, PromptsService.OwnerArch, s.Group, null, s.Id);

    // "<machine>" → "{machine}", "<repo>" → "{agent}", "<id>" → "{task}", "<n>" → "{pr}", "<git URL>" → "{url}"; anything else → "{text}".
    private static readonly Regex Angle = new(@"<([^<>]{1,40})>", RegexOptions.Compiled);

    /// <summary>A mined template's <c>&lt;placeholders&gt;</c> as composer placeholders.</summary>
    public static string ConvertTemplate(string template) =>
        Angle.Replace(template, m =>
        {
            var k = m.Groups[1].Value.Trim().ToLowerInvariant();
            return "{" + (k switch
            {
                "machine" or "machine a" or "machine b" or "x" => "machine",
                "repo" or "repo a" or "repo b" or "agent" or "y" => "agent",
                "id" or "a" or "b" or "task" => "task",
                "n" or "pr" => "pr",
                "git url" or "url" => "url",
                "branch" => "branch",
                "file" or "file or folder" or "path" => "file",
                "interval" => "interval",
                _ => "text",
            }) + "}";
        });

    /// <summary>The hint ("how to phrase it") of a curated seed, read off the examples document
    /// when it is there; null otherwise.</summary>
    public static string? TipOf(JsonNode? examples, string seedId)
    {
        if (examples?["categories"] is not JsonArray cats) return null;
        return cats.OfType<JsonObject>().FirstOrDefault(c => c["id"]?.ToString() == seedId)?["tip"]?.ToString();
    }

    /// <summary>Seeds with their hints filled in from the examples document.</summary>
    public static List<PromptsService.Prompt> WithTips(List<PromptsService.Prompt> seeds, JsonNode? examples) =>
        seeds.Select(s => s.Hint is null && s.SeedId is not null && TipOf(examples, s.SeedId) is { } tip ? s with { Hint = tip } : s).ToList();

    public static bool IsCurated(string? seedId) => seedId is not null && ById.ContainsKey(seedId);
}
