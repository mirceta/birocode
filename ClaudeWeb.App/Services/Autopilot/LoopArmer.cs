using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Dock;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// ONE way to arm, update and stop an agent's loop from a tool (openspec
/// repo-agent-harness-tools): the arming path the arch agent's <c>start_loop</c> /
/// <c>update_loop</c> / <c>stop_loop</c> used to carry inline in <see cref="ArchAgentService"/>,
/// extracted so a repo agent's <c>arm_my_loop</c> arms the very same way — the same
/// <see cref="ArchLoopTools"/> validation, the same <see cref="LoopConfigStore"/> calls, the
/// same queue-tab resolution and recipe lookup. Who armed it (<c>arch</c>, <c>arch@peer</c>,
/// <c>agent</c>) is the caller's word; the gates (autopilot gate, scope, claimed) stay with the
/// caller, as does the audit line and the log. Every outcome carries the sentence the tool
/// returns and the audit word, so the two callers cannot drift apart.
/// </summary>
public sealed class LoopArmer
{
    public sealed record Outcome(bool Ok, string Status, string Detail, LoopConfigStore.LoopState? State, string Audit, bool Rearmed = false);

    private readonly LoopConfigStore _loops;
    private readonly Func<bool> _autoAdvance;
    private readonly Func<string, IReadOnlyList<StashItem>?> _getStash;
    private readonly Func<string, string?> _tabWithStash;   // repoId → the dock tab whose stash a queue would drain
    private readonly Func<string, LoopRecipeStore.Recipe?> _findRecipe;

    /// <param name="loops">the loop store</param>
    /// <param name="autoAdvance">the autopilot config's AutoAdvance (a suggestion loop's default mode)</param>
    /// <param name="getStash">tabId → its stash (null = unknown tab)</param>
    /// <param name="tabWithStash">repoId → the repo's dock tab with a non-empty stash (dashboard first, then newest), or null</param>
    /// <param name="findRecipe">recipe id or name → the recipe</param>
    public LoopArmer(LoopConfigStore loops, Func<bool> autoAdvance, Func<string, IReadOnlyList<StashItem>?> getStash,
        Func<string, string?> tabWithStash, Func<string, LoopRecipeStore.Recipe?> findRecipe)
    {
        _loops = loops;
        _autoAdvance = autoAdvance;
        _getStash = getStash;
        _tabWithStash = tabWithStash;
        _findRecipe = findRecipe;
    }

    /// <summary>The dock tab a repo's queue loop drains when the caller named none.</summary>
    public static string? ResolveQueueTab(DockRegistry dock, string repoId)
    {
        var tab = dock.GetAll().Where(t => t.RepoId == repoId).OrderByDescending(t => t.Dashboard).ThenByDescending(t => t.CreatedAt).FirstOrDefault();
        return tab is not null && (dock.GetStash(tab.Id)?.Count ?? 0) > 0 ? tab.Id : null;
    }

    /// <summary>Arm a loop with the Loop panel's parameters. <paramref name="pin"/> is the
    /// conversation the driven kinds send into (the caller resolves it: the running session,
    /// the dock tab's, the newest transcript). <paramref name="startTool"/> only names the
    /// tool in sentences.</summary>
    public Outcome Start(string repoId, string repoName, ArchLoopTools.LoopParams p, string by, string? pin, string listTool = "list_loops")
    {
        var kind = ArchLoopTools.InferKind(p);
        // The queue kind drains a dock tab's stash: resolve the repo's dock when none is named.
        if (kind == LoopConfigStore.KindQueue && string.IsNullOrWhiteSpace(p.TabId) && _tabWithStash(repoId) is { } tabId)
            p = p with { TabId = tabId };
        if (ArchLoopTools.ValidateStart(p) is { } bad) return new Outcome(false, "error", bad + "; nothing was changed", null, "invalid");
        var summary = ArchLoopTools.Summary("start", kind, p);
        LoopConfigStore.LoopState s;
        switch (kind)
        {
            case LoopConfigStore.KindSuggestion:
                s = _loops.StartSuggestion(repoId, p.Mode ?? (_autoAdvance() ? LoopConfigStore.ModeDrive : LoopConfigStore.ModeSuggest), by);
                break;
            case LoopConfigStore.KindGoal:
                s = _loops.StartGoal(repoId, p.Goal!.Trim(), p.MaxIterations, p.Mode, pin, p.IncludeFooterClauses, by);
                break;
            case LoopConfigStore.KindQueue:
            {
                var stash = _getStash(p.TabId!.Trim());
                if (stash is null) return new Outcome(false, "error", $"unknown dock tab \"{p.TabId}\" on {repoName}; nothing was changed", null, "invalid");
                if (stash.Count == 0) return new Outcome(false, "error", $"{repoName}'s stash is empty — the Operator queues prompts before a queue loop can be armed; nothing was changed", null, "invalid");
                s = _loops.StartQueue(repoId, p.TabId.Trim(), p.VerifyEnabled, p.MaxIterations, p.Mode, pin, p.IncludeFooterClauses, by);
                break;
            }
            default:
            {
                if (!string.IsNullOrWhiteSpace(p.Recipe))
                {
                    var recipe = _findRecipe(p.Recipe);
                    if (recipe is null) return new Outcome(false, "error", $"unknown recipe \"{p.Recipe}\"; {listTool} lists the recipes (id + name); nothing was changed", null, "invalid");
                    s = _loops.Start(repoId, recipe.Prompt, recipe.Sentinel, p.MaxIterations ?? recipe.MaxIterations, recipe.Id, recipe.Name, p.Mode, pin, p.IncludeFooterClauses, by);
                }
                else s = _loops.Start(repoId, p.Prompt!.Trim(), p.Sentinel, p.MaxIterations, mode: p.Mode, sessionId: pin, includeFooterClauses: p.IncludeFooterClauses, armedBy: by);
                break;
            }
        }
        return new Outcome(true, "armed",
            $"{s.Kind} loop armed on {repoName} ({s.Mode}{(s.MaxIterations > 0 ? $", cap {s.MaxIterations}" : "")}); loopId {repoId} — the Operator sees it on the dock's Loop panel as armed by {by}",
            s, summary);
    }

    /// <summary>Change a loop's parameters in place, or re-arm it (a new goal, or <paramref name="rearm"/>).</summary>
    public Outcome Update(string repoId, string repoName, string? loopId, ArchLoopTools.LoopParams p, bool rearm, string by, Func<string?> pin, string startTool = "start_loop")
    {
        var cur = _loops.Get(repoId);
        if (cur is null) return new Outcome(false, "no-loop", $"{repoName} has no loop; {startTool} arms one", null, "no-loop");
        if (!string.IsNullOrWhiteSpace(loopId) && loopId.Trim() != repoId) return new Outcome(false, "error", $"loopId {loopId} is not {repoName}'s loop slot ({repoId}); one loop per agent", null, "");
        if (ArchLoopTools.ValidateUpdate(p, rearm) is { } bad) return new Outcome(false, "error", bad + "; nothing was changed", null, "invalid");
        var summary = ArchLoopTools.Summary(rearm ? "rearm" : "update", cur.Kind, p);
        // A new goal re-composes the prompts: that is an arm, not an edit (as in the panel).
        var needsArm = rearm || (cur.Kind == LoopConfigStore.KindGoal && !string.IsNullOrWhiteSpace(p.Goal) && p.Goal.Trim() != cur.Goal);
        LoopConfigStore.LoopState? s;
        if (needsArm)
        {
            var mode = p.Mode ?? cur.Mode;
            var cap = p.MaxIterations ?? (cur.MaxIterations > 0 ? cur.MaxIterations : null);
            var footer = p.IncludeFooterClauses ?? cur.IncludeFooterClauses;
            s = cur.Kind switch
            {
                LoopConfigStore.KindGoal => _loops.StartGoal(repoId, (p.Goal ?? cur.Goal ?? "").Trim(), cap, mode, cur.SessionId ?? pin(), footer, by),
                LoopConfigStore.KindQueue => cur.Active ? cur : (_loops.Resume(repoId) ?? cur),
                LoopConfigStore.KindSuggestion => _loops.StartSuggestion(repoId, mode, by),
                _ => _loops.Start(repoId, p.Prompt?.Trim() ?? cur.Prompt, p.Sentinel ?? cur.Sentinel, cap, cur.RecipeId, cur.RecipeName, mode, cur.SessionId ?? pin(), footer, by),
            };
            if (cur.Kind == LoopConfigStore.KindQueue && !cur.Active && s == cur)
                return new Outcome(false, "error", $"{repoName}'s queue loop cannot resume: its dock tab is gone or the stash is empty; nothing was changed", null, "invalid");
        }
        else
        {
            s = _loops.Update(repoId, p.Prompt?.Trim(), p.Sentinel, p.MaxIterations);
            if (!string.IsNullOrWhiteSpace(p.Mode)) s = _loops.SetMode(repoId, p.Mode);
        }
        return new Outcome(true, needsArm ? "rearmed" : "updated", $"{repoName}'s {cur.Kind} loop {(needsArm ? "re-armed" : "updated")} ({summary})", s, summary, needsArm);
    }

    /// <summary>Stop (never delete) the loop; the record stays for the panel.</summary>
    public Outcome Stop(string repoId, string repoName, string? loopId, string by)
    {
        var cur = _loops.Get(repoId);
        if (cur is null) return new Outcome(false, "no-loop", $"{repoName} has no loop to stop", null, "no-loop");
        if (!string.IsNullOrWhiteSpace(loopId) && loopId.Trim() != repoId) return new Outcome(false, "error", $"loopId {loopId} is not {repoName}'s loop slot ({repoId})", null, "");
        if (!cur.Active)
            return new Outcome(true, "already-stopped", $"{repoName}'s {cur.Kind} loop was not running ({cur.Status}); it stays on the panel as it is", cur, "already-stopped");
        var s = _loops.Stop(repoId, by)!;
        return new Outcome(true, "stopped", $"{repoName}'s {cur.Kind} loop stopped after {cur.IterationsDone} iteration(s); the record stays on the dock's Loop panel (the Operator can re-arm it there)",
            s, $"stopped {cur.Kind} after {cur.IterationsDone} iteration(s)");
    }
}
