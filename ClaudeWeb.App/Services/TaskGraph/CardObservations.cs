namespace ClaudeWeb.Services.TaskGraph;

/// <summary>
/// What the policeman READ in an assignee's conversation (openspec policeman-observes-agents):
/// a fixed vocabulary, so a card's "Agent" section always says the same thing for the same
/// finding and the Operator never meets a made-up label. An observation is the policeman's
/// reading of the agent's own words — not a fact about git or GitHub (that is the Board
/// check) — and it always carries who read it, when, and in which policeman session.
/// </summary>
public static class CardObservations
{
    public const string Working = "working";
    public const string WaitingReview = "waiting-review";
    public const string AskedQuestion = "asked-question";
    public const string Blocked = "blocked";
    public const string ClaimsDone = "claims-done";
    public const string Idle = "idle";
    public const string Errored = "errored";

    /// <summary>state → (word, meaning) — the same words the card and the explainer use.</summary>
    public static readonly IReadOnlyDictionary<string, (string Word, string Meaning)> States = new Dictionary<string, (string, string)>(StringComparer.Ordinal)
    {
        [Working] = ("Working", "the agent is actively on it"),
        [WaitingReview] = ("Waiting for review", "its work is up as a pull request; nothing more from the agent until someone reviews"),
        [AskedQuestion] = ("Asked a question", "the agent asked something and nobody has answered"),
        [Blocked] = ("Blocked", "the agent says it cannot proceed"),
        [ClaimsDone] = ("Says done", "the agent says it finished, but the facts do not show it yet"),
        [Idle] = ("Idle", "nothing has happened in its conversation"),
        [Errored] = ("Errored", "the agent's last turn failed"),
    };

    public static bool IsState(string? s) => s is not null && States.ContainsKey(s);

    public static string StateList => string.Join(" | ", States.Keys);

    public const int MaxSummary = 300;

    /// <summary>The states that mean "a human should look": the policeman flags these when
    /// they persist past the window.</summary>
    public static bool NeedsAttention(string? s) => s is AskedQuestion or Blocked or Errored;
}
