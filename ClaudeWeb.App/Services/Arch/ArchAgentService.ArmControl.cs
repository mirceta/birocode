using ClaudeWeb.Services.Autopilot;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch agent's ONE on/off (openspec arch-arm-control). "Armed" — may the arch send tasks
/// (send_task / dispatch_task)? — is true while ANY arch loop runs: a standing wake loop on some
/// conversation, or a goal / recipe loop. That rule is unchanged; what was missing was a place that
/// says so. <see cref="ArmStatus"/> answers it in one object (armed?, what holds it, what ended it
/// last and why) and <see cref="SetArmed"/> is the one switch: arm = the standing wake loop on the
/// conversation that holds it (or a dedicated "Standing loop" conversation, created when needed —
/// the default conversation never takes a wake loop); disarm = every running arch loop stops.
/// </summary>
public partial class ArchAgentService
{
    public const string StandingConversationName = "Standing loop";

    public sealed record ArmHolder(string Conversation, string Name, string Kind, string Mode, int Iterations, int Cap, string? Goal);
    public sealed record ArmLast(string Conversation, string Name, bool ConversationExists, string Kind, string Status, string? Reason, string? Detail, long At, string Why);
    public sealed record ArmState(bool Armed, IReadOnlyList<ArmHolder> Holders, ArmLast? Last, ArmLast? LastStanding, bool GateOpen, int ManagedCount, string? ArmBlocked, string? StandingConversation);

    /// <summary>Is the arch armed, by what, and — when it is not — what ended the last loop and why.</summary>
    public ArmState ArmStatus()
    {
        var loops = ConversationLoops();
        var convIds = _state.Conversations.Select(c => c.Id).ToHashSet(StringComparer.Ordinal);
        var holders = loops.Where(l => l.Active).Select(l => new ArmHolder(l.RepoId, NameOf(l.RepoId), l.Kind, l.Mode,
            l.IterationsDone, l.MaxIterations, _state.GoalOf(l.RepoId)?.Text)).ToList();
        ArmLast? Describe(LoopConfigStore.LoopState? ended)
        {
            if (ended is null) return null;
            var exists = convIds.Contains(ended.RepoId);
            return new ArmLast(ended.RepoId, exists ? NameOf(ended.RepoId) : "(a deleted conversation)", exists, ended.Kind, ended.Status,
                ended.StopReason, ended.StopDetail, Math.Max(ended.LastSentAt, ended.ArmedAt), WhyEnded(ended, exists));
        }
        var inactive = loops.Where(l => !l.Active).OrderByDescending(l => Math.Max(l.LastSentAt, l.ArmedAt)).ToList();
        // The last loop that ended (the immediate reason) AND the last standing loop (the one that keeps
        // the arch on between goals) — often not the same, and the second is usually the one to know.
        var last = Describe(inactive.FirstOrDefault());
        var lastStanding = Describe(inactive.FirstOrDefault(l => l.Kind == LoopConfigStore.KindArch));
        var managed = ManagedRepoIds().Count + ManagedFleet().Count;
        string? blocked = !_gate.Enabled ? "the autopilot gate is closed on the host computer (the harness window) — open it there first"
            : managed == 0 ? "no repo agents are managed yet — tick at least one under Managed agents first" : null;
        return new ArmState(holders.Count > 0, holders, last, lastStanding, _gate.Enabled, managed, blocked, StandingConversationId());
    }

    /// <summary>The words for why a loop ended (pure but for the loop it reads).</summary>
    public static string WhyEnded(LoopConfigStore.LoopState l, bool conversationExists)
    {
        var what = l.Kind == LoopConfigStore.KindArch ? "the standing wake loop" : $"the {l.Kind} loop";
        return (l.Status, l.StopReason) switch
        {
            ("stopped", "user") when !conversationExists => $"{what} stopped because its conversation was deleted",
            ("stopped", "user") => $"{what} was stopped by the Operator",
            ("stopped", var by) when by is not null => $"{what} was stopped by {by}",
            ("capped", _) => $"{what} reached its cap ({l.IterationsDone}/{l.MaxIterations})",
            ("done", _) => $"{what} finished — its goal was verified",
            ("escalate", _) => $"{what} stopped to ask the Operator",
            ("error", _) => $"{what} stopped on an error{(string.IsNullOrEmpty(l.StopDetail) ? "" : $": {l.StopDetail}")}",
            _ => $"{what} ended ({l.Status})",
        };
    }

    /// <summary>The conversation the standing loop lives on: the one that remembers it, else the
    /// dedicated "Standing loop" conversation; null when neither exists yet.</summary>
    private string? StandingConversationId()
    {
        foreach (var c in _state.Conversations)
            if (!c.IsDefault && _state.StandingLoopOf(c.Id) is not null) return c.Id;
        return _state.Conversations.FirstOrDefault(c => !c.IsDefault && string.Equals(c.Name, StandingConversationName, StringComparison.OrdinalIgnoreCase))?.Id;
    }

    /// <summary>The one switch. on = arm the standing wake loop (drive, no cap) on its conversation,
    /// creating "Standing loop" when needed; off = stop EVERY running arch loop (standing loops and
    /// goals), so the arch cannot send until armed again. Throws with the Operator's words when it
    /// cannot arm.</summary>
    public ArmState SetArmed(bool on, string by = "operator")
    {
        if (on)
        {
            var status = ArmStatus();
            if (status.ArmBlocked is { } why) throw new InvalidOperationException(why);
            var conv = status.StandingConversation ?? CreateConversation(StandingConversationName).Id;
            if (_loops.Get(conv) is not { Active: true }) Arm(conv, "drive", 0);
            _logger.Info($"[ARCH] armed by {by} — standing wake loop on \"{NameOf(conv)}\"");
        }
        else
        {
            foreach (var l in ConversationLoops().Where(l => l.Active))
            {
                if (_state.GoalOf(l.RepoId) is { Running: true } g) StopGoal(g.Id, by);
                else Disarm(l.RepoId);
            }
            _logger.Info($"[ARCH] disarmed by {by} — every arch loop stopped");
        }
        return ArmStatus();
    }
}
