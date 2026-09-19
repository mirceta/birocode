using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Recurring;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>Recurring tasks (openspec recurring-tasks): the Management App's Recurring tab.
/// Reading is open to the signed-in Operator (instructions are withheld while the autopilot
/// gate is closed, the loop console's rule); everything that could cause a send — create,
/// edit, resume, run now — answers 403 while the gate is closed. Pause, stop and delete only
/// ever REDUCE automation, so they work with the gate closed.</summary>
[ApiController]
[Route("api/recurring")]
public sealed class RecurringController : ControllerBase
{
    private readonly RecurringTaskStore _store;
    private readonly RecurringRunLog _log;
    private readonly RecurringEngine _engine;
    private readonly AutopilotGate _gate;
    private readonly Logger _logger;

    public RecurringController(RecurringTaskStore store, RecurringRunLog log, RecurringEngine engine, AutopilotGate gate, Logger logger)
    {
        _store = store; _log = log; _engine = engine; _gate = gate; _logger = logger;
    }

    private IActionResult? GateClosed() =>
        _gate.Enabled ? null : StatusCode(StatusCodes.Status403Forbidden, new { error = "Autopilot is disabled by the operator.", gate = "operator-off" });

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    [HttpGet]
    public IActionResult Board()
    {
        _logger.CountRequest();
        return Ok(_engine.Board());
    }

    [HttpGet("{id}/runs")]
    public IActionResult Runs(string id, [FromQuery] int limit = 50, [FromQuery] long? before = null)
    {
        _logger.CountRequest();
        if (_store.Get(id) is null) return NotFound(new { error = "no such recurring task" });
        return Ok(new { runs = _log.Runs(id, limit, before).Select(RecurringEngine.RunView), total = _log.Count(id) });
    }

    public sealed record TaskRequest(string? Title, string? SourceId, string? RepoId, string? Instructions,
        ScheduleSpec? Schedule, RunSpec? Run, PolicySpec? Policy);

    [HttpPost]
    public IActionResult Create([FromBody] TaskRequest? req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (req is null) return BadRequest(new { error = "a body is required" });
        if (Validate(req, creating: true) is { } bad) return BadRequest(new { error = bad });
        var now = Now();
        var t = new RecurringTask(Guid.NewGuid().ToString("n"), req.Title!.Trim(), CleanSource(req.SourceId), req.RepoId!.Trim(), req.Instructions!.Trim(),
            req.Schedule!.Normalized(), CleanRun(req.Run ?? new RunSpec()), CleanPolicy(req.Policy ?? new PolicySpec()),
            Enabled: true, PausedReason: null, AnchorAt: now, LastHandledDueAt: null, RunCount: 0, CreatedAt: now, UpdatedAt: now, CreatedBy: "operator");
        _store.Add(t);
        _logger.Info($"[RECURRING] created \"{t.Title}\" ({Recurrence.Words(t.Schedule.ToSchedule())}, {t.Run.Mode}) for {CleanSource(req.SourceId) ?? "self"}|{t.RepoId}");
        return Ok(_engine.Board());
    }

    [HttpPatch("{id}")]
    public IActionResult Edit(string id, [FromBody] TaskRequest? req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (req is null) return BadRequest(new { error = "a body is required" });
        if (_store.Get(id) is null) return NotFound(new { error = "no such recurring task" });
        if (Validate(req, creating: false) is { } bad) return BadRequest(new { error = bad });
        var now = Now();
        _store.Update(id, t =>
        {
            var schedule = req.Schedule?.Normalized();
            var rescheduled = schedule is not null && !ScheduleEquals(schedule, t.Schedule);
            return t with
            {
                Title = req.Title?.Trim() ?? t.Title,
                SourceId = req.RepoId is null ? t.SourceId : CleanSource(req.SourceId),
                RepoId = req.RepoId?.Trim() ?? t.RepoId,
                Instructions = req.Instructions?.Trim() ?? t.Instructions,
                Schedule = schedule ?? t.Schedule,
                Run = req.Run is null ? t.Run : CleanRun(req.Run),
                Policy = req.Policy is null ? t.Policy : CleanPolicy(req.Policy),
                // A new schedule is a new grid: it starts now, and nothing of the old one is owed.
                AnchorAt = rescheduled ? now : t.AnchorAt,
                LastHandledDueAt = rescheduled ? null : t.LastHandledDueAt,
                UpdatedAt = now,
            };
        });
        return Ok(_engine.Board());
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        if (_store.Get(id) is null) return NotFound(new { error = "no such recurring task" });
        if (_log.RunningOf(id) is not null) return Conflict(new { error = "a run of this task is in progress — stop it first" });
        _store.Remove(id);
        _log.RemoveTask(id);
        return Ok(_engine.Board());
    }

    [HttpPost("{id}/pause")]
    public IActionResult Pause(string id)
    {
        _logger.CountRequest();
        var t = _store.Update(id, x => x with { Enabled = false, PausedReason = "operator", UpdatedAt = Now() });
        return t is null ? NotFound(new { error = "no such recurring task" }) : Ok(_engine.Board());
    }

    [HttpPost("{id}/resume")]
    public IActionResult Resume(string id)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        var now = Now();
        // Resuming re-anchors: nothing that came due while it was paused is owed.
        var t = _store.Update(id, x => x with { Enabled = true, PausedReason = null, AnchorAt = now, LastHandledDueAt = null, UpdatedAt = now });
        return t is null ? NotFound(new { error = "no such recurring task" }) : Ok(_engine.Board());
    }

    [HttpPost("{id}/run")]
    public IActionResult RunNow(string id)
    {
        _logger.CountRequest();
        var r = _engine.RunNow(id);
        return r.Ok ? Ok(_engine.Board()) : StatusCode(r.Http, new { error = r.Detail, gate = r.Http == 403 ? "operator-off" : null });
    }

    [HttpPost("{id}/stop")]
    public IActionResult Stop(string id)
    {
        _logger.CountRequest();
        var r = _engine.StopRun(id);
        if (!r.Ok) return StatusCode(r.Http, new { error = r.Detail });
        _engine.Tick();   // close the run now rather than on the next 10 s tick
        return Ok(_engine.Board());
    }

    // ── validation ──────────────────────────────────────────────────────────────────────

    private static string? Validate(TaskRequest r, bool creating)
    {
        if (creating || r.Title is not null)
        {
            if (string.IsNullOrWhiteSpace(r.Title)) return "a title is required";
            if (r.Title.Trim().Length > 200) return "the title must be at most 200 characters";
        }
        if (creating || r.RepoId is not null)
            if (string.IsNullOrWhiteSpace(r.RepoId)) return "a repo agent must be assigned";
        if (creating || r.Instructions is not null)
        {
            if (string.IsNullOrWhiteSpace(r.Instructions)) return "instructions are required — they are the goal of every run";
            if (r.Instructions.Length > 20_000) return "the instructions must be at most 20 000 characters";
        }
        if (creating || r.Schedule is not null)
            if (ScheduleSpec.Validate(r.Schedule) is { } bad) return bad;
        if (r.Run is not null)
        {
            var mode = (r.Run.Mode ?? "").Trim().ToLowerInvariant();
            if (mode is not (Recurrence.ModeGoal or Recurrence.ModeSingle)) return "run mode must be goal or single";
            if (r.Run.MaxTurns is < 2 or > 30) return "the turn budget must be 2–30";
        }
        if (r.Policy is not null && r.Policy.SkipAbovePlanUsage is < 0 or > 100) return "the plan-usage limit must be 0–100 (0 = off)";
        return null;
    }

    private static string? CleanSource(string? s) =>
        string.IsNullOrWhiteSpace(s) || s.Trim() == Services.Events.CollectorService.SelfId ? null : s.Trim();
    private static RunSpec CleanRun(RunSpec r) => new((r.Mode ?? Recurrence.ModeGoal).Trim().ToLowerInvariant(), Math.Clamp(r.MaxTurns, 2, 30));
    private static PolicySpec CleanPolicy(PolicySpec p) => p with { SkipAbovePlanUsage = Math.Clamp(p.SkipAbovePlanUsage, 0, 100) };
    private static bool ScheduleEquals(ScheduleSpec a, ScheduleSpec b) =>
        a.Kind == b.Kind && a.EveryMinutes == b.EveryMinutes && a.At == b.At
        && (a.Days ?? new()).OrderBy(d => d).SequenceEqual((b.Days ?? new()).OrderBy(d => d));
}
