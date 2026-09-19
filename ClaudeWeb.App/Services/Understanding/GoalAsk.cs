using ClaudeWeb.Services.Chat;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// The "Update goal" stage (openspec goal-app): the Understanding app's twin for the
/// GOAL of what is being built in this repo agent. Same mechanics as
/// <see cref="UnderstandingAsk"/> (the builder transcript handed to one ephemeral,
/// write-capable subagent run in the repo root — <see cref="ConversationAppBuild"/>);
/// only the prompt differs. The prompt is the whole feature:
///
///   - the goal is SET FROM CHAT: nothing in the harness parses messages; the subagent
///     reads the conversation and decides whether the latest turn(s) set or changed
///     the goal (a message starting with <c>GOAL:</c> is authoritative);
///   - the goal LIVES in <c>goal-app/goal.json</c> beside the app (current text,
///     when, who set it, an append-only history) so code can read it later without
///     parsing HTML — and the app renders the current goal plus the history;
///   - a turn that did not touch the goal costs one model reply and NO file churn:
///     the subagent answers "GOAL UNCHANGED" and touches nothing.
///
/// Independent of the board goal (one per Kanban) and the arch goals (one per arch
/// conversation): nothing reads goal.json yet; its shape is for later.
/// </summary>
public class GoalAsk : IConversationAppBuilder
{
    private readonly AgentHelperRunner? _helper;
    private readonly SessionService? _sessions;
    public GoalAsk(AgentHelperRunner? helper = null, SessionService? sessions = null)
    { _helper = helper; _sessions = sessions; }
    private const string AppBase = "claudeweb-goal";

    /// <summary>The agent-authored folder at the repo root, beside understanding-app/.</summary>
    public const string AppDirName = "goal-app";
    /// <summary>The machine-readable goal beside the app.</summary>
    public const string GoalFileName = "goal.json";
    /// <summary>The Operator's explicit marker: a chat message starting with this sets the goal.</summary>
    public const string Marker = "GOAL:";
    /// <summary>The reply a no-change run gives (and touches nothing).</summary>
    public const string UnchangedReply = "GOAL UNCHANGED";

    public AppBuildKind Kind => AppBuildKind.Goal;

    public Task<UnderstandingResult> BuildAsync(
        string workingDirectory, string sessionId, CancellationToken ct = default) =>
        ConversationAppBuild.RunAsync(_helper, _sessions, workingDirectory, sessionId,
            BuildPrompt(workingDirectory), AppBase,
            "No conversation to read the goal from yet — start a conversation in this dock first.", ct);

    // Same shape as UnderstandingAsk.BuildPrompt: the subagent has the conversation as
    // context; the prompt directs the decision and the build, and points at the SAME
    // convention doc (its "The Goal app" section) resolved the same way.
    public static string BuildPrompt(string workingDirectory)
    {
        var conventionRef = UnderstandingAsk.ConventionRef(workingDirectory);

        return $@"
You are continuing THIS conversation. Your job now is to keep the repository's
**Goal app** current: the GOAL of what we are building in this repository, as this
conversation has set it. Not what was just explained — what we are trying to make.

1. Read {conventionRef} and follow it EXACTLY, in particular its
   **""The Goal app""** section. It is the source of truth for what the Goal app is,
   where it lives (**{AppDirName}/** at the repo root, beside understanding-app/) and the
   **{AppDirName}/{GoalFileName}** it keeps. Build in THIS repo (your working directory),
   not where the doc lives.

2. Decide whether the goal CHANGED. First read **{AppDirName}/{GoalFileName}** if it
   exists: the current goal, when it was recorded, and its history. Then read the most
   recent turn(s) of this conversation — the ones since that goal was recorded — and
   decide whether they SET a goal, CHANGED or refined it, or left it alone.
   - A user message that starts with **`{Marker}`** is the Operator setting the goal
     explicitly. It is authoritative: take its text as the goal.
   - Otherwise use your judgement. Phrases like ""we want to create …"", ""the goal is
     …"", ""what we're building is …"", ""let's change direction …"" set or change the
     goal. Ordinary work towards the goal, questions, fixes and explanations do NOT.

3. If the goal did NOT change (or there is no goal in this conversation at all and no
   {GoalFileName}): reply exactly **`{UnchangedReply}`** followed by one line saying what
   the current goal is (or that none is set), and touch NO files.

4. If the goal changed, or there is a goal but no {GoalFileName} yet:
   a. Write **{AppDirName}/{GoalFileName}**:
      {{ ""text"": the goal in one or two sentences, ""updatedAt"": ISO-8601 UTC now,
        ""setBy"": ""operator"" when it came from a `{Marker}` or an explicit statement,
        ""conversation"" when you inferred it, ""source"": the message excerpt it came from,
        ""history"": every PREVIOUS entry, oldest first — append the entry you are
        replacing; never drop history }}.
   b. (Over)write **{AppDirName}/index.html** at the repo root (rolling latest), plus any
      vendored assets, so it visually explains the CURRENT goal: what we are building,
      for whom, what ""done"" looks like, the main parts and how they fit, and the
      history as a small timeline. Diagrams and interaction — not a wall of text.
   c. Keep it **build-less and self-contained**: no CDN, no node_modules, no build step;
      vendor any libraries. Use **relative URLs only** (./app.js, not /app.js) — a
      leading slash escapes the proxy sub-path and 404s.

Do not modify anything outside {AppDirName}/. When done, say in one line whether the
goal changed and what it is now.
";
    }
}
