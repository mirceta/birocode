namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// The pure rules of the policeman's LIFECYCLE (openspec kanban-policeman-conversation): the
/// interval and context-cap bounds, the rollover rule, the re-arm rule after the loop stops on
/// its own. No state, no I/O — <see cref="PolicemanLifecycle"/> applies these to the live loop.
/// </summary>
public static class PolicemanLifecycleRules
{
    public const int DefaultIntervalSeconds = 300;
    public const int MinIntervalSeconds = 60;
    public const int MaxIntervalSeconds = 24 * 3600;
    public const int DefaultContextCapTokens = 400_000;
    public const int MinContextCapTokens = 20_000;
    /// <summary>Fallback rollover: a session that has taken this many turns is rolled over even
    /// if no usage figure was ever reported (a CLI that reports none).</summary>
    public const int MaxTurnsPerSession = 400;
    /// <summary>The recipe store clamps a cap to 1..100; the tick re-arms the loop the moment it
    /// is capped, so the cap is a heartbeat, not an end.</summary>
    public const int LoopCap = 100;
    /// <summary>An errored turn re-arms only after this, so a broken CLI is not hammered.</summary>
    public static readonly TimeSpan ErrorCooldown = TimeSpan.FromMinutes(10);
    public const int MaxSessionsKept = 60;

    public static int CleanInterval(int? seconds) =>
        seconds is { } s && s > 0 ? Math.Clamp(s, MinIntervalSeconds, MaxIntervalSeconds) : DefaultIntervalSeconds;

    public static int CleanCap(int? tokens) =>
        tokens is { } t && t > 0 ? Math.Max(MinContextCapTokens, t) : DefaultContextCapTokens;

    /// <summary>Roll the session over when the last reported context is at or over the cap, or
    /// the session has taken the fallback number of turns.</summary>
    public static bool NeedsRollover(long? lastContextTokens, int capTokens, int turnsThisSession, int maxTurns) =>
        (lastContextTokens is { } t && capTokens > 0 && t >= capTokens) || (maxTurns > 0 && turnsThisSession >= maxTurns);

    /// <summary>Why an inactive loop should be re-armed on this tick, or null when it must not be:
    /// capped and done re-arm at once; an error after the cooldown; "escalate" (it asked the
    /// Operator something) and "stopped" (the Operator's own Stop) are honoured.</summary>
    public static string? ReArmReason(string? loopStatus, long lastTurnAt, long now) => loopStatus switch
    {
        null => "no loop armed",
        "capped" => "the loop cap was reached",
        "done" => "the loop resolved done (the sentinel must never be written)",
        "error" => now - lastTurnAt >= (long)ErrorCooldown.TotalMilliseconds ? "an errored turn, after the cooldown" : null,
        _ => null,
    };
}
