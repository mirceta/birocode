using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Recurring;

/// <summary>
/// The ONE way a recurring card is created, edited, paused, resumed or deleted (fleet task
/// 933709ea): the Recurring tab's controller and the arch agent's tools both call this, so
/// there is one store, one validation and one gate rule. Prompt-driven cards (the
/// scheduler arms runs) obey the Operator's autopilot gate on create / edit / resume —
/// anything that could cause a send answers 403 while the gate is closed; pause and delete
/// only reduce automation and always work. Tracking-only cards never send anything, so the
/// gate does not apply to them.
/// </summary>
public sealed class RecurringCommands
{
    public const int MaxTitle = 200, MaxInstructions = 20_000, MaxDescription = 4_000;

    /// <summary>What a create or edit carries. Every field optional on an edit (null = keep);
    /// on a create the kind decides what is required: prompt = title, agent, instructions,
    /// schedule; tracking = title, agent, description. <see cref="Enabled"/> on an edit is
    /// pause (false) / resume (true — re-anchors the schedule).</summary>
    public sealed record TaskRequest(
        string? Kind = null, string? Title = null, string? SourceId = null, string? RepoId = null, string? Instructions = null,
        ScheduleSpec? Schedule = null, RunSpec? Run = null, PolicySpec? Policy = null,
        string? Description = null, string? AppId = null, bool? Enabled = null);

    public sealed record Result(bool Ok, int Http, string? Error, RecurringTask? Task)
    {
        public static Result Fine(RecurringTask t) => new(true, 200, null, t);
        public static Result Fail(int http, string error) => new(false, http, error, null);
    }

    public const string GateClosedError = "Autopilot is disabled by the operator.";

    private readonly RecurringTaskStore _store;
    private readonly RecurringRunLog _log;
    private readonly Func<bool> _gateOpen;
    private readonly Func<long> _now;
    private readonly Logger? _logger;

    public RecurringCommands(RecurringTaskStore store, RecurringRunLog log, Func<bool> gateOpen, Func<long>? now = null, Logger? logger = null)
    {
        _store = store; _log = log; _gateOpen = gateOpen;
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _logger = logger;
    }

    public RecurringTask? Get(string id) => _store.Get(id);
    public IReadOnlyList<RecurringTask> All() => _store.All();

    public Result Create(TaskRequest req, string createdBy)
    {
        var kind = RecurringTask.NormalizeKind(req.Kind);
        if (kind == RecurringTask.KindPrompt && !_gateOpen()) return Result.Fail(403, GateClosedError);
        if (Validate(req, kind, creating: true) is { } bad) return Result.Fail(400, bad);
        var now = _now();
        var tracking = kind == RecurringTask.KindTracking;
        var t = new RecurringTask(Guid.NewGuid().ToString("n"), req.Title!.Trim(), CleanSource(req.SourceId), req.RepoId!.Trim(),
            tracking ? "" : req.Instructions!.Trim(),
            tracking ? new ScheduleSpec("none") : req.Schedule!.Normalized(),
            CleanRun(req.Run ?? new RunSpec()), CleanPolicy(req.Policy ?? new PolicySpec()),
            Enabled: req.Enabled ?? true, PausedReason: req.Enabled == false ? "operator" : null, AnchorAt: now, LastHandledDueAt: null, RunCount: 0,
            CreatedAt: now, UpdatedAt: now, CreatedBy: createdBy,
            Kind: kind, Description: tracking ? req.Description!.Trim() : CleanOptional(req.Description), AppId: CleanOptional(req.AppId));
        _store.Add(t);
        _logger?.Info(tracking
            ? $"[RECURRING] {createdBy} created tracking-only card \"{t.Title}\" for {t.SourceId ?? "self"}|{t.RepoId}{(t.AppId is null ? "" : $" (app {t.AppId})")}"
            : $"[RECURRING] {createdBy} created \"{t.Title}\" ({Recurrence.Words(t.Schedule.ToSchedule())}, {t.Run.Mode}) for {t.SourceId ?? "self"}|{t.RepoId}");
        return Result.Fine(t);
    }

    public Result Edit(string id, TaskRequest req, string by)
    {
        var existing = _store.Get(id);
        if (existing is null) return Result.Fail(404, "no such recurring task");
        if (req.Kind is not null && RecurringTask.NormalizeKind(req.Kind) != existing.Kind)
            return Result.Fail(400, "the kind of a card cannot be changed — delete it and create the other kind");
        // Anything that could cause a send on a prompt card needs the gate: an edit, or resuming.
        if (!existing.IsTracking && !_gateOpen()) return Result.Fail(403, GateClosedError);
        if (Validate(req, existing.Kind, creating: false) is { } bad) return Result.Fail(400, bad);
        var now = _now();
        var t = _store.Update(id, t =>
        {
            var schedule = existing.IsTracking ? null : req.Schedule?.Normalized();
            var rescheduled = schedule is not null && !ScheduleEquals(schedule, t.Schedule);
            var resumed = req.Enabled == true && !t.Enabled;
            return t with
            {
                Title = req.Title?.Trim() ?? t.Title,
                SourceId = req.RepoId is null ? t.SourceId : CleanSource(req.SourceId),
                RepoId = req.RepoId?.Trim() ?? t.RepoId,
                Instructions = existing.IsTracking ? t.Instructions : req.Instructions?.Trim() ?? t.Instructions,
                Schedule = schedule ?? t.Schedule,
                Run = req.Run is null || existing.IsTracking ? t.Run : CleanRun(req.Run),
                Policy = req.Policy is null || existing.IsTracking ? t.Policy : CleanPolicy(req.Policy),
                Description = req.Description is null ? t.Description : CleanOptional(req.Description),
                AppId = req.AppId is null ? t.AppId : CleanOptional(req.AppId),
                Enabled = req.Enabled ?? t.Enabled,
                PausedReason = req.Enabled is null ? t.PausedReason : req.Enabled == true ? null : "operator",
                // A new schedule is a new grid, and resuming re-anchors: nothing of the old one is owed.
                AnchorAt = rescheduled || resumed ? now : t.AnchorAt,
                LastHandledDueAt = rescheduled || resumed ? null : t.LastHandledDueAt,
                UpdatedAt = now,
            };
        })!;
        _logger?.Info($"[RECURRING] {by} edited \"{t.Title}\"");
        return Result.Fine(t);
    }

    public Result Pause(string id, string by)
    {
        var t = _store.Update(id, x => x with { Enabled = false, PausedReason = "operator", UpdatedAt = _now() });
        if (t is null) return Result.Fail(404, "no such recurring task");
        _logger?.Info($"[RECURRING] {by} paused \"{t.Title}\"");
        return Result.Fine(t);
    }

    public Result Resume(string id, string by)
    {
        var existing = _store.Get(id);
        if (existing is null) return Result.Fail(404, "no such recurring task");
        if (!existing.IsTracking && !_gateOpen()) return Result.Fail(403, GateClosedError);
        var now = _now();
        var t = _store.Update(id, x => x with { Enabled = true, PausedReason = null, AnchorAt = now, LastHandledDueAt = null, UpdatedAt = now })!;
        _logger?.Info($"[RECURRING] {by} resumed \"{t.Title}\"");
        return Result.Fine(t);
    }

    public Result Delete(string id, string by)
    {
        var t = _store.Get(id);
        if (t is null) return Result.Fail(404, "no such recurring task");
        if (_log.RunningOf(id) is not null) return Result.Fail(409, "a run of this task is in progress — stop it first");
        _store.Remove(id);
        _log.RemoveTask(id);
        _logger?.Info($"[RECURRING] {by} deleted \"{t.Title}\"");
        return Result.Fine(t);
    }

    // ── validation ──────────────────────────────────────────────────────────────────────

    public static string? Validate(TaskRequest r, string kind, bool creating)
    {
        var tracking = kind == RecurringTask.KindTracking;
        if (creating || r.Title is not null)
        {
            if (string.IsNullOrWhiteSpace(r.Title)) return "a title is required";
            if (r.Title.Trim().Length > MaxTitle) return $"the title must be at most {MaxTitle} characters";
        }
        if (creating || r.RepoId is not null)
            if (string.IsNullOrWhiteSpace(r.RepoId)) return "a repo agent must be assigned";
        if (tracking)
        {
            if (creating || r.Description is not null)
            {
                if (string.IsNullOrWhiteSpace(r.Description)) return "a description is required — what runs inside the agent's app";
                if (r.Description.Length > MaxDescription) return $"the description must be at most {MaxDescription} characters";
            }
            if (r.AppId is { Length: > 0 } app && app.Trim().IndexOfAny(new[] { '/', '\\', ' ', '?', '#' }) >= 0) return "appId must be a plain local-app id (no slashes or spaces)";
            return null;
        }
        if (creating || r.Instructions is not null)
        {
            if (string.IsNullOrWhiteSpace(r.Instructions)) return "instructions are required — they are the goal of every run";
            if (r.Instructions.Length > MaxInstructions) return $"the instructions must be at most {MaxInstructions} characters";
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
        string.IsNullOrWhiteSpace(s) || s.Trim() == Events.CollectorService.SelfId ? null : s.Trim();
    private static string? CleanOptional(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    private static RunSpec CleanRun(RunSpec r) => new((r.Mode ?? Recurrence.ModeGoal).Trim().ToLowerInvariant(), Math.Clamp(r.MaxTurns, 2, 30));
    private static PolicySpec CleanPolicy(PolicySpec p) => p with { SkipAbovePlanUsage = Math.Clamp(p.SkipAbovePlanUsage, 0, 100) };
    private static bool ScheduleEquals(ScheduleSpec a, ScheduleSpec b) =>
        a.Kind == b.Kind && a.EveryMinutes == b.EveryMinutes && a.At == b.At
        && (a.Days ?? new()).OrderBy(d => d).SequenceEqual((b.Days ?? new()).OrderBy(d => d));
}
