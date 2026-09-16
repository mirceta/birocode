using ClaudeWeb.Models;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Understanding;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec goal-app: the Goal app is the Understanding app's twin on one
/// pipeline keyed by kind — these pin the pure parts: the kinds, the goal prompt, the
/// turn-end rule, and the flag's default.</summary>
public class GoalAppTests
{
    [Fact]
    public void Kinds_are_distinct_and_resolvable_by_audit_feature()
    {
        Assert.Equal(2, AppBuildKind.All.Count);
        Assert.Equal(AppBuildKind.All.Count, AppBuildKind.All.Select(k => k.Key).Distinct().Count());
        Assert.Equal(AppBuildKind.All.Count, AppBuildKind.All.Select(k => k.Op).Distinct().Count());
        Assert.Equal(AppBuildKind.All.Count, AppBuildKind.All.Select(k => k.AuditFeature).Distinct().Count());
        Assert.Same(AppBuildKind.Understanding, AppBuildKind.ByAuditFeature("ask-for-understanding"));
        Assert.Same(AppBuildKind.Goal, AppBuildKind.ByAuditFeature("update-goal"));
        Assert.Null(AppBuildKind.ByAuditFeature("discover-local-apps"));
        Assert.Null(AppBuildKind.ByAuditFeature(null));
    }

    [Fact]
    public void Builders_declare_their_kind()
    {
        Assert.Same(AppBuildKind.Understanding, new UnderstandingAsk().Kind);
        Assert.Same(AppBuildKind.Goal, new GoalAsk().Kind);
    }

    [Fact]
    public void Goal_prompt_carries_every_decided_rule()
    {
        var p = GoalAsk.BuildPrompt(Path.GetTempPath());
        // Q6: the same convention doc, its Goal section.
        Assert.Contains("understanding-app-convention.md", p);
        Assert.Contains("The Goal app", p);
        // Q1/Q2: goal.json beside the app, with history that is never dropped.
        Assert.Contains("goal-app/goal.json", p);
        Assert.Contains("\"history\"", p);
        Assert.Contains("never drop history", p);
        // Q3: model judgement plus the authoritative marker.
        Assert.Contains("GOAL:", p);
        Assert.Contains("authoritative", p);
        Assert.Contains("we want to create", p);
        // Q4: an unchanged goal costs no file churn.
        Assert.Contains("GOAL UNCHANGED", p);
        Assert.Contains("touch NO files", p);
        // The write is scoped to the goal folder, like understanding-app/.
        Assert.Contains("Do not modify anything outside goal-app/", p);
        Assert.Contains("relative URLs only", p);
        // And it is NOT the understanding prompt.
        Assert.DoesNotContain("understanding-app/index.html", p);
    }

    [Fact]
    public void Understanding_prompt_is_unchanged_by_the_refactor()
    {
        var p = UnderstandingAsk.BuildPrompt(Path.GetTempPath());
        Assert.Contains("understanding-app/index.html", p);
        Assert.Contains("most recent assistant turn", p);
        Assert.Contains("Do not modify anything outside understanding-app/", p);
        Assert.DoesNotContain("goal-app", p);
    }

    private static RunSessionService.RunCompletedEvent Done(string lane = "builder", string status = "done", string? session = "abc123")
        => new("r1", lane, status, session);

    [Fact]
    public void Turn_end_runs_each_kind_by_its_own_flag()
    {
        Assert.Empty(AutoUnderstandingTrigger.KindsToRun(Done(), new RepositoryConfig()));
        Assert.Equal(new[] { AppBuildKind.Understanding }, AutoUnderstandingTrigger.KindsToRun(Done(), new RepositoryConfig { AutoUnderstanding = true }));
        Assert.Equal(new[] { AppBuildKind.Goal }, AutoUnderstandingTrigger.KindsToRun(Done(), new RepositoryConfig { AutoGoal = true }));
        Assert.Equal(new[] { AppBuildKind.Understanding, AppBuildKind.Goal },
            AutoUnderstandingTrigger.KindsToRun(Done(), new RepositoryConfig { AutoUnderstanding = true, AutoGoal = true }));
    }

    [Fact]
    public void Turn_end_conditions_are_the_same_for_both_kinds()
    {
        var both = new RepositoryConfig { AutoUnderstanding = true, AutoGoal = true };
        Assert.Empty(AutoUnderstandingTrigger.KindsToRun(Done(lane: "ask"), both));
        Assert.Empty(AutoUnderstandingTrigger.KindsToRun(Done(status: "error"), both));
        Assert.Empty(AutoUnderstandingTrigger.KindsToRun(Done(session: null), both));
        Assert.Empty(AutoUnderstandingTrigger.KindsToRun(Done(session: "  "), both));
        Assert.Empty(AutoUnderstandingTrigger.KindsToRun(Done(), null));
    }

    [Fact]
    public void Auto_goal_defaults_off_like_auto_understanding()
    {
        var r = new RepositoryConfig();
        Assert.False(r.AutoUnderstanding);
        Assert.False(r.AutoGoal);
    }

    [Fact]
    public void Registry_clone_carries_both_auto_flags()
    {
        // The resolver hands the controllers a CLONE; a clone that drops a flag reads
        // "off" right after it was set (found by the isolated e2e run).
        var src = new RepositoryConfig { Id = "r", Name = "n", Path = Path.GetTempPath(), AutoUnderstanding = true, AutoGoal = true };
        var c = ClaudeWeb.Services.Repositories.RepositoryRegistry.Clone(src);
        Assert.True(c.AutoUnderstanding);
        Assert.True(c.AutoGoal);
        Assert.False(ClaudeWeb.Services.Repositories.RepositoryRegistry.Clone(new RepositoryConfig { Id = "r", Name = "n", Path = Path.GetTempPath() }).AutoGoal);
    }

    [Fact]
    public void Jobs_registry_refuses_a_kind_with_no_builder()
    {
        // Registered with the understanding builder only: a goal run must fail loudly
        // at start, never silently no-op.
        var jobs = new UnderstandingJobs(new IConversationAppBuilder[] { new UnderstandingAsk() },
            new ClaudeWeb.Services.Events.RepoEventLog(), null!, new ClaudeWeb.Services.Logging.Logger());
        Assert.Throws<InvalidOperationException>(() => jobs.StartOrJoin(AppBuildKind.Goal, "r", "n", Path.GetTempPath(), "s", "a", "-"));
        Assert.Null(jobs.Get(AppBuildKind.Goal, "r"));
        Assert.Null(jobs.Get("r"));
    }
}
