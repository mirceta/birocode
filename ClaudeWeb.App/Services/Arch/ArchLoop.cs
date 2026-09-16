using ClaudeWeb.Services.Autopilot;

namespace ClaudeWeb.Services.Arch;

/// <summary>What the arch loop asks of the arch service each tick: "is there a
/// wake-up to send?" Split out as an interface so the kind's decision table is
/// unit-testable without a harness (openspec: add-arch-agent, tasks 5.5).</summary>
public interface IArchWakeSource
{
    /// <summary>Composes the wake prompt from collector events past the watermark.
    /// Returns null (and advances the watermark) when nothing relevant happened.
    /// Never advances the watermark past relevant events — the ENGINE commits a
    /// draft once the wake actually landed (sent, or pended in suggest mode), so a
    /// failed slot claim re-composes the same events next tick. <paramref name="key"/>
    /// is the conversation the loop instance belongs to (openspec arch-conversations):
    /// each conversation has its own watermark.</summary>
    WakeDraft? ComposeWake(string key);
}

/// <summary>A composed wake-up: the prompt, the watermark it was read after, the
/// collector seq it covers, and the managed repos it names.</summary>
public sealed record WakeDraft(string Prompt, int After, int UpTo, IReadOnlyList<string> RepoIds);

/// <summary>
/// The arch loop kind (openspec: add-arch-agent, D2/D8; arch-standing-loop). Its
/// instances are keyed to the reserved id <see cref="ArchAgentService.ReservedId"/> (the
/// default conversation) or a conversation key <c>@arch:&lt;id&gt;</c> rather than a repo. Semantics only: the operator stop / errored-run ladder, then
/// "propose one arch turn when a managed repo started or ended a turn since the
/// watermark, else hold". A reply ending in <c>NEEDS_HUMAN:</c> is a HOLD, not a stop
/// (openspec arch-standing-loop): asking the Operator is the arch agent's normal
/// mode, so the loop stays armed, the question is surfaced as an escalated hold, and
/// the next wake (a managed repo finished a turn) or the Operator's reply carries on.
/// Deliberately NOT a <see cref="DrivenLoop"/>: the arch agent's replies are not
/// word-fenced (openspec remove-deny-fence); its sends are governed by the arm, the
/// cap, availability and the audit log (<see cref="ArchAgentService.SendTask"/>), not
/// on its narration.
/// </summary>
public sealed class ArchLoop : ILoop
{
    public const string WaitingPrefix = "waiting for the operator";

    private readonly IArchWakeSource _wake;

    public ArchLoop(IArchWakeSource wake)
    {
        _wake = wake;
    }

    public string Kind => LoopConfigStore.KindArch;

    /// <summary>The <c>NEEDS_HUMAN:</c> question in a reply, or null when there is none.</summary>
    public static string? PendingQuestion(string? lastAssistant)
    {
        if (lastAssistant is null) return null;
        var idx = lastAssistant.IndexOf(AutopilotService.NeedsHumanMarker, StringComparison.OrdinalIgnoreCase);
        if (idx < 0) return null;
        var question = AutopilotService.Snippet(lastAssistant[(idx + AutopilotService.NeedsHumanMarker.Length)..]);
        return string.IsNullOrEmpty(question) ? "the arch agent asked for the operator" : question;
    }

    public LoopDecision Decide(LoopContext ctx)
    {
        if (ctx.RunStopped)
            return new LoopDecision.Stop("stopped", "by-operator", "the operator stopped the arch agent's turn");

        if (ctx.RunErrored)
            return new LoopDecision.Stop("error", "error", "the arch agent's turn errored");

        var question = PendingQuestion(ctx.LastAssistant);

        var draft = _wake.ComposeWake(ctx.Instance.RepoId);
        if (draft is null)
        {
            // A pending question is an escalated hold: the loop stays armed, the
            // surface shows the question, and the Operator's reply (a new trailing
            // message without the marker) or the next wake lifts it.
            return question is null
                ? new LoopDecision.Hold("waiting for managed repo turns")
                : new LoopDecision.Hold($"{WaitingPrefix}: {question}", Escalate: true, Label: question);
        }

        // Repo turns keep flowing while a question waits: the arch agent carries on
        // with the other repos and re-raises the question itself if it still stands.
        return new LoopDecision.Propose(draft.Prompt);
    }
}
