namespace ClaudeWeb.Services.Arch;

/// <summary>
/// What a conversation add-on (the policeman today; any standing management conversation
/// tomorrow) needs FROM the arch: its home, its session bookkeeping, sending a prompt into a
/// conversation, and the engine's default pacing. <see cref="ArchAgentService"/> implements it;
/// add-ons depend on this interface, never on the service.
/// </summary>
public interface IArchConversationHost
{
    void EnsureHome();
    /// <summary>The CLI session a conversation resumes (its loop's pin, else the recorded one), or null for a fresh one.</summary>
    string? ResolveSessionId(string conversationId);
    /// <summary>Forget the conversation's session so its next prompt starts a fresh CLI session.</summary>
    void ForgetSession(string conversationId);
    /// <summary>Send a prompt into a conversation now (busy when a turn is running).</summary>
    (bool Ok, string Error) Send(string conversationId, string text, string actor);
    /// <summary>The engine's shared quiet floor for driven loops.</summary>
    TimeSpan DefaultQuietFloor { get; }
    long Now();
}

/// <summary>
/// A conversation add-on hooked INTO the arch's turn lifecycle. The arch asks every hook, on every
/// engine tick and around every turn of every conversation, and each hook acts only on the
/// conversations it owns. This keeps the arch service ignorant of what the policeman is.
/// </summary>
public interface IArchConversationHook
{
    bool Owns(string? conversationId);
    /// <summary>Once per engine tick, before the conversations' loops are driven.</summary>
    void OnEngineTick();
    /// <summary>After a turn of an owned conversation ended and its session was recorded.</summary>
    void AfterTurn(string conversationId, string? sessionId);
    /// <summary>A chance to prefix a prompt about to be sent into an owned conversation.</summary>
    string DecorateSend(string conversationId, string text);
    /// <summary>The driven-loop quiet floor for an owned conversation, or null for the default.</summary>
    TimeSpan? QuietFloorFor(string conversationId);
}
