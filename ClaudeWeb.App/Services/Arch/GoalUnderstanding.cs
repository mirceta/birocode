using ClaudeWeb.Services;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Understanding;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// A per-goal-conversation Understanding app (fleet task 93b481e6): the repo-agent
/// "Ask for understanding" feature, mirrored for an arch GOAL CONVERSATION. Same
/// principle — one ephemeral, write-capable subagent reads the conversation's
/// transcript and authors a build-less, self-contained SPA that explains the goal's
/// orchestration — served no-store in the goal's new "Understanding" tab.
///
/// Two differences from <see cref="Understanding.UnderstandingAsk"/> force a dedicated,
/// conversation-keyed service rather than reusing <see cref="Understanding.UnderstandingJobs"/>
/// (which is repo-keyed and emits to the repo event log / audit):
///   1. READ ⟂ WRITE split. The transcript is read from the arch's Home Repository
///      (its CLI session .jsonl), but that home's <c>.claude/settings.json</c>
///      structurally DENIES Write/Edit/Bash — so the subagent cannot author there.
///      It writes instead into a fence-free folder under the data dir, which is also
///      its working directory. The repo pipeline conflates the two because for a repo
///      they are the same root.
///   2. Hub-local. Goal conversations are never relayed across the fleet, so the app
///      lives next to this hub's goals and needs no byte relay — the browser points at
///      this harness's own <c>/api/arch/goals/{id}/understanding/app/</c>.
///
/// Storage: <c>&lt;datadir&gt;/goal-understanding/&lt;goalId&gt;/</c> (survives restarts,
/// in no repo, no deny fence). Latest-only job per goal, owned on a background task with
/// its OWN cancellation token, so a dashboard refresh mid-build never cancels it and the
/// tab reattaches via the status endpoint — the proven model of the repo pipeline.
/// </summary>
public class GoalUnderstanding
{
    private readonly ArchAgentService _arch;
    private readonly SessionService _sessions;
    private readonly AgentHelperRunner _helper;
    private readonly RepositoryRegistry _repos;
    private readonly Logger _logger;

    private readonly object _gate = new();
    private readonly Dictionary<string, UnderstandingJob> _jobs = new(StringComparer.Ordinal);

    private const string AppBase = "claudeweb-goal-understanding";

    public GoalUnderstanding(ArchAgentService arch, SessionService sessions, AgentHelperRunner helper, RepositoryRegistry repos, Logger logger)
    {
        _arch = arch; _sessions = sessions; _helper = helper; _repos = repos; _logger = logger;
    }

    /// <summary>The root that holds every goal's app folder.</summary>
    public static string Root => Path.Combine(AppPaths.DataDir, "goal-understanding");

    /// <summary>The app folder for one goal, or null when the id is not a safe file name.</summary>
    public static string? AppDir(string? goalId)
    {
        var id = goalId?.Trim();
        if (string.IsNullOrEmpty(id) || id is "." or "..") return null;
        if (id.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) return null;
        return Path.Combine(Root, id);
    }

    /// <summary>Whether this goal has an authored app, and when it was last written —
    /// a pure disk check, so <see cref="ArchAgentService.GoalView"/> can surface a badge
    /// without taking a dependency on this service.</summary>
    public static (bool built, long? at) BuiltState(string? goalId)
    {
        var dir = AppDir(goalId);
        if (dir == null) return (false, null);
        var index = Path.Combine(dir, "index.html");
        if (!File.Exists(index)) return (false, null);
        try { return (true, new DateTimeOffset(File.GetLastWriteTimeUtc(index)).ToUnixTimeMilliseconds()); }
        catch { return (true, null); }
    }

    /// <summary>Serve the goal's app folder no-store, contained, with an explicit empty
    /// state / 404 — the same contract as the repo Understanding/Goal apps.</summary>
    public Task Serve(HttpContext ctx, string? goalId, string? rest)
    {
        var dir = AppDir(goalId);
        if (dir == null) { ctx.Response.StatusCode = StatusCodes.Status400BadRequest; return Task.CompletedTask; }
        return HarnessStaticApp.Serve(ctx, dir, rest, _logger, EmptyStateHtml, "GOAL-UNDERSTANDING");
    }

    /// <summary>The most recent run for this goal, or null if none has run since start-up.</summary>
    public UnderstandingJob? Get(string? goalId)
    {
        var id = goalId?.Trim();
        if (string.IsNullOrEmpty(id)) return null;
        lock (_gate) return _jobs.GetValueOrDefault(id);
    }

    /// <summary>
    /// Join the goal's in-flight build if one is running, else start a new one. Returns
    /// null when the goal is unknown (the controller 404s). A goal whose conversation has
    /// not run a turn yet starts a job that immediately fails with a friendly reason, so
    /// the tab shows WHY rather than silently doing nothing.
    /// </summary>
    public UnderstandingJob? StartOrJoin(string? goalId)
    {
        var (goal, sessionId, home) = _arch.ResolveGoalForUnderstanding(goalId);
        if (goal == null) return null;
        var id = goal.Id;
        lock (_gate)
        {
            if (_jobs.TryGetValue(id, out var existing) && existing.Status == UnderstandingStatus.Running)
                return existing;
            var job = StartNew(id, sessionId, home);
            _jobs[id] = job;
            return job;
        }
    }

    private UnderstandingJob StartNew(string goalId, string? sessionId, string home)
    {
        var job = new UnderstandingJob();
        _logger.Info($"[GOAL-UNDERSTANDING] run started for goal {goalId}");
        job.Run = Task.Run(async () =>
        {
            try
            {
                var result = await BuildAsync(goalId, sessionId, home, job.Cts.Token);
                if (result.Success) job.MarkDone(result.Summary);
                else job.MarkError(result.Error ?? "goal understanding run failed");
            }
            catch (OperationCanceledException) { job.MarkError("goal understanding run cancelled"); }
            catch (Exception ex) { job.MarkError($"{ex.GetType().Name}: {ex.Message}"); }
        });
        return job;
    }

    private async Task<UnderstandingResult> BuildAsync(string goalId, string? sessionId, string home, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return UnderstandingResult.Fail("This goal conversation has not run a turn yet — there is nothing to explain.");

        var dir = AppDir(goalId);
        if (dir == null) return UnderstandingResult.Fail($"Invalid goal id '{goalId}'.");
        Directory.CreateDirectory(dir);

        var messages = _sessions.GetMessages(home, sessionId);
        if (messages.Count == 0)
            return UnderstandingResult.Fail("No conversation transcript found for this goal yet.");

        // Long transcripts go to a side file and are referenced, as the repo pipeline does.
        var export = messages.Sum(m => m.Text.Length + m.Role.Length + 5) > 12000
            ? ConversationHandoff.Export(dir, messages) : null;
        var prompt = ConversationHandoff.BuildPrompt(messages, BuildInstruction(), out _, export);

        // Working directory = the app folder (fence-free, write-capable). The transcript
        // is in the prompt, so the subagent only needs to WRITE here.
        var reply = await _helper.RunAsync(prompt, dir, readOnly: false, ct);
        return UnderstandingResult.Ok(ConversationAppBuild.Summarize(reply));
    }

    /// <summary>
    /// The instruction handed to the subagent. Mirrors <see cref="Understanding.UnderstandingAsk.BuildPrompt"/>
    /// but the subject is the GOAL ORCHESTRATION (what the goal is, its plan, what it has
    /// delegated and to whom, where it stands) and the write target is the current working
    /// directory itself (already the per-goal folder), not an <c>understanding-app/</c>
    /// subfolder. Points at the canonical convention doc by absolute path (it lives only in
    /// birocode, and this run's cwd is under the data dir).
    /// </summary>
    private string BuildInstruction()
    {
        var conventionRef = ConventionRef();
        return $@"
You are continuing THIS arch GOAL CONVERSATION. Your job now is to build an
**Understanding app** that visually explains this goal's orchestration — what is being
pursued, the plan and where it stands, what has been delegated to which repo agents, and
how the pieces fit — so the Operator can grasp a complex run at a glance.

1. Read {conventionRef} and follow its four-line contract EXACTLY (build-less &
   self-contained; relative URLs only; rolling-latest entry; the harness serves it).
2. (Over)write **index.html** IN YOUR CURRENT WORKING DIRECTORY (this folder is this
   goal's app folder — do not create an understanding-app/ subfolder), plus any vendored
   assets it needs. Overwrite the same index.html each time — do not version filenames.
3. Make it a real, interactive visual explanation of THIS goal: the objective, the step
   plan and its state, the agents/repos/tasks it drives, blocked/awaiting points, and the
   outcome so far — not a static wall of text.
4. Keep it build-less and self-contained: no CDN, no node_modules, no build step; vendor
   any libraries. Use **relative URLs only** (./app.js, not /app.js) — a leading slash
   escapes the proxy sub-path and 404s.

Do not modify anything outside this working directory. When done, confirm in one line what
you built.
";
    }

    /// <summary>How the prompt names the convention doc: birocode's absolute path (resolved
    /// from the self repo), else the relative reference as a last resort.</summary>
    private string ConventionRef()
    {
        var self = _repos.GetAll().FirstOrDefault(r => r.IsSelf)?.Path;
        if (!string.IsNullOrEmpty(self))
        {
            var doc = Path.Combine(self, "docs", "understanding-app-convention.md");
            if (File.Exists(doc)) return $"the Understanding-app convention at **{doc}**";
        }
        return "**docs/understanding-app-convention.md** in the Claude Web (birocode) repository";
    }

    private const string EmptyStateHtml = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Understanding — empty</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0e1116; color: #cdd9e5;
    font: 14px/1.6 system-ui, -apple-system, Segoe UI, sans-serif; }
  .wrap { max-width: 680px; margin: 0 auto; padding: 64px 24px; }
  h1 { font-size: 18px; color: #e6edf3; margin: 0 0 12px; }
  .muted { color: #8b949e; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>No Understanding app for this goal yet</h1>
    <p class="muted">Press <b>Ask for understanding</b> in this tab. A subagent reads this
      goal conversation and builds a self-contained app explaining its orchestration —
      the objective, the step plan, and what it has delegated. There is intentionally no
      fallback: empty means nothing has been built yet.</p>
  </div>
</body>
</html>
""";
}
