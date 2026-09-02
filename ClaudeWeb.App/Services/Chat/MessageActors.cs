using ClaudeWeb.Services.Autopilot;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// Provenance for transcript reloads (openspec: add-arch-agent, chat delta): the
/// CLI's own transcript has no notion of WHO typed a user message, so a reload
/// would lose the actor tag the live stream carried. The autopilot audit log is
/// the durable record of every non-human send (loop and arch), keyed by repo and
/// exact text; matching a user message against it restores the tag. Human
/// messages stay untagged (null actor → rendered plain), so the common case costs
/// nothing to display.
/// </summary>
public static class MessageActors
{
    /// <summary>Annotates user messages of <paramref name="repoId"/>'s transcript.
    /// Entries recorded for the arch agent's own conversation (repo id
    /// <c>@arch</c>) are its wake prompts; arch-kind entries on a repo are arch
    /// sends; every other kind is a loop send.</summary>
    public static List<ChatMessage> Annotate(
        IReadOnlyList<ChatMessage> messages, IEnumerable<AutopilotAuditLog.Entry> audit,
        string repoId, string? defaultUserActor = null)
    {
        var byText = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var e in audit)
        {
            if (!string.Equals(e.RepoId, repoId, StringComparison.Ordinal)) continue;
            if (e.Outcome != "loop" && e.Outcome != "sent" && e.Outcome != "arch") continue;
            var actor = ActorOf(e);
            foreach (var text in new[] { e.SentText, e.Prompt })
            {
                if (string.IsNullOrWhiteSpace(text)) continue;
                byText.TryAdd(text.Trim(), actor);
            }
        }
        var result = new List<ChatMessage>(messages.Count);
        foreach (var m in messages)
        {
            if (m.Role != "user") { result.Add(m); continue; }
            var actor = byText.TryGetValue(m.Text.Trim(), out var a) ? a : defaultUserActor;
            result.Add(actor is null ? m : m with { Actor = actor });
        }
        return result;
    }

    /// <summary>Audit phase prefix of a task received from a fleet arch on another
    /// harness (openspec add-fleet-arch-agent, D2): <c>fleet:&lt;machine&gt;</c>.</summary>
    public const string FleetPhasePrefix = "fleet:";

    public static string ActorOf(AutopilotAuditLog.Entry e)
    {
        if (string.Equals(e.RepoId, "@arch", StringComparison.Ordinal)) return "wake";
        if (string.Equals(e.Kind, "arch", StringComparison.Ordinal))
        {
            // A fleet send is tagged with the machine it came from — computed
            // by the RECEIVER from its own audit row, never taken from the wire.
            if (e.Phase is { } p && p.StartsWith(FleetPhasePrefix, StringComparison.Ordinal) && p.Length > FleetPhasePrefix.Length)
                return FleetActor(p[FleetPhasePrefix.Length..]);
            return "arch";
        }
        return "loop";
    }

    /// <summary>The actor value of a task from a fleet arch on <paramref name="machine"/>.</summary>
    public static string FleetActor(string machine) => "arch@" + machine;
}
