using ClaudeWeb.Services;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Loop-autopilot API (plans/loop-autopilot.md). GLOBAL (no X-Repo-Id): autopilot
/// spans every registered repo, because routine prompts ("deploy", "keep it", "yes")
/// recur across projects.
///   GET  /api/autopilot/discover  — Slice 1: the recurring prompts, most-repeated first
///   GET  /api/autopilot           — Slice 2: config + per-agent state + recent log
///   POST /api/autopilot/config    — arm/disarm an agent, set threshold, kill switch
///
/// OPERATOR GATE (plans/loop-autopilot-safety.md): EVERY endpoint here is fenced by
/// <see cref="AutopilotGate"/>. When the host has the gate OFF (the default), all
/// of them return 403 — there is DELIBERATELY no endpoint that can turn the gate on
/// (that lives only in the WinForms host), so a steered web client or
/// prompt-injected brain can never grant autopilot the authority to act.
///
/// TWO deliberate exceptions to the gate:
/// <c>GET /api/autopilot/loops</c> (openspec: adopt-autopilot-loops, design §5) is
/// session-auth only, NOT operator-gated, so the dashboard can still show a loop's
/// terminal state (done/escalated/capped + why) after the operator closes the gate.
/// It discloses loop STATUS, recipe NAMES, and suggestion-arming STATUS only — no
/// prompts, no config, no action surface. And <c>GET/PUT /api/autopilot/briefing</c>
/// (openspec: loop-agent-briefing, D2b): the briefing rules are operator-authored
/// harness text — never repo or prompt content — and capturing a rule idea from the
/// dock must work whenever the dock is visible; the sends that consume the rules
/// stay gate-fenced like every action here.
/// </summary>
[ApiController]
[Route("api/autopilot")]
public class AutopilotController : ControllerBase
{
    private readonly AutopilotDiscoveryService _discovery;
    private readonly AutopilotService _engine;
    private readonly AutopilotConfigStore _config;
    private readonly LoopConfigStore _loops;
    private readonly LoopRecipeStore _recipes;
    private readonly BriefingRulesStore _briefing;
    private readonly AutopilotGate _operatorGate;
    private readonly AutopilotAuditLog _audit;
    private readonly SystemTestsService _systests;
    private readonly RepositoryRegistry _repos;
    private readonly DockRegistry _dock;
    private readonly Logger _logger;

    public AutopilotController(
        AutopilotDiscoveryService discovery, AutopilotService engine,
        AutopilotConfigStore config, LoopConfigStore loops, LoopRecipeStore recipes,
        BriefingRulesStore briefing, AutopilotGate operatorGate, AutopilotAuditLog audit,
        SystemTestsService systests, RepositoryRegistry repos, DockRegistry dock, Logger logger)
    {
        _discovery = discovery;
        _engine = engine;
        _config = config;
        _loops = loops;
        _recipes = recipes;
        _briefing = briefing;
        _operatorGate = operatorGate;
        _audit = audit;
        _systests = systests;
        _repos = repos;
        _dock = dock;
        _logger = logger;
    }

    // 403 with a machine-readable marker the local app renders as an explicit
    // "disabled by the operator" state. Returned before any work is done.
    private IActionResult? GateClosed() =>
        _operatorGate.Enabled
            ? null
            : StatusCode(StatusCodes.Status403Forbidden,
                new { error = "Autopilot is disabled by the operator.", gate = "operator-off" });

    [HttpGet("discover")]
    public IActionResult Discover()
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        return Ok(_discovery.Discover());
    }

    /// <summary>Live state for the Autopilot tab: the gate config, every agent's
    /// current verdict, and the recent suggestion log.</summary>
    [HttpGet]
    public IActionResult State()
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        return Ok(BuildState());
    }

    public sealed record ConfigRequest(string? RepoId, bool? Armed, double? Threshold, bool? Enabled, bool? AutoAdvance, string? Brain);

    /// <summary>Mutates one or more settings per call. Returns the new state so the
    /// UI can reconcile without a second round-trip.</summary>
    [HttpPost("config")]
    public IActionResult Config([FromBody] ConfigRequest req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (req is null) return BadRequest(new { error = "missing body" });

        if (req.Enabled is bool enabled) _config.SetEnabled(enabled);
        if (req.AutoAdvance is bool autoAdvance)
        {
            // Revision 2: auto-advance is the DEFAULT MODE for newly armed suggestion
            // loops, and (keeping the console toggle's old meaning) flips the mode of
            // every ACTIVE suggestion instance live.
            _config.SetAutoAdvance(autoAdvance);
            var mode = autoAdvance ? LoopConfigStore.ModeDrive : LoopConfigStore.ModeSuggest;
            foreach (var l in _loops.All().Where(l =>
                         l is { Active: true, Kind: LoopConfigStore.KindSuggestion }))
                _loops.SetMode(l.RepoId, mode);
        }
        if (req.Threshold is double threshold) _config.SetThreshold(threshold);
        // The suggestion classifier selection (fix-suggestion-loop-inert, D5):
        // "cli" (default) | "stub" — the stub stays as the fallback setting.
        if (!string.IsNullOrWhiteSpace(req.Brain)) _config.SetBrain(req.Brain);
        // Arming the suggestion mode is arming its loop instance — the one store slot
        // per agent IS the exclusive-arming rule (revision 2, D8), so this displaces
        // whatever loop was armed. Disarm only clears a suggestion instance here
        // (this endpoint never touches a driven loop).
        if (!string.IsNullOrEmpty(req.RepoId) && req.Armed is bool armed)
        {
            if (armed)
                _loops.StartSuggestion(req.RepoId,
                    _config.Get().AutoAdvance ? LoopConfigStore.ModeDrive : LoopConfigStore.ModeSuggest);
            else if (_loops.Get(req.RepoId) is { Active: true, Kind: LoopConfigStore.KindSuggestion })
                _loops.Stop(req.RepoId);
        }

        return Ok(BuildState());
    }

    public sealed record LoopRequest(
        string? RepoId, string? Action, string? Kind, string? Mode, string? Prompt,
        string? Goal, string? Sentinel, int? MaxIterations, string? RecipeId,
        string? SessionId,
        // Queue kind (openspec: queue-based-loop, D8): the dock tab whose live
        // stash IS the queue, and the between-step verification opt-out
        // (null = on, the default posture).
        string? TabId = null, bool? VerifyEnabled = null);

    /// <summary>The loop control (openspec: unify-loop-types, revision 2): one
    /// endpoint arms / edits / disarms an agent's ONE loop instance of any kind.
    /// <c>action</c> = start | mode | update | stop | disarm. A start's <c>kind</c>
    /// picks the implementation — "suggestion" (no params), "goal" (free-text
    /// <c>goal</c>), else recipe (a <c>recipeId</c> whose stored prompt/sentinel/cap
    /// the server fills byte-identical, or a raw <c>prompt</c>). Every start accepts
    /// the common <c>mode</c> (suggest | drive; drive is the driven kinds' default);
    /// <c>mode</c> as an action flips a live instance without resetting it. Arming
    /// replaces the agent's slot — exclusive arming by construction; <c>stop</c> and
    /// <c>disarm</c> are the same single clear. Gated like every other autopilot
    /// action; returns the fresh state.</summary>
    [HttpPost("loop")]
    public IActionResult Loop([FromBody] LoopRequest req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (req is null || string.IsNullOrWhiteSpace(req.RepoId))
            return BadRequest(new { error = "missing repoId" });

        switch ((req.Action ?? "start").ToLowerInvariant())
        {
            case "start":
                if (string.Equals(req.Kind, LoopConfigStore.KindSuggestion, StringComparison.OrdinalIgnoreCase))
                {
                    _loops.StartSuggestion(req.RepoId, req.Mode
                        ?? (_config.Get().AutoAdvance ? LoopConfigStore.ModeDrive : LoopConfigStore.ModeSuggest));
                    break;
                }
                // The conversation pin (openspec: fix-loop-conversation-identity, D2):
                // driven kinds arm pinned to the conversation the dock was showing.
                // Fallback for callers that name none: the repo's newest transcript
                // session, resolved ONCE here at arm time — never per tick. A repo
                // with no transcript arms unpinned; the engine locks a pin in before
                // its first send.
                var pin = string.IsNullOrWhiteSpace(req.SessionId)
                    ? NewestSessionId(req.RepoId)
                    : req.SessionId.Trim();
                if (string.Equals(req.Kind, LoopConfigStore.KindGoal, StringComparison.OrdinalIgnoreCase))
                {
                    if (string.IsNullOrWhiteSpace(req.Goal))
                        return BadRequest(new { error = "a goal loop needs a goal" });
                    _loops.StartGoal(req.RepoId, req.Goal.Trim(), req.MaxIterations, req.Mode, pin);
                    break;
                }
                if (string.Equals(req.Kind, LoopConfigStore.KindQueue, StringComparison.OrdinalIgnoreCase))
                {
                    // Queue arm (openspec: queue-based-loop, D8): binds the loop to
                    // a dock tab's LIVE stash. Arming requires the stash to be
                    // non-empty — an empty queue would resolve done on the first
                    // tick, so the arm is almost certainly a mistake.
                    if (string.IsNullOrWhiteSpace(req.TabId))
                        return BadRequest(new { error = "a queue loop needs the tabId whose stash it drains" });
                    var stash = _dock.GetStash(req.TabId.Trim());
                    if (stash is null)
                        return NotFound(new { error = $"unknown dock tab \"{req.TabId}\"" });
                    if (stash.Count == 0)
                        return BadRequest(new { error = "the stash is empty — queue a prompt before arming" });
                    _loops.StartQueue(req.RepoId, req.TabId.Trim(), req.VerifyEnabled,
                        req.MaxIterations, req.Mode, pin);
                    break;
                }
                if (!string.IsNullOrWhiteSpace(req.RecipeId))
                {
                    if (_recipes.Get(req.RecipeId) is not { } recipe)
                        return NotFound(new { error = $"unknown recipe \"{req.RecipeId}\"" });
                    _loops.Start(req.RepoId, recipe.Prompt, recipe.Sentinel,
                        req.MaxIterations ?? recipe.MaxIterations, recipe.Id, recipe.Name, req.Mode, pin);
                    break;
                }
                if (string.IsNullOrWhiteSpace(req.Prompt))
                    return BadRequest(new { error = "a loop needs a prompt to resend" });
                _loops.Start(req.RepoId, req.Prompt.Trim(), req.Sentinel, req.MaxIterations,
                    mode: req.Mode, sessionId: pin);
                break;
            case "mode":
                if (string.IsNullOrWhiteSpace(req.Mode))
                    return BadRequest(new { error = "the mode action needs a mode (suggest | drive)" });
                if (_loops.SetMode(req.RepoId, req.Mode) is null)
                    return NotFound(new { error = "no loop instance on this agent" });
                break;
            case "update":
                _loops.Update(req.RepoId, req.Prompt, req.Sentinel, req.MaxIterations);
                break;
            case "stop":
            case "disarm":
                // One slot per agent → one clear, whatever the kind (revision 2, D8).
                _loops.Stop(req.RepoId);
                break;
            default:
                return BadRequest(new { error = $"unknown action \"{req.Action}\"" });
        }

        return Ok(BuildState());
    }

    // The arm-time pin fallback: the repo's newest transcript session RIGHT NOW.
    // One directory listing, once per arm — the engine never re-resolves this
    // (re-resolving per tick was the conversation-identity bug).
    private string? NewestSessionId(string repoId)
    {
        try
        {
            if (_repos.GetAll().FirstOrDefault(r => r.Id == repoId) is not { } repo) return null;
            var dir = SessionService.ProjectsDirectoryFor(repo.Path);
            if (!Directory.Exists(dir)) return null;
            var newest = new DirectoryInfo(dir).EnumerateFiles("*.jsonl")
                .OrderByDescending(f => f.LastWriteTimeUtc).FirstOrDefault();
            return newest is null ? null : Path.GetFileNameWithoutExtension(newest.Name);
        }
        catch (Exception ex)
        {
            _logger.Error($"[LOOP] newest-session fallback for {repoId} failed: {ex.Message}");
            return null;
        }
    }

    // --- Loop status (read-only, NOT operator-gated) ------------------------

    /// <summary>The one deliberately ungated autopilot read (design §5): per-repo loop
    /// STATUS for dashboard surfaces — state, iterations, stop reason/detail, recipe
    /// name, and the engine's live decision word (fix-suggestion-loop-inert, D3) —
    /// plus the recipe name list for the dock's picker and the suggestion
    /// loop's arming status (openspec: align-dock-loop-model). Session auth still
    /// applies like every other /api route. No prompts, no sentinels, no config, and
    /// no actions here: a loop's outcome stays visible after the gate closes, but
    /// nothing can be armed or read out of autopilot's configuration.</summary>
    [HttpGet("loops")]
    public IActionResult Loops()
    {
        _logger.CountRequest();
        var gateOpen = _operatorGate.Enabled;
        var engineStates = _engine.States().ToDictionary(s => s.RepoId, StringComparer.Ordinal);
        return Ok(new
        {
            gateOpen,
            // Revision 2: ONE unified record per agent — a suggestion instance is a
            // loop like the others, so there are no parallel suggestion fields.
            loops = _loops.All().Select(l =>
            {
                var st = engineStates.TryGetValue(l.RepoId, out var s) ? s : null;
                return new
                {
                    repoId = l.RepoId,
                    // kind + mode + phase are status words (openspec: unify-loop-types) —
                    // the goal/prompt TEXT stays gated, in the detail endpoint below.
                    kind = l.Kind,
                    mode = l.Mode,
                    phase = l.Phase,
                    active = l.Active,
                    status = l.Status,
                    iterationsDone = l.IterationsDone,
                    maxIterations = l.MaxIterations,
                    lastSentAt = l.LastSentAt,
                    stopReason = l.StopReason,
                    stopDetail = l.StopDetail,
                    recipeName = l.RecipeName,
                    // The engine's live decision (fix-suggestion-loop-inert, D3): the
                    // bare decision WORD is a status word like kind/mode/phase and
                    // stays ungated ("off" when the engine holds no state — a closed
                    // gate idles the engine and clears its states). The reason, the
                    // matched label, and the confidence can quote prompt text, so
                    // they follow the pendingPrompt gate rule below.
                    decision = st?.Decision ?? "off",
                    decisionAt = st?.UpdatedAt,
                    decisionReason = gateOpen ? st?.Reason : null,
                    decisionLabel = gateOpen ? st?.Label : null,
                    decisionConfidence = gateOpen ? (double?)st?.Confidence : null,
                    // The one prompt-text exception (revision 2, D9): a suggest-mode
                    // instance's pending prompt, disclosed ONLY while the gate is open —
                    // with the gate closed the engine is idle and pends nothing, so the
                    // closed-gate disclosure surface is unchanged.
                    pendingPrompt = gateOpen ? l.PendingPrompt : null,
                    // Queue kind (openspec: queue-based-loop, D7): COUNTS and the
                    // settings booleans are status words like looping n/cap — the
                    // item texts, the last step text, and the verify template stay
                    // in the gated detail. Remaining is the bound tab's live stash
                    // length (null when the tab is gone — the engine will error the
                    // loop on its next tick).
                    queueTabId = l.Kind == LoopConfigStore.KindQueue ? l.QueueTabId : null,
                    queueRemaining = l.Kind == LoopConfigStore.KindQueue && l.QueueTabId != null
                        ? _dock.GetStash(l.QueueTabId)?.Count
                        : null,
                    queueSent = l.Kind == LoopConfigStore.KindQueue ? (int?)l.QueueSent : null,
                    verifyEnabled = l.Kind == LoopConfigStore.KindQueue ? (bool?)l.VerifyEnabled : null,
                };
            }),
            recipes = _recipes.List().Select(r => new
            {
                id = r.Id,
                name = r.Name,
                maxIterations = r.MaxIterations,
            }),
        });
    }

    /// <summary>The loop debug bundle (openspec: add-loop-debug-handoff): everything
    /// needed to hand a misbehaving loop to an agent, as ONE pasteable JSON object —
    /// gate/kill-switch state, the repo, the full loop record, the engine's in-memory
    /// evidence (busy, decision + hold reason, dedup guards, intercepts, log), the
    /// repo's audit slice, and the on-disk paths where the durable record lives so an
    /// agent on the host can dig deeper. Session-auth but NOT operator-gated — a
    /// loop's terminal state must stay debuggable after the gate closes — so, like
    /// the status projection above, every prompt-bearing field is redacted while the
    /// gate is closed and the marker points at the on-disk files instead.</summary>
    [HttpGet("loops/{repoId}/debug")]
    public IActionResult LoopDebug(string repoId)
    {
        _logger.CountRequest();
        var gateOpen = _operatorGate.Enabled;
        const string redactedMarker =
            "[redacted — operator gate closed; an agent on the host can read the files listed under \"files\"]";
        string? Text(string? s) => gateOpen || s is null ? s : redactedMarker;

        var cfg = _config.Get();
        var repo = _repos.GetAll().FirstOrDefault(r => r.Id == repoId);
        var loop = _loops.Get(repoId);
        var engine = _engine.DebugSnapshot(repoId, repo?.Name);

        return Ok(new
        {
            bundle = "claude-web-loop-debug",
            generatedAt = DateTimeOffset.UtcNow.ToString("O"),
            agentHint = "Debug bundle for one Claude Web autopilot loop. The engine ticks every "
                + $"{engine.TickSeconds:0}s (ClaudeWeb.App/Services/Autopilot/AutopilotService.cs, Tick/Execute); "
                + "kind semantics live in SuggestionLoop/RecipeLoop/GoalLoop/QueueLoop.cs, the store in LoopConfigStore.cs, "
                + "the API in Controllers/AutopilotController.cs. engine.* is in-memory truth at generation time "
                + "(guards explain why a tick held); the paths under files.* are on the harness host and hold the "
                + "durable record. A loop only acts when: gateOpen && killSwitchEnabled && loop.active && !engine.busy "
                + "&& the agent's trailing message differs from the matching guard snippet.",
            gateOpen,
            killSwitchEnabled = cfg.Enabled,
            threshold = cfg.Threshold,
            denyList = gateOpen ? (object)cfg.DenyList : redactedMarker,
            repo = repo is null
                ? null
                : new { id = repo.Id, name = repo.Name, path = repo.Path, exists = repo.Exists },
            loop = loop is null
                ? null
                : new
                {
                    kind = loop.Kind,
                    mode = loop.Mode,
                    phase = loop.Phase,
                    active = loop.Active,
                    status = loop.Status,
                    stopReason = loop.StopReason,
                    stopDetail = loop.StopDetail,
                    iterationsDone = loop.IterationsDone,
                    maxIterations = loop.MaxIterations,
                    lastSentAt = loop.LastSentAt,
                    armedAt = loop.ArmedAt,
                    sentinel = loop.Sentinel,
                    recipeId = loop.RecipeId,
                    recipeName = loop.RecipeName,
                    // The pinned conversation (fix-loop-conversation-identity). It
                    // names a conversation, not prompt text, but stays behind the
                    // gate with the rest of the loop internals (design D1).
                    sessionId = Text(loop.SessionId),
                    prompt = Text(loop.Prompt),
                    goal = Text(loop.Goal),
                    verifyPrompt = Text(loop.VerifyPrompt),
                    pendingPrompt = Text(loop.PendingPrompt),
                    // Queue kind (openspec: queue-based-loop, D7): the last unloaded
                    // step's text and the verify template are prompt text — gated
                    // like the fields above. The binding + counts are status words.
                    queueTabId = loop.QueueTabId,
                    queueVerifyEnabled = loop.Kind == LoopConfigStore.KindQueue ? (bool?)loop.VerifyEnabled : null,
                    queueSent = loop.Kind == LoopConfigStore.KindQueue ? (int?)loop.QueueSent : null,
                    lastStepText = Text(loop.LastStepText),
                    // Sent-history (openspec: queue-loop-visibility, D3): the step
                    // texts that landed this arm — prompt text, so the whole list
                    // collapses to the marker while the gate is closed.
                    queueSentTexts = loop.Kind == LoopConfigStore.KindQueue
                        ? (gateOpen ? (object)loop.QueueSentTexts : redactedMarker)
                        : null,
                    queueVerifyTemplate = loop.Kind == LoopConfigStore.KindQueue
                        ? Text(LoopConfigStore.QueueVerifyTemplate)
                        : null,
                },
            engine = new
            {
                busy = engine.Busy,
                tickSeconds = engine.TickSeconds,
                state = engine.State is null
                    ? null
                    : new
                    {
                        decision = engine.State.Decision,
                        armed = engine.State.Armed,
                        reason = engine.State.Reason,
                        label = Text(engine.State.Label),
                        confidence = engine.State.Confidence,
                        lastMessage = Text(engine.State.LastMessage),
                        updatedAt = engine.State.UpdatedAt,
                    },
                guards = new
                {
                    lastDriveSentSnippet = Text(engine.LastDriveSentSnippet),
                    suggestWaitSnippet = Text(engine.SuggestWaitSnippet),
                    armGenerationSeen = engine.ArmGenerationSeen,
                    lastInterceptedSnippet = Text(engine.LastInterceptedSnippet),
                },
                intercepts = engine.Intercepts.Select(i => new
                {
                    at = i.At,
                    phase = i.Phase,
                    outcome = i.Outcome,
                    label = Text(i.Label),
                    confidence = i.Confidence,
                    snippet = Text(i.Snippet),
                    doneAt = i.DoneAt,
                }),
                log = engine.Log.Select(l => new
                {
                    at = l.At,
                    outcome = l.Outcome,
                    label = Text(l.Label),
                    confidence = l.Confidence,
                }),
            },
            audit = _audit.Recent().Where(a => a.RepoId == repoId).Take(10).Select(a => new
            {
                at = a.At,
                outcome = a.Outcome,
                confidence = a.Confidence,
                prompt = Text(a.Prompt),
                answeredMessage = Text(a.AnsweredMessage),
            }),
            files = new
            {
                loops = _loops.FilePath,
                audit = _audit.FilePath,
                gate = _operatorGate.FilePath,
                transcripts = repo is null ? null : SessionService.ProjectsDirectoryFor(repo.Path),
                dataDir = AppPaths.DataDir,
            },
        });
    }

    /// <summary>The prompt-level counterpart (openspec: unify-loop-types, design D5),
    /// OPERATOR-GATED like every prompt disclosure: full loop records (stored work +
    /// verification prompts, goal text, phase), full recipe bodies, and the goal-loop
    /// composition templates — so the dock can preview byte-identical what the engine
    /// will send before and after arming.</summary>
    [HttpGet("loops/detail")]
    public IActionResult LoopsDetail()
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        return Ok(new
        {
            loops = _loops.All(),
            recipes = _recipes.List(),
            goalTemplates = new
            {
                work = LoopConfigStore.GoalWorkTemplate,
                verify = LoopConfigStore.GoalVerifyTemplate,
            },
            // Queue kind (openspec: queue-based-loop, D4): the between-step
            // verification template, composed at send time with the landed
            // step's text — inspectable here like the goal templates.
            queueVerifyTemplate = LoopConfigStore.QueueVerifyTemplate,
            // The situational briefing every driven send is wrapped with
            // (openspec: loop-agent-briefing, D3) — frame + current rules +
            // composed work-phase preview, so the arm preview shows the exact
            // composition. Same payload as GET /briefing, disclosed here too so
            // one detail fetch reconstructs any send.
            briefing = BriefingPayload(_briefing.Current()),
        });
    }

    // --- Briefing rules (openspec: loop-agent-briefing) ---------------------
    // The dock's always-visible Briefing section reads and edits the GLOBAL rules
    // list here. Deliberately session-auth only, NOT operator-gated (D2b — see the
    // class summary): harness-authored text, and idea capture must work whenever
    // the dock is visible. Composition into actual sends stays gate-fenced.

    public sealed record BriefingRuleReq(string? Id, string? Text, bool Enabled);
    public sealed record BriefingPutReq(List<BriefingRuleReq>? Rules);

    [HttpGet("briefing")]
    public IActionResult Briefing()
    {
        _logger.CountRequest();
        return Ok(BriefingPayload(_briefing.Current()));
    }

    /// <summary>Replaces the whole rules list (the editor always PUTs the full
    /// set); the store archives the outgoing state and bumps the revision.</summary>
    [HttpPut("briefing")]
    public IActionResult PutBriefing([FromBody] BriefingPutReq req)
    {
        _logger.CountRequest();
        if (req?.Rules is null) return BadRequest(new { error = "missing rules" });
        var snap = _briefing.Replace(req.Rules.Select(r => (r.Id, r.Text, r.Enabled)));
        return Ok(BriefingPayload(snap));
    }

    private static object BriefingPayload(BriefingRulesStore.Snapshot snap) => new
    {
        rev = snap.Rev,
        rules = snap.Rules.Select(r => new { id = r.Id, text = r.Text, enabled = r.Enabled }),
        frame = new
        {
            header = LoopConfigStore.BriefingHeader,
            intro = LoopConfigStore.BriefingIntro,
            escalationLine = LoopConfigStore.BriefingEscalationLine,
            contractQueueItem = LoopConfigStore.BriefingContractQueueItem,
            contractSentinelTemplate = LoopConfigStore.BriefingContractSentinelTemplate,
            separator = LoopConfigStore.BriefingSeparator,
            verifyNote = LoopConfigStore.BriefingVerifyNote,
        },
        // The composed work-phase briefing exactly as a goal/recipe send carries
        // it (default sentinel, empty stored text) — the editor's live preview.
        workPreview = LoopConfigStore.ComposeBriefedPrompt(
            LoopConfigStore.KindRecipe, null, LoopConfigStore.DefaultSentinel, "",
            snap.Rules.Where(r => r.Enabled).Select(r => r.Text).ToList()).TrimEnd(),
    };

    // --- Loop recipes (openspec: loop-recipes) ------------------------------
    // CRUD for the named loop templates. Gated like every other action surface.

    public sealed record RecipeRequest(string? Name, string? Prompt, string? Sentinel, int? MaxIterations);

    [HttpPost("recipes")]
    public IActionResult AddRecipe([FromBody] RecipeRequest req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        var recipe = _recipes.Add(req?.Name, req?.Prompt, req?.Sentinel, req?.MaxIterations);
        if (recipe is null) return BadRequest(new { error = "a recipe needs a name and a prompt" });
        return Ok(BuildState());
    }

    [HttpPost("recipes/{id}")]
    public IActionResult UpdateRecipe(string id, [FromBody] RecipeRequest req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        var recipe = _recipes.Update(id, req?.Name, req?.Prompt, req?.Sentinel, req?.MaxIterations);
        if (recipe is null) return NotFound(new { error = $"unknown recipe \"{id}\" (or empty name/prompt)" });
        return Ok(BuildState());
    }

    [HttpDelete("recipes/{id}")]
    public IActionResult DeleteRecipe(string id)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (!_recipes.Delete(id)) return NotFound(new { error = $"unknown recipe \"{id}\"" });
        return Ok(BuildState());
    }

    // --- System tests (understanding.md: real-runner) -----------------------
    // The loop-mode tests, runnable one-click from the System Tests tab. Each
    // spawns a fixed Node/Playwright script against THIS harness; node (and, for
    // the browser tests, Playwright) must be installed on the host or the run
    // reports an honest error. Gated like everything else here.

    /// <summary>GET — every test plus its live/last run state (status, output,
    /// exit code, screenshot readiness).</summary>
    [HttpGet("systests")]
    public IActionResult SysTests()
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        return Ok(new { tests = _systests.Snapshot() });
    }

    /// <summary>POST — start one test by id. Returns immediately; the UI polls
    /// the list endpoint for progress.</summary>
    [HttpPost("systests/{id}/run")]
    public IActionResult RunSysTest(string id)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (!_systests.Start(id)) return NotFound(new { error = $"unknown test \"{id}\"" });
        return Ok(new { tests = _systests.Snapshot() });
    }

    /// <summary>GET — the PNG screenshot a browser test wrote, if it exists.</summary>
    [HttpGet("systests/{id}/artifact")]
    public IActionResult SysTestArtifact(string id)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        var path = _systests.ArtifactPath(id);
        if (path is null || !System.IO.File.Exists(path))
            return NotFound(new { error = "no screenshot yet — run the test first" });
        // no-store so each re-run's fresh screenshot shows on reload.
        Response.Headers["Cache-Control"] = "no-store";
        return PhysicalFile(path, "image/png");
    }

    private object BuildState()
    {
        var cfg = _config.Get();
        return new
        {
            enabled = cfg.Enabled,
            autoAdvance = cfg.AutoAdvance,
            threshold = cfg.Threshold,
            brain = cfg.Brain,
            brainModel = cfg.BrainModel,
            denyList = cfg.DenyList,
            agents = _engine.States(),
            loops = _loops.All(),
            recipes = _recipes.List(),
            log = _engine.Log(),
            intercepts = _engine.Intercepts(),
            audit = _audit.Recent(),
            // The brain's actual label space (the user's editable custom prompts,
            // enriched by mining), so the UI can show exactly what autopilot may send —
            // label + trigger words + base confidence.
            routines = _engine.Routines().Select(r => new
            {
                label = r.Label,
                triggers = r.Triggers,
                baseConfidence = r.BaseConfidence,
            }),
        };
    }
}
