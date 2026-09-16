using System.Text.Json;
using ClaudeWeb.Services.Autopilot;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The pure half of the arch agent's loop tools (openspec arch-loop-tools):
/// <c>list_loops</c> / <c>start_loop</c> / <c>update_loop</c> / <c>stop_loop</c>. The
/// parameter set is the dock Loop panel's, no more: kind (suggestion · recipe · goal ·
/// queue), mode (suggest · drive), goal, recipe or raw prompt + sentinel, iteration cap,
/// the queue's dock tab + per-step verification, and the footer-clauses opt-in. One
/// loop slot per agent, so a loop's id IS the agent's repo id. Validation, the audit
/// summary, the list view and the wake-up lines live here so they are unit-testable
/// without a harness; the gates and the store calls live in <see cref="ArchAgentService"/>.
/// </summary>
public static class ArchLoopTools
{
    /// <summary>The Loop panel's parameter set, as the tools take it.</summary>
    public sealed record LoopParams(
        string? Kind = null, string? Mode = null, string? Goal = null, string? Prompt = null, string? Sentinel = null,
        int? MaxIterations = null, string? Recipe = null, string? TabId = null, bool? VerifyEnabled = null,
        bool? IncludeFooterClauses = null);

    public static readonly string[] Kinds = { LoopConfigStore.KindSuggestion, LoopConfigStore.KindRecipe, LoopConfigStore.KindGoal, LoopConfigStore.KindQueue };
    public static readonly string[] Modes = { LoopConfigStore.ModeSuggest, LoopConfigStore.ModeDrive };

    /// <summary>The kind a start means: the explicit one, else inferred from the
    /// parameters the way the Loop panel's tabs would (a goal → goal; a recipe or a
    /// prompt → recipe; a tab → queue). Null when nothing tells.</summary>
    public static string? InferKind(LoopParams p)
    {
        if (!string.IsNullOrWhiteSpace(p.Kind)) return p.Kind.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(p.Goal)) return LoopConfigStore.KindGoal;
        if (!string.IsNullOrWhiteSpace(p.Recipe) || !string.IsNullOrWhiteSpace(p.Prompt)) return LoopConfigStore.KindRecipe;
        if (!string.IsNullOrWhiteSpace(p.TabId)) return LoopConfigStore.KindQueue;
        return null;
    }

    /// <summary>The Loop panel's own arming rules, as one answer: null when the start
    /// may go, else the sentence the tool returns. Mirrors the loop endpoint: a goal
    /// needs a goal, a recipe needs a recipe or a prompt, a queue needs its tab (the
    /// caller resolves the repo's dock tab first), mode ∈ suggest | drive, cap 1–100.</summary>
    public static string? ValidateStart(LoopParams p)
    {
        var kind = InferKind(p);
        if (kind is null) return "kind is required: suggestion | recipe | goal | queue (or give a goal, a recipe/prompt, or a tabId)";
        if (!Kinds.Contains(kind, StringComparer.Ordinal)) return $"unknown loop kind \"{kind}\"; the Loop panel offers suggestion | recipe | goal | queue — no other kinds exist";
        if (ValidateCommon(p) is { } common) return common;
        switch (kind)
        {
            case LoopConfigStore.KindGoal:
                if (string.IsNullOrWhiteSpace(p.Goal)) return "a goal loop needs a goal (what done looks like)";
                break;
            case LoopConfigStore.KindRecipe:
                if (string.IsNullOrWhiteSpace(p.Recipe) && string.IsNullOrWhiteSpace(p.Prompt)) return "a recipe loop needs a recipe (its id or name from list_loops) or a raw prompt to resend";
                break;
            case LoopConfigStore.KindQueue:
                if (string.IsNullOrWhiteSpace(p.TabId)) return "a queue loop drains a dock tab's stash: the repo has no dock tab with queued prompts (pass tabId, or have the Operator stash prompts first)";
                break;
        }
        return null;
    }

    /// <summary>Mode and cap rules shared by start and update.</summary>
    public static string? ValidateCommon(LoopParams p)
    {
        if (!string.IsNullOrWhiteSpace(p.Mode) && !Modes.Contains(p.Mode.Trim().ToLowerInvariant(), StringComparer.Ordinal))
            return $"unknown mode \"{p.Mode}\"; suggest (pends the next prompt in the composer) or drive (sends it)";
        if (p.MaxIterations is int cap && (cap < 1 || cap > 100)) return "maxIterations must be 1–100 (the Loop panel's cap)";
        return null;
    }

    /// <summary>Update takes a subset: anything to change must be one of the panel's fields.</summary>
    public static string? ValidateUpdate(LoopParams p, bool rearm)
    {
        if (ValidateCommon(p) is { } common) return common;
        var any = rearm || p.Mode is not null || p.Goal is not null || p.Prompt is not null || p.Sentinel is not null || p.MaxIterations is not null
            || p.VerifyEnabled is not null || p.IncludeFooterClauses is not null;
        return any ? null : "nothing to change: give mode, goal, prompt, sentinel, maxIterations, verifyEnabled, includeFooterClauses, or rearm";
    }

    public static string CleanMode(string? mode) => string.Equals(mode?.Trim(), LoopConfigStore.ModeSuggest, StringComparison.OrdinalIgnoreCase) ? LoopConfigStore.ModeSuggest : LoopConfigStore.ModeDrive;

    /// <summary>The audit line of a start/update: who asked is the tool's actor; this is
    /// the what — kind, mode, cap and the text's head, never the whole prompt.</summary>
    public static string Summary(string action, string? kind, LoopParams p)
    {
        var parts = new List<string> { action, kind ?? "?" };
        if (!string.IsNullOrWhiteSpace(p.Mode)) parts.Add(p.Mode.Trim().ToLowerInvariant());
        if (p.MaxIterations is int cap) parts.Add($"cap {cap}");
        if (!string.IsNullOrWhiteSpace(p.Recipe)) parts.Add($"recipe \"{p.Recipe.Trim()}\"");
        if (!string.IsNullOrWhiteSpace(p.TabId)) parts.Add($"tab {p.TabId.Trim()}");
        if (p.VerifyEnabled is bool v) parts.Add(v ? "verify on" : "verify off");
        if (p.IncludeFooterClauses == true) parts.Add("footer clauses");
        var text = !string.IsNullOrWhiteSpace(p.Goal) ? p.Goal : p.Prompt;
        if (!string.IsNullOrWhiteSpace(text)) parts.Add($"\"{Head(text.Trim(), 80)}\"");
        return string.Join(" · ", parts);
    }

    public static string Head(string s, int max) => s.Length <= max ? s : s[..max] + "…";

    // ---- the list view ----------------------------------------------------------------

    /// <summary>The state word the Operator sees: armed (active, nothing fired yet),
    /// active (fired at least once), else the terminal status (escalate | capped |
    /// stopped | done | error).</summary>
    public static string StateWord(LoopConfigStore.LoopState s) =>
        s.Active ? (s.IterationsDone == 0 ? "armed" : "active") : s.Status;

    /// <summary>How the loop paces itself — there is no interval: a drive loop fires on
    /// the agent's next idle engine tick after its turn ends, a suggest loop only pends.</summary>
    public static string Pacing(LoopConfigStore.LoopState s) => s.Mode == LoopConfigStore.ModeSuggest
        ? "suggest: pends the next prompt in the agent's composer for the Operator; never sends"
        : s.Kind == LoopConfigStore.KindSuggestion
            ? "drive: sends the best recurring prompt when the agent is idle (engine tick ≤ 10 s), uncapped"
            : $"drive: sends when the agent is idle after each turn (engine tick ≤ 10 s), up to the cap{(s.Kind == LoopConfigStore.KindGoal ? "; verification prompt after LOOP_DONE" : s.Kind == LoopConfigStore.KindQueue ? "; one stashed prompt per turn" : "")}";

    public static string? NextFire(LoopConfigStore.LoopState s)
    {
        if (!s.Active) return null;
        return s.Mode == LoopConfigStore.ModeSuggest ? "pends only (suggest mode) — the Operator sends" : "when the agent is idle after its current turn (engine tick ≤ 10 s)";
    }

    /// <summary>One row of <c>list_loops</c>. <paramref name="queueRemaining"/> is the bound
    /// tab's live stash size (queue kind), <paramref name="now"/> stamps the ages.</summary>
    public static object View(LoopConfigStore.LoopState s, string repoId, string name, string machine, string? handle, int? queueRemaining, long now)
    {
        var text = s.Kind == LoopConfigStore.KindGoal ? s.Goal : s.Kind == LoopConfigStore.KindRecipe ? s.Prompt : null;
        return new
        {
            loopId = repoId, repoId, handle, machine, name,
            kind = s.Kind, mode = s.Mode, state = StateWord(s), status = s.Status, active = s.Active, phase = s.Phase,
            goal = s.Kind == LoopConfigStore.KindGoal ? s.Goal : null,
            prompt = text is null ? null : Head(text, 300),
            recipe = s.RecipeName, recipeId = s.RecipeId, sentinel = s.Kind == LoopConfigStore.KindSuggestion ? null : s.Sentinel,
            cap = s.MaxIterations, iterationsDone = s.IterationsDone, pacing = Pacing(s),
            lastFireAt = s.LastSentAt > 0 ? s.LastSentAt : (long?)null,
            lastFireAgo = s.LastSentAt > 0 ? ArchAgentService.Elapsed(s.LastSentAt, now) : null,
            nextFire = NextFire(s), armedAt = s.ArmedAt, createdBy = s.ArmedBy,
            stopReason = s.StopReason, stopDetail = s.StopDetail,
            queue = s.Kind == LoopConfigStore.KindQueue ? new { tabId = s.QueueTabId, remaining = queueRemaining, sent = s.QueueSent, verifyEnabled = s.VerifyEnabled } : null,
            includeFooterClauses = s.IncludeFooterClauses, pendingPrompt = s.PendingPrompt is null ? null : Head(s.PendingPrompt, 200),
        };
    }

    // ---- wake-up lines ------------------------------------------------------------------

    /// <summary>Loop transitions the arch is woken for: fired, escalated, capped, done,
    /// error, stopped. <c>loop.armed</c> is not one — the arch (or the Operator) just did it.</summary>
    public static bool IsWakeLoopEvent(string? type) =>
        type is "loop.fired" or "loop.escalated" or "loop.capped" or "loop.done" or "loop.error" or "loop.stopped";

    /// <summary>The "What happened" line of a loop event in the wake prompt.</summary>
    public static string WakeLine(string type, JsonElement d, string name, long at, long now)
    {
        string? S(string k) => d.ValueKind == JsonValueKind.Object && d.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        int I(string k) => d.ValueKind == JsonValueKind.Object && d.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : 0;
        var kind = S("kind") ?? "loop";
        var done = I("iterationsDone");
        var cap = I("maxIterations");
        var progress = cap > 0 ? $"{done}/{cap}" : $"{done}";
        var by = S("armedBy") is { } b && b != LoopConfigStore.ArmedByOperator ? $" (armed by {b})" : "";
        var ago = $"{ArchAgentService.Elapsed(at, now)} ago";
        var detail = S("detail");
        return type switch
        {
            "loop.fired" => $"- {name}: {kind} loop fired ({progress}){by} · {ago}",
            "loop.escalated" => $"- {name}: {kind} loop ESCALATED after {progress}{by}{(detail is null ? "" : $" — {Head(detail, 200)}")} · {ago}",
            "loop.capped" => $"- {name}: {kind} loop hit its cap ({progress}){by} · {ago}",
            "loop.done" => $"- {name}: {kind} loop done after {progress}{by}{(detail is null ? "" : $" — {Head(detail, 120)}")} · {ago}",
            "loop.error" => $"- {name}: {kind} loop errored after {progress}{by}{(detail is null ? "" : $" — {Head(detail, 200)}")} · {ago}",
            "loop.stopped" => $"- {name}: {kind} loop stopped ({progress}){by}{(detail is null ? "" : $" — {detail}")} · {ago}",
            _ => $"- {name}: {type} · {ago}",
        };
    }
}
