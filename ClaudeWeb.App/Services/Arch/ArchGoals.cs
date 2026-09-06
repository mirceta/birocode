using ClaudeWeb.Services.Autopilot;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The pure half of goal-scoped arch conversations (openspec arch-goal-conversations):
/// which events a conversation is woken by, when it counts as busy, how a goal
/// conversation is named, and the board-side completion check. No harness state
/// here — the store keeps the goals, <see cref="ArchAgentService"/> binds the two.
///
/// The model: the Operator-facing conversation (the default, <c>@arch</c>) is for the
/// Operator and is never woken by repo events. Work that must be driven to completion
/// runs in a <b>goal conversation</b> that OWNS repos (managed keys) and board tasks for
/// as long as its goal loop runs. A repo turn, a loop event or a task status change wakes
/// only the conversation that owns that repo or task — an early wake inside its own
/// pacing (<see cref="ArchDrivenPolicy"/>). Events nobody owns go to the arch inbox.
/// </summary>
public static class ArchGoalRouting
{
    public const string Running = "running";
    public const string Done = "done";
    public const string Stopped = "stopped";
    public const string Capped = "capped";
    public const string Error = "error";
    /// <summary>The actor tag on the summary a finished goal posts to the default conversation.</summary>
    public const string ActorGoal = "goal";

    /// <summary>The managed keys whose events wake this conversation: a running goal's
    /// owned repos; with the legacy broadcast setting on, a goal-less conversation sees
    /// every managed key (the pre-goal behaviour); otherwise nothing.</summary>
    public static ISet<string> ScopeFor(ArchStateStore.ArchGoal? goal, bool legacyBroadcast, ISet<string> managed)
    {
        if (goal is { Running: true }) return new HashSet<string>(goal.Repos, StringComparer.Ordinal);
        return legacyBroadcast ? managed : new HashSet<string>(StringComparer.Ordinal);
    }

    /// <summary>The board tasks whose status changes wake this conversation.</summary>
    public static ISet<string> TasksFor(ArchStateStore.ArchGoal? goal) =>
        goal is { Running: true } ? new HashSet<string>(goal.Tasks, StringComparer.Ordinal) : new HashSet<string>(StringComparer.Ordinal);

    /// <summary>"busy: goal &lt;id&gt;" — the goal runs and its loop is armed. A goal whose
    /// loop stopped (cap, error, the Operator's Stop) is not busy: the conversation is
    /// available again and the goal is reconciled to the loop's outcome.</summary>
    public static bool IsBusy(ArchStateStore.ArchGoal? goal, LoopConfigStore.LoopState? loop) =>
        goal is { Running: true } && loop is { Active: true };

    /// <summary>The goal state a loop's terminal status means.</summary>
    public static string StateFor(string? loopStatus) => loopStatus switch
    {
        "done" => Done,
        "capped" => Capped,
        "error" => Error,
        _ => Stopped,
    };

    /// <summary>A fresh goal id: 8 hex, like a conversation suffix.</summary>
    public static string NewId() => Guid.NewGuid().ToString("N")[..8];

    /// <summary>The conversation name a goal opens under: "goal: …" clipped to the store's limit.</summary>
    public static string ConversationName(string goal)
    {
        var one = string.Join(' ', (goal ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(l => l.Trim()));
        return ArchStateStore.CleanName("goal: " + one, "goal");
    }

    /// <summary>The goal text the loop is armed with: the Operator's goal plus what the
    /// conversation owns, so every work prompt names its scope and its id.</summary>
    public static string LoopGoalText(string goal, string goalId, IReadOnlyList<string> repoLabels, IReadOnlyList<string> taskLabels)
    {
        var owns = repoLabels.Count > 0 ? string.Join(", ", repoLabels) : "no repos";
        var tasks = taskLabels.Count > 0 ? string.Join(", ", taskLabels) : "no board tasks";
        return $"{goal.Trim()}\n\n(arch goal {goalId}) This conversation owns: {owns}; board tasks: {tasks}. Work only on those.";
    }

    /// <summary>The line an unowned event leaves in the inbox.</summary>
    public static string InboxLine(string type, string name, string? detail) =>
        detail is null ? $"{name}: {type}" : $"{name}: {type} · {detail}";
}

/// <summary>
/// The kanban lifecycle as the completion check reads it (openspec
/// arch-goal-conversations). The board today knows <c>todo | doing | done</c>; the
/// lifecycle columns change (<c>assigned</c>, <c>pr-opened</c>, <c>pr-merged</c>) is
/// pending, so the order is declared here in full and unknown statuses rank below
/// everything — a task at <c>done</c> is past every floor, a task at <c>doing</c> is
/// short of <c>pr-opened</c>.
/// </summary>
public static class TaskLifecycle
{
    public const string PrOpened = "pr-opened";
    public const string PrMerged = "pr-merged";
    public static readonly string[] Order = { "todo", "assigned", "doing", PrOpened, PrMerged, "done" };

    public static int Rank(string? status) => status is null ? -1 : Array.IndexOf(Order, status);

    /// <summary>Whether <paramref name="status"/> is at or past <paramref name="floor"/>.</summary>
    public static bool IsAtLeast(string? status, string floor)
    {
        var r = Rank(status);
        return r >= 0 && r >= Rank(floor);
    }

    /// <summary>Null when every task is at or past the floor (pr-opened, or pr-merged when
    /// the goal requires the merge); else one sentence naming what is short.</summary>
    public static string? Blocker(IEnumerable<(string Id, string Title, string? Status)> tasks, bool requireMerged)
    {
        var floor = requireMerged ? PrMerged : PrOpened;
        var missing = tasks.Where(t => !IsAtLeast(t.Status, floor)).ToList();
        if (missing.Count == 0) return null;
        var names = string.Join("; ", missing.Take(6).Select(t => $"\"{t.Title}\" ({Short(t.Id)}: {t.Status ?? "?"})"));
        var more = missing.Count > 6 ? $" and {missing.Count - 6} more" : "";
        return $"the board still shows {missing.Count} owned task(s) short of {floor}: {names}{more}";
    }

    private static string Short(string id) => id.Length > 8 ? id[..8] : id;
}
