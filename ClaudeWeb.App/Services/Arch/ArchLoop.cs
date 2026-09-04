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
    /// failed slot claim re-composes the same events next tick.</summary>
    WakeDraft? ComposeWake();
}

/// <summary>A composed wake-up: the prompt, the watermark it was read after, the
/// collector seq it covers, and the managed repos it names.</summary>
public sealed record WakeDraft(string Prompt, int After, int UpTo, IReadOnlyList<string> RepoIds);

/// <summary>
/// The arch loop kind (openspec: add-arch-agent, D2/D8). Its single instance is
/// keyed to the reserved id <see cref="ArchAgentService.ReservedId"/> rather than a
/// repo. Semantics only: the operator stop / errored-run ladder, the
/// <c>NEEDS_HUMAN:</c> escalation, then "propose one arch turn when a managed repo
/// started or ended a turn since the watermark, else hold". Deliberately NOT a
/// <see cref="DrivenLoop"/>: the arch agent's replies are not word-fenced (openspec
/// remove-deny-fence); its sends are governed by the arm, the cap, availability and the
/// audit log
/// (<see cref="ArchAgentService.SendTask"/>), not on its narration.
/// </summary>
public sealed class ArchLoop : ILoop
{
    private readonly IArchWakeSource _wake;

    public ArchLoop(IArchWakeSource wake)
    {
        _wake = wake;
    }

    public string Kind => LoopConfigStore.KindArch;

    public LoopDecision Decide(LoopContext ctx)
    {
        if (ctx.RunStopped)
            return new LoopDecision.Stop("stopped", "by-operator", "the operator stopped the arch agent's turn");

        if (ctx.RunErrored)
            return new LoopDecision.Stop("error", "error", "the arch agent's turn errored");

        var last = ctx.LastAssistant;
        if (last != null)
        {
            var idx = last.IndexOf(AutopilotService.NeedsHumanMarker, StringComparison.OrdinalIgnoreCase);
            if (idx >= 0)
            {
                var question = AutopilotService.Snippet(last[(idx + AutopilotService.NeedsHumanMarker.Length)..]);
                return new LoopDecision.Stop("escalate", "needs-human",
                    string.IsNullOrEmpty(question) ? "the arch agent asked for the operator" : question);
            }
        }

        var draft = _wake.ComposeWake();
        if (draft is null)
            return new LoopDecision.Hold("waiting for managed repo turns");

        return new LoopDecision.Propose(draft.Prompt);
    }
}
