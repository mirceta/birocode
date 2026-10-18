using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Prompts;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec arch-goal-templates (fleet task 545b9548): goal templates in the arch's prompt library — validation,
/// add / update keeping id and uses, duplicate, the migration of the cached prompt ccf3ee7d, and that an old store
/// (no template fields) still loads.</summary>
public class GoalTemplatesTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-tpl-" + Guid.NewGuid().ToString("N"));
    public GoalTemplatesTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, true); } catch { } }

    private static PromptsService.TemplateDraft Draft(string label = "Ship a feature", params PromptsService.TemplateStep[] steps) => new(
        null, label, null, "{agent} ships {feature} on {branch}.",
        new[] { new PromptsService.TemplateInput("agent", "agent"), new PromptsService.TemplateInput("feature", "text", "what to build"), new PromptsService.TemplateInput("branch", "branch") },
        steps.Length > 0 ? steps : new[] { new PromptsService.TemplateStep("Brief {agent}: build {feature}", "closing line DONE", "send"), new PromptsService.TemplateStep("Verify the PR", null, "VERIFY") },
        40, "feat/x", "4ccefa45", null);

    [Fact]
    public void A_template_is_validated_cleaned_and_stored_as_a_goal_template_entry()
    {
        var svc = new PromptsService(new Logger(), _dir);
        var (t, error) = svc.AddTemplate(Draft());
        Assert.Equal("", error);
        Assert.NotNull(t);
        Assert.Equal(PromptsService.KindGoalTemplate, t!.Kind);
        Assert.Equal("arch", t.Owner);
        Assert.Equal(t.Purpose, t.Text);                       // search and the arch's list tool still see it
        Assert.Equal(new[] { "send", "verify" }, t.Steps!.Select(s => s.Kind));
        Assert.Equal(3, t.Inputs!.Count);
        Assert.Equal(40, t.MaxIterations);
        Assert.Equal("4ccefa45", t.SourceGoalId);
        Assert.Equal("Loops, goals & recurring", t.Category);
        Assert.Contains(svc.List(PromptsService.OwnerArch), p => p.Id == t.Id);
    }

    [Theory]
    [InlineData("", "purpose", "a template needs a name")]
    [InlineData("x", "", "a template needs a purpose")]
    public void Missing_name_or_purpose_is_refused(string label, string purpose, string why)
    {
        var d = Draft() with { Label = label, Purpose = purpose };
        var (t, error) = new PromptsService(new Logger(), _dir).AddTemplate(d);
        Assert.Null(t);
        Assert.StartsWith(why, error);
    }

    [Fact]
    public void Steps_and_inputs_are_checked()
    {
        var svc = new PromptsService(new Logger(), _dir);
        Assert.StartsWith("a template needs at least one step", svc.AddTemplate(Draft() with { Steps = new[] { new PromptsService.TemplateStep("  ") } }).Error);
        Assert.Contains("unknown type", svc.AddTemplate(Draft() with { Inputs = new[] { new PromptsService.TemplateInput("agent", "person") } }).Error);
        Assert.Contains("listed twice", svc.AddTemplate(Draft() with { Inputs = new[] { new PromptsService.TemplateInput("a", "text"), new PromptsService.TemplateInput("A", "text") } }).Error);
        Assert.Contains("lowercase", svc.AddTemplate(Draft() with { Inputs = new[] { new PromptsService.TemplateInput("my input", "text") } }).Error);
    }

    [Fact]
    public void Update_keeps_id_uses_and_creation_and_duplicate_copies_the_plan()
    {
        var svc = new PromptsService(new Logger(), _dir);
        var t = svc.AddTemplate(Draft()).Template!;
        svc.MarkUsed(t.Id);
        var (up, error) = svc.UpdateTemplate(t.Id, Draft("Ship a feature, v2", new PromptsService.TemplateStep("Only step", "x", "send")));
        Assert.Equal("", error);
        Assert.Equal(t.Id, up!.Id);
        Assert.Equal(1, up.Uses);
        Assert.Equal(t.CreatedAt, up.CreatedAt);
        Assert.Single(up.Steps!);
        Assert.Equal("unknown template id", svc.UpdateTemplate("nope", Draft()).Error);
        var copy = svc.Duplicate(t.Id)!;
        Assert.Equal(PromptsService.KindGoalTemplate, copy.Kind);
        Assert.Single(copy.Steps!);
        Assert.Equal(0, copy.Uses);
        var again = new PromptsService(new Logger(), _dir);                       // persisted with the template fields
        Assert.Equal("Only step", again.Find(t.Id)!.Steps![0].Title);
    }

    [Fact]
    public void The_cached_prompt_ccf3ee7d_is_migrated_in_place_into_the_first_goal_template()
    {
        var legacy = new
        {
            Prompts = new object[]
            {
                new { Id = "ccf3ee7d1f4347e88d34b475643ccca5", Emoji = "🧪", Label = "Agentic app goal: a repo agent builds its own harness app",
                    Text = "arch, run a goal on {agent}: it builds its own agentic app … Cap {n}.", Owner = "arch", Category = "Loops, goals & recurring", Hint = "h", Uses = 3, CreatedAt = 123L },
                new { Id = "other", Emoji = "💬", Label = "plain", Text = "a plain prompt", Owner = "arch" },
            },
        };
        File.WriteAllText(Path.Combine(_dir, "prompts.json"), JsonSerializer.Serialize(legacy));
        var svc = new PromptsService(new Logger(), _dir);
        var t = svc.Find("ccf3ee7d1f4347e88d34b475643ccca5")!;
        Assert.Equal(PromptsService.KindGoalTemplate, t.Kind);
        Assert.Equal(3, t.Uses);                                                  // same entry, same usage
        Assert.Equal(123L, t.CreatedAt);
        Assert.Equal(7, t.Steps!.Count);
        Assert.Equal(new[] { "agent", "purpose", "examples", "branch", "n" }, t.Inputs!.Select(i => i.Name));
        Assert.Equal("d750eceb", t.SourceGoalId);
        Assert.Equal("wait", t.Steps[0].Kind);
        Assert.Contains("TASK PR", t.Steps[^1].Done);
        Assert.Null(svc.Find("other")!.Kind);                                     // a plain prompt stays a prompt
        var again = new PromptsService(new Logger(), _dir);                       // idempotent
        Assert.Equal(7, again.Find(t.Id)!.Steps!.Count);
    }
}
