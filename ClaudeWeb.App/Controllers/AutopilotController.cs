using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
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
/// ONE deliberate exception (openspec: adopt-autopilot-loops, design §5):
/// <c>GET /api/autopilot/loops</c> is session-auth only, NOT operator-gated, so the
/// dashboard can still show a loop's terminal state (done/escalated/capped + why)
/// after the operator closes the gate. It discloses loop STATUS, recipe NAMES, and
/// suggestion-arming STATUS only — no prompts, no config, no action surface.
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
    private readonly AutopilotGate _operatorGate;
    private readonly AutopilotAuditLog _audit;
    private readonly SystemTestsService _systests;
    private readonly Logger _logger;

    public AutopilotController(
        AutopilotDiscoveryService discovery, AutopilotService engine,
        AutopilotConfigStore config, LoopConfigStore loops, LoopRecipeStore recipes,
        AutopilotGate operatorGate, AutopilotAuditLog audit,
        SystemTestsService systests, Logger logger)
    {
        _discovery = discovery;
        _engine = engine;
        _config = config;
        _loops = loops;
        _recipes = recipes;
        _operatorGate = operatorGate;
        _audit = audit;
        _systests = systests;
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

    public sealed record ConfigRequest(string? RepoId, bool? Armed, double? Threshold, bool? Enabled, bool? AutoAdvance);

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
        string? Goal, string? Sentinel, int? MaxIterations, string? RecipeId);

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
                if (string.Equals(req.Kind, LoopConfigStore.KindGoal, StringComparison.OrdinalIgnoreCase))
                {
                    if (string.IsNullOrWhiteSpace(req.Goal))
                        return BadRequest(new { error = "a goal loop needs a goal" });
                    _loops.StartGoal(req.RepoId, req.Goal.Trim(), req.MaxIterations, req.Mode);
                    break;
                }
                if (!string.IsNullOrWhiteSpace(req.RecipeId))
                {
                    if (_recipes.Get(req.RecipeId) is not { } recipe)
                        return NotFound(new { error = $"unknown recipe \"{req.RecipeId}\"" });
                    _loops.Start(req.RepoId, recipe.Prompt, recipe.Sentinel,
                        req.MaxIterations ?? recipe.MaxIterations, recipe.Id, recipe.Name, req.Mode);
                    break;
                }
                if (string.IsNullOrWhiteSpace(req.Prompt))
                    return BadRequest(new { error = "a loop needs a prompt to resend" });
                _loops.Start(req.RepoId, req.Prompt.Trim(), req.Sentinel, req.MaxIterations, mode: req.Mode);
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

    // --- Loop status (read-only, NOT operator-gated) ------------------------

    /// <summary>The one deliberately ungated autopilot read (design §5): per-repo loop
    /// STATUS for dashboard surfaces — state, iterations, stop reason/detail, recipe
    /// name — plus the recipe name list for the dock's picker and the suggestion
    /// loop's arming status (openspec: align-dock-loop-model). Session auth still
    /// applies like every other /api route. No prompts, no sentinels, no config, and
    /// no actions here: a loop's outcome stays visible after the gate closes, but
    /// nothing can be armed or read out of autopilot's configuration.</summary>
    [HttpGet("loops")]
    public IActionResult Loops()
    {
        _logger.CountRequest();
        var gateOpen = _operatorGate.Enabled;
        return Ok(new
        {
            gateOpen,
            // Revision 2: ONE unified record per agent — a suggestion instance is a
            // loop like the others, so there are no parallel suggestion fields.
            loops = _loops.All().Select(l => new
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
                // The one prompt-text exception (revision 2, D9): a suggest-mode
                // instance's pending prompt, disclosed ONLY while the gate is open —
                // with the gate closed the engine is idle and pends nothing, so the
                // closed-gate disclosure surface is unchanged.
                pendingPrompt = gateOpen ? l.PendingPrompt : null,
            }),
            recipes = _recipes.List().Select(r => new
            {
                id = r.Id,
                name = r.Name,
                maxIterations = r.MaxIterations,
            }),
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
        });
    }

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
