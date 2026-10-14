using System.Text.Json.Nodes;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;

namespace ClaudeWeb.Services.Agents;

/// <summary>
/// The subagent tools of a repo agent (openspec repo-agent-subagents): <c>start_goal_conversation</c>,
/// <c>list_goal_conversations</c>, <c>stop_goal_conversation</c>, <c>message_goal_conversation</c> for the PARENT, and
/// <c>mark_step</c> / <c>edit_goal_plan</c> for the subagent itself (its identity rides on
/// its MCP URL: <c>?repo=X&amp;sub=Y</c>). Mirrors the arch's start_arch_goal / list_arch_goals /
/// stop_arch_goal / mark_step / edit_goal_plan.
/// </summary>
public sealed partial class RepoAgentToolbox
{
    private const string NoSubagents = "goal conversations are not available on this harness (no goal conversation service wired)";

    public ToolOutcome StartSubagent(string? repoId, string? callerSub, string? goal, JsonNode? steps, int? maxIterations, string? name, bool readOnly, string? model, bool concurrent = false)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Subagents is null) return new ToolOutcome(false, "unavailable", NoSubagents);
        var plan = ArchGoalPlans.ParseSteps(steps, _now());
        // The parent: the running session is the parent session; its dock tab is where the summary lands.
        var parentSession = env.RunningSession(repoId);
        var tab = OwnTab(repoId);
        var o = env.Subagents.Start(repoId, goal, plan.Count > 0 ? plan : null, maxIterations, name, readOnly, model, LoopConfigStore.ArmedByAgent, tab?.Id, parentSession ?? tab?.SessionId, callerSub, concurrent);
        if (!o.Ok) env.Audit?.Invoke("start_goal_conversation", repoId, env.Repo(repoId)?.Name ?? repoId, o.Status);
        return o;
    }

    public ToolOutcome ListSubagents(string? repoId, bool includeEnded)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Subagents is null) return new ToolOutcome(false, "unavailable", NoSubagents);
        var all = env.Subagents.Store.OfRepo(repoId);
        var shown = includeEnded ? all : all.Where(s => s.IsRunning).ToList();
        var running = all.Count(s => s.IsRunning);
        return new ToolOutcome(true, "ok", $"{all.Count} goal conversation(s), {running} running{(includeEnded ? "" : $" ({all.Count - running} ended, hidden)")}; at most {RepoSubagentService.MaxRunningPerRepo} run at once",
            new { subagents = shown.Select(env.Subagents.View).ToList(), running, total = all.Count });
    }

    public ToolOutcome StopSubagent(string? repoId, string? id)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Subagents is null) return new ToolOutcome(false, "unavailable", NoSubagents);
        var sub = env.Subagents.Find(id);
        if (sub is not null && sub.RepoId != repoId) return new ToolOutcome(false, "not-owner", $"goal conversation {sub.Id} belongs to another repo agent");
        return env.Subagents.Stop(id, LoopConfigStore.ArmedByAgent);
    }

    public ToolOutcome MessageSubagent(string? repoId, string? id, string? text)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Subagents is null) return new ToolOutcome(false, "unavailable", NoSubagents);
        var sub = env.Subagents.Find(id);
        if (sub is not null && sub.RepoId != repoId) return new ToolOutcome(false, "not-owner", $"goal conversation {sub.Id} belongs to another repo agent");
        return env.Subagents.Message(id, text, LoopConfigStore.ArmedByAgent);
    }

    public ToolOutcome MarkSubagentStep(string? repoId, string? callerSub, string? id, string? step, string? state, string? note, JsonNode? evidence, int? counter)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Subagents is null) return new ToolOutcome(false, "unavailable", NoSubagents);
        if (string.IsNullOrWhiteSpace(callerSub) && string.IsNullOrWhiteSpace(id))
            return new ToolOutcome(false, "error", "mark_step from a parent needs id (the goal conversation); a goal conversation marks its own plan without one");
        return env.Subagents.MarkStep(id, step, state, note, ArchGoalPlans.ParseEvidence(evidence), counter, string.IsNullOrWhiteSpace(callerSub) ? "parent" : $"goal conversation {callerSub}", string.IsNullOrWhiteSpace(callerSub) ? null : callerSub);
    }

    public ToolOutcome EditSubagentPlan(string? repoId, string? callerSub, string? id, string? action, string? step, string? title, string? done, string? kind, int? to, JsonNode? steps)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Subagents is null) return new ToolOutcome(false, "unavailable", NoSubagents);
        if (string.IsNullOrWhiteSpace(callerSub) && string.IsNullOrWhiteSpace(id))
            return new ToolOutcome(false, "error", "edit_goal_plan from a parent needs id (the goal conversation); a goal conversation edits its own plan without one");
        var plan = ArchGoalPlans.ParseSteps(steps, _now());
        return env.Subagents.EditPlan(id, action, step, title, done, kind, to, plan.Count > 0 ? plan : null, string.IsNullOrWhiteSpace(callerSub) ? "parent" : $"goal conversation {callerSub}", string.IsNullOrWhiteSpace(callerSub) ? null : callerSub);
    }
}
