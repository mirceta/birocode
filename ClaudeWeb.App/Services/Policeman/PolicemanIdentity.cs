namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// WHO the policeman is: the arch agent in one reserved sibling conversation, driven forever by
/// the recipe-loop engine with one fixed prompt. These are the names everything else agrees on —
/// the conversation key, its display name, the actor tag on a "check now" prompt, the loop's
/// sentinel (a tripwire the prompt forbids, so the loop never resolves "done") and the recipe
/// name the loops lane shows. Nothing here does anything; it only says who.
/// </summary>
public static class PolicemanIdentity
{
    public const string ConversationId = "@arch:policeman";
    public const string ConversationName = "👮 Policeman";
    /// <summary>The actor tag on a "check now" prompt the Operator pressed.</summary>
    public const string Actor = "policeman";
    /// <summary>The recipe loop's sentinel: the prompt tells the policeman never to write it, so
    /// the loop never resolves "done". (A recipe loop needs one; this one is a tripwire.)</summary>
    public const string Sentinel = "POLICEMAN_RETIRED";
    public const string RecipeName = "policeman: keep the Kanban honest";

    public static bool IsPoliceman(string? conversationId) =>
        string.Equals(conversationId, ConversationId, StringComparison.Ordinal);
}
