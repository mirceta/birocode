using ClaudeWeb.Services.Chat;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// Result of one "Ask for understanding" / "Update goal" run: success, or a friendly
/// error string.
/// </summary>
public sealed record UnderstandingResult(bool Success, string? Error)
{
    public static UnderstandingResult Ok() => new(true, null);
    public static UnderstandingResult Fail(string error) => new(false, error);
}

/// <summary>
/// The "stage" for the second agentic dock button (openspec change
/// add-ask-for-understanding). Given a repo path + the dock builder lane's
/// <c>sessionId</c>, it hands that conversation to ONE ephemeral subagent run and
/// has it build the repo's Understanding app explaining the latest turn. The
/// mechanics (transcript → prompt → run, and the legacy Claude Monitor fork) are
/// shared with the Goal app in <see cref="ConversationAppBuild"/> (openspec goal-app);
/// this class owns only the understanding prompt.
///
/// Why this is the "more advanced" button: unlike Discover (read-only,
/// <see cref="StructuredAsk.StructuredAskRunner"/> pins Read/Grep/Glob/LS), this run
/// AUTHORS files. We bound the blast radius by working dir = repo root and a prompt
/// scoped to <c>understanding-app/</c>.
/// </summary>
public class UnderstandingAsk : IConversationAppBuilder
{
    private readonly AgentHelperRunner? _helper;
    private readonly SessionService? _sessions;
    public UnderstandingAsk(AgentHelperRunner? helper = null, SessionService? sessions = null)
    { _helper = helper; _sessions = sessions; }
    private const string AppBase = "claudeweb-understanding";

    public AppBuildKind Kind => AppBuildKind.Understanding;

    /// <summary>
    /// Hand the dock conversation to a subagent and build the Understanding app for
    /// the latest assistant turn. <paramref name="workingDirectory"/> is the repo root
    /// (also the run's working directory, so writes land in this repo);
    /// <paramref name="sessionId"/> is the builder lane's transcript id.
    /// </summary>
    public Task<UnderstandingResult> BuildAsync(
        string workingDirectory, string sessionId, CancellationToken ct = default) =>
        ConversationAppBuild.RunAsync(_helper, _sessions, workingDirectory, sessionId,
            BuildPrompt(workingDirectory), AppBase,
            "No conversation to explain yet — start a conversation in this dock first.", ct);

    // The subagent already has the WHOLE conversation as context, so the prompt does
    // not re-paste it — it just directs the build (design.md decision 3). Kept in
    // lockstep with docs/understanding-app-convention.md, which the agent is told to
    // read and follow as the source of truth.
    //
    // The convention doc lives ONLY in birocode (the canonical Harness repo). When this
    // run fires from a DIFFERENT repo, "docs/understanding-app-convention.md in this
    // repository" points at a file that doesn't exist there. So we resolve birocode's
    // copy by absolute path (see <see cref="ResolveConventionDoc"/>) and inject it.
    public static string BuildPrompt(string workingDirectory)
    {
        var conventionRef = ConventionRef(workingDirectory);

        return $@"
You are continuing THIS conversation. Your job now is to build the repository's
**Understanding app** so it visually explains your most recent reply in this
conversation — the turn the user just read.

1. Read {conventionRef} and follow it
   EXACTLY. It is the source of truth for what the Understanding app is and where it
   lives. Build the app in THIS repo (your working directory), not where the doc lives.
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

    /// <summary>How a prompt names the convention doc: its absolute birocode path when
    /// resolvable, else the relative reference (correct when firing from birocode).</summary>
    internal static string ConventionRef(string workingDirectory) =>
        ResolveConventionDoc(workingDirectory) is { } abs
            ? $"the Understanding-app convention at **{abs}**"
            : "**docs/understanding-app-convention.md** in this repository";

    // Resolve the canonical Understanding-app convention doc, which lives only in the
    // birocode repo. We cannot hard-code an absolute path — birocode sits at a different
    // place on every machine. The one invariant the user guarantees: every repo this
    // runs from is a DESCENDANT of a folder named "playground", and birocode is a DIRECT
    // CHILD of that same playground folder. So walk up the ancestors from the firing
    // repo to the nearest "playground", then descend into birocode/docs.
    //
    // Returns null when no "playground" ancestor exists or the doc isn't there, so the
    // caller can fall back to the relative reference (correct when firing from birocode
    // itself, whose own ancestor walk lands back on its own copy anyway).
    internal static string? ResolveConventionDoc(string workingDirectory)
    {
        if (string.IsNullOrWhiteSpace(workingDirectory))
            return null;

        for (var dir = new DirectoryInfo(Path.GetFullPath(workingDirectory));
             dir is not null; dir = dir.Parent)
        {
            if (!string.Equals(dir.Name, "playground", StringComparison.OrdinalIgnoreCase))
                continue;

            var candidate = Path.Combine(
                dir.FullName, "birocode", "docs", "understanding-app-convention.md");
            return File.Exists(candidate) ? candidate : null;
        }

        return null;
    }
}
