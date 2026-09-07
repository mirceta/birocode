using ClaudeWeb.Services.Autopilot;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The pure half of goal conversations (openspec arch-goal-conversations). The model is
/// deliberately small: repo agents are passive — they answer when asked and never call
/// anyone. A <b>goal conversation</b> is the arch agent on a timer: its goal loop re-sends
/// the goal every quiet floor, and on each turn the arch checks its agents itself
/// (<c>list_agents</c>, <c>read_transcript</c>), sees who is still running and who said
/// something new, and acts. It ends when the arch says the goal is finished and its one
/// verification turn agrees. The Operator-facing conversation is a plain chat: nothing
/// arrives in it on its own except a finished goal's summary. There is no event routing.
/// </summary>
public static class ArchGoals
{
    public const string Running = "running";
    public const string Done = "done";
    public const string Stopped = "stopped";
    public const string Capped = "capped";
    public const string Error = "error";
    /// <summary>The actor tag on the summary a finished goal posts to the default conversation.</summary>
    public const string ActorGoal = "goal";

    /// <summary>"busy: goal &lt;id&gt;" — the goal runs and its loop is armed. A goal whose loop
    /// stopped (cap, error, the Operator's Stop) is not busy: the conversation is available
    /// again and the goal is reconciled to the loop's outcome.</summary>
    public static bool IsBusy(ArchStateStore.ArchGoal? goal, LoopConfigStore.LoopState? loop) =>
        goal is { Running: true } && loop is { Active: true };

    /// <summary>Whether a conversation may take repo wake-ups, i.e. a standing wake loop.
    /// The Operator-facing (default) conversation never does (openspec arch-default-no-wakes):
    /// it is a plain chat — nothing arrives in it on its own except a finished goal's
    /// summary. A sibling conversation keeps its opt-in standing wake loop.</summary>
    public static bool TakesRepoWakes(string? conversationId) =>
        !string.Equals(ArchAgentService.KeyOrDefault(conversationId), ArchStateStore.DefaultConversationId, StringComparison.Ordinal);

    /// <summary>Why arming a wake loop on the default conversation is refused.</summary>
    public const string NoWakeLoopReason = "the Operator-facing conversation takes no wake loop: it is a plain chat that repo agents never wake. Arm a standing wake loop on a sibling conversation, or start a goal";

    /// <summary>A goal conversation polls on its own clock: it is never woken by a repo
    /// agent's turn. The (opt-in) standing wake loop of a goal-less SIBLING conversation is
    /// the only thing that still reads the feed; the default conversation never does
    /// (<see cref="TakesRepoWakes"/>).</summary>
    public static bool PollsOnly(ArchStateStore.ArchGoal? goal) => goal is { Running: true };

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

    /// <summary>The goal text the loop is armed with: the Operator's goal plus the agents and
    /// tasks the conversation drives, so every work prompt names its scope and its id.</summary>
    public static string LoopGoalText(string goal, string goalId, IReadOnlyList<string> repoLabels, IReadOnlyList<string> taskLabels)
    {
        var owns = repoLabels.Count > 0 ? string.Join(", ", repoLabels) : "no repos";
        var tasks = taskLabels.Count > 0 ? string.Join(", ", taskLabels) : "no board tasks";
        return $"{goal.Trim()}\n\n(arch goal {goalId}) This conversation drives: {owns}; board tasks: {tasks}. Work only on those. Nobody calls you: each turn, check them yourself (list_agents, read_transcript, list_tasks) and act.";
    }
}
