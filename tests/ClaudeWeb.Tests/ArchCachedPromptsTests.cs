using System.Text.Json.Nodes;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Prompts;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Arch cached prompts (openspec arch-custom-prompts, fleet task ebc91192): the one
/// prompt library carries an owner — the repo agents' prompts stay owner-less and untouched,
/// the arch's live under "arch" with category / hint / seed id / edited; seeding from the Arch
/// examples adds only the missing categories and never overwrites an edit; reorder and
/// duplicate work per owner; the seed table has a placeholder prompt for every mined category;
/// the tools are in the catalogue and the role prompt teaches them.</summary>
public sealed class ArchCachedPromptsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-archprompts-" + Guid.NewGuid().ToString("N"));

    public ArchCachedPromptsTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    [Fact]
    public void Owners_are_separate_and_the_repo_agents_library_is_what_it_always_was()
    {
        var svc = new PromptsService(new Logger(), _dir);
        var chat = svc.Add("🚀", "kickoff", "start the feature")!;
        var arch = svc.Add("👀", "free agents", "Which agents are free right now?", PromptsService.OwnerArch, ArchPromptSeeds.GroupAgents, "name the repo family")!;
        Assert.Null(chat.Owner);
        Assert.Equal("arch", arch.Owner);
        Assert.Equal(ArchPromptSeeds.GroupAgents, arch.Category);
        Assert.Equal("name the repo family", arch.Hint);
        Assert.Single(svc.List());                 // the old call: chat prompts only
        Assert.Single(svc.List(PromptsService.OwnerArch));
        Assert.Equal(chat.Id, svc.List()[0].Id);
        // The old four-argument Update still works and keeps the owner.
        var up = svc.Update(arch.Id, "👀", "free agents?", "Which agents are free?")!;
        Assert.Equal("arch", up.Owner);
        Assert.False(up.Edited);                   // not seeded → no edited flag
        // Persists with the new fields; an old file (no owner) loads as chat prompts.
        var again = new PromptsService(new Logger(), _dir);
        Assert.Equal("Which agents are free?", again.List(PromptsService.OwnerArch)[0].Text);
        Assert.Single(again.List());
    }

    [Fact]
    public void Seeding_adds_missing_categories_only_and_an_edited_seed_survives_a_reseed()
    {
        var svc = new PromptsService(new Logger(), _dir);
        var seeds = ArchPromptSeeds.All();
        var (added, total) = svc.Seed(PromptsService.OwnerArch, seeds);
        Assert.Equal(seeds.Count, added);
        Assert.Equal(seeds.Count, total);
        Assert.All(svc.List(PromptsService.OwnerArch), p => { Assert.NotNull(p.SeedId); Assert.False(p.Edited); Assert.Equal("arch", p.Owner); });
        // Edit one, delete one, add a custom one.
        var hub = svc.List(PromptsService.OwnerArch).First(p => p.SeedId == "redeploy-hub");
        var edited = svc.Update(hub.Id, hub.Emoji, hub.Label, "Pull main and redeploy HERE only, then ping me.")!;
        Assert.True(edited.Edited);
        var fleet = svc.List(PromptsService.OwnerArch).First(p => p.SeedId == "redeploy-fleet");
        Assert.True(svc.Delete(fleet.Id));
        var custom = svc.Add("✨", "mine", "custom text", PromptsService.OwnerArch, ArchPromptSeeds.GroupAsk)!;
        Assert.Null(custom.SeedId);
        // Re-seed: only the deleted category comes back; the edit stands; the custom one stays.
        var (added2, total2) = svc.Seed(PromptsService.OwnerArch, seeds);
        Assert.Equal(1, added2);
        Assert.Equal(seeds.Count + 1, total2);
        var list = svc.List(PromptsService.OwnerArch);
        Assert.Equal("Pull main and redeploy HERE only, then ping me.", list.First(p => p.SeedId == "redeploy-hub").Text);
        Assert.Contains(list, p => p.SeedId == "redeploy-fleet");
        Assert.Contains(list, p => p.Id == custom.Id);
        // Seeding never touches the repo agents' library.
        Assert.Empty(svc.List());
    }

    [Fact]
    public void Reorder_and_duplicate_stay_within_the_owner()
    {
        var svc = new PromptsService(new Logger(), _dir);
        var c1 = svc.Add("a", "c1", "chat one")!;
        var a1 = svc.Add("1", "a1", "arch one", PromptsService.OwnerArch)!;
        var a2 = svc.Add("2", "a2", "arch two", PromptsService.OwnerArch)!;
        var a3 = svc.Add("3", "a3", "arch three", PromptsService.OwnerArch)!;
        var reordered = svc.Reorder(PromptsService.OwnerArch, new[] { a3.Id, "nope", a1.Id });
        Assert.Equal(new[] { a3.Id, a1.Id, a2.Id }, reordered.Select(p => p.Id).ToArray());   // unknown ignored, the rest appended
        Assert.Equal(new[] { a3.Id, a1.Id, a2.Id }, svc.List(PromptsService.OwnerArch).Select(p => p.Id).ToArray());
        Assert.Equal(c1.Id, svc.List()[0].Id);
        var copy = svc.Duplicate(a1.Id)!;
        Assert.Equal("a1 (copy)", copy.Label);
        Assert.Equal("arch one", copy.Text);
        Assert.Equal("arch", copy.Owner);
        Assert.Null(copy.SeedId);
        Assert.Equal(new[] { a3.Id, a1.Id, copy.Id, a2.Id }, svc.List(PromptsService.OwnerArch).Select(p => p.Id).ToArray());
        Assert.Null(svc.Duplicate("missing"));
        Assert.Single(svc.List());
    }

    [Fact]
    public void The_seed_table_covers_every_mined_category_with_placeholder_prompts_and_converts_unknown_templates()
    {
        var all = ArchPromptSeeds.All();
        Assert.True(all.Count >= 20);
        Assert.All(all, s => { Assert.Equal("arch", s.Owner); Assert.NotNull(s.SeedId); Assert.Contains(s.Category!, ArchPromptSeeds.Groups); Assert.False(string.IsNullOrWhiteSpace(s.Label)); });
        Assert.Equal(all.Count, all.Select(s => s.SeedId).Distinct().Count());
        // The brief's phrasings are there, with chips.
        Assert.Contains(all, s => s.SeedId == "redeploy-hub" && s.Text.Contains("this computer only"));
        Assert.Contains(all, s => s.SeedId == "redeploy-fleet" && s.Text.Contains("{machine}"));
        Assert.Contains(all, s => s.SeedId == "delegate-feature-task" && s.Text.Contains("{task}") && s.Text.Contains("no merge", StringComparison.OrdinalIgnoreCase) == false && s.Text.Contains("Do not merge"));
        Assert.Contains(all, s => s.SeedId == "tracking-card" && s.Text.Contains("{agent}") && s.Text.Contains("Do not contact"));
        Assert.Contains(all, s => s.SeedId == "card-status-fix" && s.Text.Contains("{pr}"));
        Assert.Contains(all, s => s.SeedId == "branch-handover" && s.Text.Contains("{branch}"));
        Assert.Contains(all, s => s.SeedId == "provision-repo-agent" && s.Text.Contains("{url}"));
        Assert.Contains(all, s => s.SeedId == "agents-status" && s.Text.StartsWith("Which agents are free"));
        Assert.Contains(all, s => s.SeedId == "run-goal" && s.Text.Contains("{agent}"));
        Assert.Contains(all, s => s.SeedId == "explain-concept" && s.Text.Contains("goal conversations"));
        // Every category in the committed categories file has a seed (curated or converted).
        var catsPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "management", "arch-example-categories.json"));
        if (File.Exists(catsPath))
        {
            var ids = JsonNode.Parse(File.ReadAllText(catsPath))!["categories"]!.AsArray().Select(c => c!["id"]!.ToString()).Where(id => id != "other").ToList();
            var seeded = new HashSet<string>(all.Select(s => s.SeedId!));
            Assert.All(ids, id => Assert.Contains(id, seeded));
        }
        // An unknown category from the examples document is converted from its template.
        var doc = JsonNode.Parse("""{"source":"mined","categories":[{"id":"new-thing","name":"New thing","template":"Do <what> on <machine>'s <repo> for task <id> and PR #<n> from <git URL> on branch <branch>","tip":"say it plainly","endsInGoal":true},{"id":"redeploy-hub","tip":"Say this computer only"},{"id":"other","template":"x"}]}""");
        var fromDoc = ArchPromptSeeds.WithTips(ArchPromptSeeds.FromExamples(doc), doc);
        var converted = fromDoc.First(s => s.SeedId == "new-thing");
        Assert.Equal("Do {text} on {machine}'s {agent} for task {task} and PR #{pr} from {url} on branch {branch}", converted.Text);
        Assert.Equal(ArchPromptSeeds.GroupLoops, converted.Category);
        Assert.Equal("say it plainly", converted.Hint);
        Assert.Equal("Say this computer only", fromDoc.First(s => s.SeedId == "redeploy-hub").Hint);
        Assert.DoesNotContain(fromDoc, s => s.SeedId == "other");
        Assert.Equal(all.Count + 1, fromDoc.Count);
        Assert.Equal(all.Count, ArchPromptSeeds.FromExamples(null).Count);
    }

    [Fact]
    public void The_cached_prompt_tools_are_in_the_catalogue_and_the_role_prompt_teaches_the_ask_rule()
    {
        var tools = ArchMcpServer.ToolsList();
        var byName = tools.ToDictionary(t => t!["name"]!.GetValue<string>(), t => t!);
        Assert.True(byName.ContainsKey("cache_prompt"));
        Assert.True(byName.ContainsKey("list_cached_prompts"));
        Assert.True(byName.ContainsKey("remove_cached_prompt"));
        Assert.Equal(new[] { "label", "text" }, byName["cache_prompt"]["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()).ToArray());
        Assert.Contains("ONLY when the Operator asks", byName["cache_prompt"]["description"]!.GetValue<string>());
        Assert.Contains("{machine}", byName["cache_prompt"]["description"]!.GetValue<string>());
        Assert.Equal(new[] { "id" }, byName["remove_cached_prompt"]["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()).ToArray());
        var role = ArchAgentService.RolePrompt();
        Assert.Equal("<!-- arch-role v18 -->", ArchAgentService.RoleVersionMarker);
        Assert.Contains("## Cached prompts", role);
        Assert.Contains("cache_prompt(label, text, category, hint)", role);
        Assert.Contains("Never cache or remove on your own initiative", role);
    }
}
