using ClaudeMonitor.Client;
using ClaudeWeb.Services.Chat;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// Result of one "Ask for understanding" run: success, or a friendly error string.
/// </summary>
public sealed record UnderstandingResult(bool Success, string? Error)
{
    public static UnderstandingResult Ok() => new(true, null);
    public static UnderstandingResult Fail(string error) => new(false, error);
}

/// <summary>
/// The "stage" for the second agentic dock button (openspec change
/// add-ask-for-understanding). Given a repo path + the dock builder lane's
/// <c>sessionId</c>, it FORKS that conversation into Claude Monitor and has the
/// forked agent build the repo's Understanding app explaining the latest turn.
///
/// Why a fork, not a resume-in-place: the dock conversation is the user's LIVE
/// chat. We copy its on-disk transcript to a fresh session via
/// <see cref="ClaudeMonitorClient.ResumeFromSnapshot"/> (POST /api/claude/snapshot-resume),
/// so the live session is never resumed, interleaved, or locked, and the fork
/// captures the conversation exactly "at that time" (see design.md decision 1).
///
/// Why this is the "more advanced" button: unlike Discover (read-only,
/// <see cref="StructuredAsk.StructuredAskRunner"/> pins Read/Grep/Glob/LS), this run
/// AUTHORS files. Per Option A (design.md decision 2) we accept the CLI's default
/// toolset — snapshot-resume carries no AllowedTools field — and bound the blast
/// radius by working dir = repo root and a prompt scoped to <c>understanding-app/</c>.
/// No Claude Monitor change.
/// </summary>
public class UnderstandingAsk
{
    // Per-call gateway identity, same reasoning as StructuredAskRunner: a UNIQUE
    // app name makes "latest record for this app" unambiguously THIS call's own, so
    // concurrent runs across repos never cross-wire their gateway metadata.
    private const string AppBase = "claudeweb-understanding";

    /// <summary>
    /// Fork the dock conversation and build the Understanding app for the latest
    /// assistant turn. <paramref name="workingDirectory"/> is the repo root (also
    /// the run's working directory, so writes land in this repo);
    /// <paramref name="sessionId"/> is the builder lane's transcript id.
    /// </summary>
    public async Task<UnderstandingResult> BuildAsync(
        string workingDirectory, string sessionId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return UnderstandingResult.Fail(
                "No conversation to explain yet — start a conversation in this dock first.");

        // sessionId is a UUID file name; reject anything that could escape the folder.
        if (sessionId.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
            return UnderstandingResult.Fail($"Invalid session id '{sessionId}'.");

        var snapshotPath = Path.Combine(
            SessionService.ProjectsDirectoryFor(workingDirectory), sessionId + ".jsonl");
        if (!File.Exists(snapshotPath))
            return UnderstandingResult.Fail(
                "No conversation transcript found for this dock yet — start a conversation first.");

        var callApp = $"{AppBase}#{Guid.NewGuid():N}";
        using var claude = new ClaudeMonitorClient(callApp);

        // Same friendly gateway-down message as StructuredAskRunner.
        if (!await claude.IsAvailable())
            return UnderstandingResult.Fail(
                "Claude Monitor gateway is not running on localhost:5123. " +
                "Start birokrat-ai-platform\\ClaudeMonitor\\ClaudeMonitor.App.");

        var resp = await claude.ResumeFromSnapshot(snapshotPath, Prompt, workingDirectory, ct);
        if (resp is null)
            return UnderstandingResult.Fail("null response from gateway");
        if (!resp.Success)
            return UnderstandingResult.Fail(resp.Error ?? "snapshot-resume failed — see ClaudeMonitor log");

        return UnderstandingResult.Ok();
    }

    // The fork already has the WHOLE conversation as context (it is a continuation),
    // so the prompt does not re-paste it — it just directs the build (design.md
    // decision 3). Kept in lockstep with docs/understanding-app-convention.md, which
    // the agent is told to read and follow as the source of truth.
    private const string Prompt = @"
You are continuing THIS conversation. Your job now is to build the repository's
**Understanding app** so it visually explains your most recent reply in this
conversation — the turn the user just read.

1. Read **docs/understanding-app-convention.md** in this repository and follow it
   EXACTLY. It is the source of truth for what the Understanding app is and where it
   lives.
2. Focus on the **most recent assistant turn** in this conversation: what was just
   explained. Build an app that makes that explanation clear with diagrams, demos,
   and a thorough, interactive visual explanation — not a static wall of text.
3. (Over)write **understanding-app/index.html** at the repo root (rolling latest —
   overwrite it), plus any vendored assets it needs.
4. Keep it **build-less and self-contained**: no CDN, no node_modules, no build step;
   vendor any libraries. Use **relative URLs only** (./app.js, not /app.js) — a
   leading slash escapes the proxy sub-path and 404s.

Do not modify anything outside understanding-app/. When done, briefly confirm what
you built.
";
}
