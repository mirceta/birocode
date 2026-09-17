using ClaudeMonitor.Client;
using ClaudeWeb.Services.Chat;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// One KIND of "build an app from this dock's conversation" run (openspec goal-app):
/// the Understanding app and the Goal app share one pipeline — a dock button + a
/// per-repo Auto flag, the backend-owned latest-only job registry, the transcript
/// handed to one ephemeral subagent, a folder at the repo root served as an always-on
/// local app — and differ only in the prompt, the folder, and the names the Console,
/// the audit trail and the API use. Those names live here so the registry, the
/// trigger and the controllers are keyed by kind instead of copied per feature.
/// </summary>
public sealed record AppBuildKind(
    string Key,
    string Op,
    string Title,
    string AuditFeature,
    string StartedDetail,
    string DoneDetail,
    string CancelledDetail,
    string FailedDefault)
{
    public static readonly AppBuildKind Understanding = new(
        "understanding", "understanding", "Understanding", "ask-for-understanding",
        "forking the conversation — building the Understanding app…",
        "built understanding-app/ — reload the Local tab's Understanding app to see it",
        "understanding run cancelled", "understanding run failed");

    public static readonly AppBuildKind Goal = new(
        "goal", "goal", "Goal", "update-goal",
        "reading the conversation — updating the Goal app…",
        "goal-app/ is current — reload the Local tab's Goal app to see it",
        "goal run cancelled", "goal run failed");

    public static readonly IReadOnlyList<AppBuildKind> All = new[] { Understanding, Goal };

    public static AppBuildKind? ByAuditFeature(string? feature) =>
        All.FirstOrDefault(k => string.Equals(k.AuditFeature, feature, StringComparison.OrdinalIgnoreCase));
}

/// <summary>What the jobs registry runs for one kind: the transcript → prompt → subagent
/// step. <see cref="UnderstandingAsk"/> (understanding) and <see cref="GoalAsk"/> (goal)
/// implement it; DI registers both and the registry maps them by <see cref="Kind"/>.</summary>
public interface IConversationAppBuilder
{
    AppBuildKind Kind { get; }
    Task<UnderstandingResult> BuildAsync(string workingDirectory, string sessionId, CancellationToken ct = default);
}

/// <summary>
/// The shared body of every kind's build (openspec goal-app, factored out of
/// <see cref="UnderstandingAsk"/>): validate the session id, load the builder transcript,
/// export it when long, paste it into ONE prompt with the kind's instruction, and run
/// that once — ephemeral, write-capable, in the repo root, with the repo's own engine —
/// so the live conversation is never resumed or locked. Legacy fallback when the helper
/// runner is not wired: fork the transcript through Claude Monitor snapshot-resume.
/// </summary>
public static class ConversationAppBuild
{
    public static async Task<UnderstandingResult> RunAsync(
        AgentHelperRunner? helper, SessionService? sessions,
        string workingDirectory, string sessionId, string instruction, string appBase,
        string noConversationHint, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return UnderstandingResult.Fail(noConversationHint);

        // sessionId is a UUID file name; reject anything that could escape the folder.
        if (sessionId.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
            return UnderstandingResult.Fail($"Invalid session id '{sessionId}'.");

        if (helper != null && sessions != null)
        {
            var messages = sessions.GetMessages(workingDirectory, sessionId);
            if (messages.Count == 0) return UnderstandingResult.Fail("No conversation transcript found for this dock yet.");
            try
            {
                var export = messages.Sum(m => m.Text.Length + m.Role.Length + 5) > 12000
                    ? ConversationHandoff.Export(workingDirectory, messages) : null;
                var prompt = ConversationHandoff.BuildPrompt(messages, instruction, out _, export);
                var reply = await helper.RunAsync(prompt, workingDirectory, false, ct);
                return UnderstandingResult.Ok(Summarize(reply));
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex) { return UnderstandingResult.Fail(ex.Message); }
        }

        var snapshotPath = Path.Combine(
            SessionService.ProjectsDirectoryFor(workingDirectory), sessionId + ".jsonl");
        if (!File.Exists(snapshotPath))
            return UnderstandingResult.Fail(
                "No conversation transcript found for this dock yet — start a conversation first.");

        // Per-call gateway identity: a UNIQUE app name makes "latest record for this
        // app" unambiguously THIS call's own, so concurrent runs never cross-wire.
        var callApp = $"{appBase}#{Guid.NewGuid():N}";
        using var claude = new ClaudeMonitorClient(callApp);

        if (!await claude.IsAvailable())
            return UnderstandingResult.Fail(
                "Claude Monitor gateway is not running on localhost:5123. " +
                "Start birokrat-ai-platform\\ClaudeMonitor\\ClaudeMonitor.App.");

        var resp = await claude.ResumeFromSnapshot(snapshotPath, instruction, workingDirectory, ct);
        if (resp is null)
            return UnderstandingResult.Fail("null response from gateway");
        if (!resp.Success)
            return UnderstandingResult.Fail(resp.Error ?? "snapshot-resume failed — see ClaudeMonitor log");

        return UnderstandingResult.Ok();
    }

    /// <summary>The subagent's closing line, as the dock shows it: both prompts end with
    /// "when done, say in one line …", so the LAST non-empty line of the reply is the
    /// verdict ("GOAL UNCHANGED — current goal: …"). Markdown emphasis stripped, capped
    /// so a chatty reply cannot flood the dock. Null when there was no text.</summary>
    public static string? Summarize(string? reply, int max = 240)
    {
        if (string.IsNullOrWhiteSpace(reply)) return null;
        var last = reply.Split('\n').Select(l => l.Trim()).LastOrDefault(l => l.Length > 0);
        if (last is null) return null;
        last = last.Replace("**", "").Replace("`", "").TrimStart('-', '*', '#', ' ').Trim();
        if (last.Length > max) last = last[..(max - 1)].TrimEnd() + "…";
        return last.Length == 0 ? null : last;
    }
}
