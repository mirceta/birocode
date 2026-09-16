namespace ClaudeWeb.Services.TaskGraph;

/// <summary>
/// Whose card is it (openspec kanban-external-owner)? Two related but distinct states take
/// a card out of the harness's hands, and every automatic actor — the verifier, the
/// policeman (mechanical and conversational), the arch — asks this ONE place before acting:
///
///   manual   — the OPERATOR handles the card by hand, directly with the repo agent. Still
///              our domain: the Operator's card, driven without the arch.
///   external — a DIFFERENT human developer owns the card entirely (<c>ExternalOwner</c>
///              names them). Out of our domain: we have no authority over it, so nothing is
///              dispatched, verified, moved, judged, observed or flagged, and it is never
///              "stuck", "dishonest" or "needs human" — it is not ours to judge.
///
/// External wins when both are set (another person's card is theirs whatever else it says).
/// Both are cleared from the card; clearing hands it back to the harness.
/// </summary>
public static class CardDomain
{
    public const string ExternalState = "external";
    public const string ManualState = "manual";

    /// <summary>A free-text name; long enough for "Jane Doe (Acme, contractor)".</summary>
    public const int MaxOwner = 120;

    public static bool IsExternal(TaskGraphService.Node n) => !string.IsNullOrWhiteSpace(n.ExternalOwner);

    /// <summary>Not the harness's to act on: manual or externally owned.</summary>
    public static bool IsHandsOff(TaskGraphService.Node n) => n.Manual || IsExternal(n);

    /// <summary><c>external</c> | <c>manual</c> | null — the state a refusal or a verdict
    /// reports; external wins when both are set.</summary>
    public static string? HandsOffStatus(TaskGraphService.Node n) => IsExternal(n) ? ExternalState : n.Manual ? ManualState : null;

    /// <summary>Why the card is left alone, in one line — the same words on the board note,
    /// the verdict reason and every tool refusal. Null when the card is ours.</summary>
    public static string? HandsOffReason(TaskGraphService.Node n) =>
        IsExternal(n) ? $"owned by {n.ExternalOwner} (external) — out of our domain, not ours to judge"
        : n.Manual ? "manual — the Operator handles it directly"
        : null;

    /// <summary>The refusal a tool answers on a hands-off card: the status (<c>external</c> /
    /// <c>manual</c>) and a message ending in <paramref name="consequence"/> ("the card was
    /// not changed", "nothing was sent"). Null when the card is ours.</summary>
    public static (string Status, string Message)? Refusal(TaskGraphService.Node n, string consequence)
    {
        var status = HandsOffStatus(n);
        if (status is null) return null;
        var cref = TaskGraphService.CardRef(n.Id);
        return status == ExternalState
            ? (status, $"task {cref} \"{n.Title}\" is owned by {n.ExternalOwner} (external) — out of our domain, we have no authority over it; {consequence}")
            : (status, $"task {cref} is manual — the Operator handles it directly; {consequence}");
    }

    /// <summary>A usable owner name (trimmed, capped) or null for blank.</summary>
    public static string? CleanOwner(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var t = name.Trim();
        return t.Length > MaxOwner ? t[..MaxOwner] : t;
    }
}
