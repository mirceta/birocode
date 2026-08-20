using System.Text.Json;
using ClaudeWeb.Services.Audit;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.StructuredAsk;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Discover local-app exposures in ONE repository on demand (openspec changes
/// discover-local-apps + discover-local-apps-resilient). Triggered from a
/// repository's agent dock; the dock's repo is resolved from the X-Repo-Id header /
/// ?repo= fallback like every other per-repo endpoint. Read-only: it runs a
/// read-only agent scan and never registers or mutates anything, and it does NOT
/// read the registered-apps store as its discovery source.
///
/// Discovery is BACKEND-OWNED (discover-local-apps-resilient): the scan runs as a
/// per-repo job in <see cref="LocalAppDiscoveryJobs"/> on its own cancellation
/// token, so a browser refresh / disconnect never cancels it and the result is
/// retained server-side for reattach. The request's abort token is deliberately
/// NOT threaded into the run.
///
///   GET  /api/local-apps/discover        -- start-or-join the caller's repo scan;
///                                           returns the current job state
///   GET  /api/local-apps/discover/status -- the caller's repo's most recent job
///                                           state, for reattach on (re)load
///   POST /api/local-apps/run             -- start one discovered app (by port) using
///                                           the command the scan extracted, launched
///                                           detached in the app's folder
///   POST /api/local-apps/stop            -- stop a running cached app: port -> owning
///                                           PID resolved LIVE + taskkill /T, guarded
///                                           (repo-scoped finding, never the harness)
///   POST /api/local-apps/restart         -- stop-if-running -> bounded wait for the
///                                           port to free -> detached launch
///   POST /api/local-apps/rebuild         -- start-or-join a disconnect-proof build
///                                           job running the cached buildCommand
///   POST /api/local-apps/backfill-build-commands
///                                        -- targeted agent ask filling buildCommand
///                                           into cached findings that lack one
///   (openspec change local-app-lifecycle-controls)
///
/// The two GETs return { repoId, repoName, status: running|done|error|idle, apps?,
/// error?, startedAt?, finishedAt? }. On a completed scan the body still carries
/// { repoId, repoName, apps } so existing callers stay backward-compatible; each app
/// additionally carries its scanned `startCommand` and a harness-computed live
/// `running` flag (openspec change discover-local-apps-run-controls).
/// </summary>
[ApiController]
[Route("api/local-apps")]
public class LocalAppsController : ControllerBase
{
    private readonly RepositoryResolver _repos;
    private readonly LocalAppDiscoveryJobs _jobs;
    private readonly LocalAppDiscoveryCache _cache;
    private readonly LocalAppRunner _runner;
    private readonly LocalAppBuildJobs _builds;
    private readonly LocalAppBackfillJobs _backfills;
    private readonly RepoEventLog _events;
    private readonly AuditService _audit;
    private readonly Logger _logger;

    public LocalAppsController(RepositoryResolver repos, LocalAppDiscoveryJobs jobs, LocalAppDiscoveryCache cache, LocalAppRunner runner, LocalAppBuildJobs builds, LocalAppBackfillJobs backfills, RepoEventLog events, AuditService audit, Logger logger)
    {
        _repos = repos;
        _jobs = jobs;
        _cache = cache;
        _runner = runner;
        _builds = builds;
        _backfills = backfills;
        _events = events;
        _audit = audit;
        _logger = logger;
    }

    // Start-or-join: registers/joins the repo's background scan and returns the
    // current state immediately. It no longer blocks the run on the request, so the
    // job lives on even if the client aborts.
    [HttpGet("discover")]
    public IActionResult Discover()
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });
        if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
            return BadRequest(new { error = $"Repository working directory not found: '{repo.Path}'." });

        // Agentic audit (openspec add-agent-audit-trail): resolve WHO here — identity
        // is request-scoped — and hand it to the registry, which owns the lifecycle
        // and records the call only if this is an actual start (not a join).
        var actor = _audit.ResolveActor(HttpContext);
        var job = _jobs.StartOrJoin(repo.Id, repo.Name, repo.Path, actor.Display, actor.Ip);
        return Ok(JobBody(repo.Id, repo.Name, job));
    }

    // Reattach: the dock calls this on mount / repo-change (and while polling) to
    // observe a running scan, pick up a result/error that landed while it was away,
    // or learn there is nothing recent (idle) — without starting a new scan.
    // `probe=1` marks an explicit user "Check running" press (vs the background ~5s
    // status poll, which never sets it). Only an explicit probe emits a check event
    // to the Event Console — so the log records the user action without the poll
    // flooding it (openspec agent-dock-event-console).
    [HttpGet("discover/status")]
    public IActionResult Status([FromQuery] bool probe = false)
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });

        var job = _jobs.Get(repo.Id);
        if (probe) EmitCheck(repo.Id, job);
        return Ok(JobBody(repo.Id, repo.Name, job));
    }

    // Load the caller's repo's most recent discovery from the durable on-disk cache
    // WITHOUT running an agent (openspec change cache-discovered-local-apps). Returns
    // the same JobBody shape as /discover/status on a hit — each app's `running` flag
    // recomputed LIVE here, never served from the cache — plus `cachedAt`, so the dock
    // can render register / Run / Check identically to a live scan. On a miss it
    // returns an explicit status:"no-cache" (distinct from idle and from a successful
    // empty done) so the dock can tell the operator to run Discover first. Read-only:
    // no agent, no repo mutation, no registration. Seeding the job registry from the
    // cache lets a later Run/Check resolve its command from this result (still a real
    // scan's command, just persisted).
    [HttpGet("cache")]
    public IActionResult LoadCache()
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });

        var cached = _cache.Load(repo.Id);
        if (cached is null)
            return Ok(new { repoId = repo.Id, repoName = repo.Name, status = "no-cache" });

        // Rehydrate the in-memory job so per-row Run/Check work after a cache load
        // (e.g. following a harness restart, when no live job exists).
        _jobs.SeedFromCache(repo.Id, cached);
        return Ok(CacheBody(repo.Id, repo.Name, cached));
    }

    // Delete ONE cached finding by port — the explicit cache edit introduced by
    // openspec discover-apps-panel (D5): under the union cache a rescan never drops
    // a record, so this is the only removal path. Edits the on-disk cache AND the
    // repo's in-memory job result, so the record can't resurface on the next status
    // poll or be relaunched via Run-by-port. Returns the updated snapshot (same
    // shape as GET /cache) so the panel re-renders without a second fetch; deleting
    // the last record yields a valid cached-EMPTY snapshot, distinct from no-cache.
    // Never touches the scanned repository or any running process.
    [HttpDelete("cache/{port:int}")]
    public IActionResult DeleteCached(int port)
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });

        var (outcome, updated) = _cache.Delete(repo.Id, port);
        if (outcome == CacheDeleteOutcome.NoCache)
            return NotFound(new { error = "No cached discovery for this repository." });
        if (outcome == CacheDeleteOutcome.NotFound)
            return NotFound(new { error = $"No cached app on port {port} for this repository." });

        _jobs.RemoveFromResult(repo.Id, port);
        _events.Emit(repo.Id, "cache", "done", "Cache", $"deleted cached app on :{port}");
        return Ok(CacheBody(repo.Id, repo.Name, updated!));
    }

    // Import externally produced findings into the caller's repo cache (openspec
    // import-discovery-findings): the operator sometimes has ANOTHER agent hunt for
    // apps, and it hands back a JSON array of findings. Accepts either that bare
    // array or the harness's own { apps: [...] } report shape (D1: a bare array is
    // wrapped, then LocalAppExposureReport.Parse is the ONE validator — all-or-
    // nothing, so a single bad finding rejects the whole payload with the cache
    // untouched). A valid payload goes through the SAME union-by-port merge as a
    // finishing scan (Save), each imported finding stamped with the import time;
    // SeedFromCache then updates the in-memory job so Run/Check resolve imported
    // ports — unless a scan is running, which it never clobbers (the scan's own
    // completion merge unions on top of the just-written cache). Returns the updated
    // snapshot (same shape as GET /cache). Never touches the repository's files,
    // never runs the agent, never registers or starts anything.
    [HttpPost("cache/import")]
    [RequestSizeLimit(1_000_000)]
    public async Task<IActionResult> ImportFindings()
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });

        string body;
        using (var reader = new StreamReader(Request.Body))
            body = await reader.ReadToEndAsync();

        LocalAppExposureReport report;
        try
        {
            report = LocalAppExposureReport.ParseImport(body);
        }
        catch (JsonException ex)
        {
            return BadRequest(new { error = $"Invalid findings JSON: {ex.Message}" });
        }

        var merged = _cache.Save(repo.Id, report, DateTimeOffset.UtcNow);
        _jobs.SeedFromCache(repo.Id, merged);
        var n = report.Apps.Count;
        _events.Emit(repo.Id, "cache", "done", "Cache",
            $"imported {n} finding{(n == 1 ? "" : "s")} — merged into cache ({merged.Report.Apps.Count} total)");
        return Ok(CacheBody(repo.Id, repo.Name, merged));
    }

    // Shared cache-snapshot projection (GET /cache hit + DELETE /cache/{port}):
    // the JobBody "done" shape plus fromCache/cachedAt, each app's `running`
    // recomputed LIVE and its own last-discovered time alongside (union cache —
    // rows can come from different scans; openspec discover-apps-panel, D4).
    private object CacheBody(string repoId, string repoName, CachedDiscovery cached) => new
    {
        repoId,
        repoName,
        status = "done",
        apps = cached.Report.Apps.Select(a => Row(repoId, a,
            cached.DiscoveredAtByPort!.TryGetValue(a.Port, out var t) ? t : cached.CachedAt)),
        fromCache = true,
        cachedAt = cached.CachedAt,
        backfill = BackfillBody(repoId),
    };

    // One app row as the panel sees it (openspec local-app-lifecycle-controls):
    // the finding's contract fields (now incl. buildCommand), the LIVE running
    // flag, per-row age, and the row's most recent rebuild-job state — embedded
    // here so the panel's existing status poll carries rebuild progress with no
    // extra endpoint (design D4).
    private object Row(string repoId, LocalAppFinding a, DateTimeOffset? discoveredAt)
    {
        var build = _builds.Get(repoId, a.Port);
        return new
        {
            name = a.Name,
            port = a.Port,
            folder = a.Folder,
            evidence = a.Evidence,
            startCommand = a.StartCommand,
            buildCommand = a.BuildCommand,
            running = _runner.IsListening(a.Port),
            discoveredAt,
            rebuild = build is null ? null : RebuildBody(build),
        };
    }

    // The repo's most recent backfill-job state, for the panel's "Find build
    // commands" affordance (null = never ran since harness start).
    private object? BackfillBody(string repoId)
    {
        var job = _backfills.Get(repoId);
        return job is null ? null : new
        {
            status = job.Status switch
            {
                BackfillStatus.Done => "done",
                BackfillStatus.Error => "error",
                _ => "running",
            },
            asked = job.Asked,
            filled = job.Filled,
            error = job.Error,
            startedAt = job.StartedAt,
            finishedAt = job.FinishedAt,
        };
    }

    // Emit a check boundary event: we probe each discovered app's port (in-process
    // listener snapshot) and report which are live. Best-effort; a check with no
    // completed scan still records that the user probed.
    private void EmitCheck(string repoId, DiscoveryJob? job)
    {
        _events.Emit(repoId, "check", "started", "Check", "probing discovered ports…");
        if (job is null || job.Status != DiscoveryStatus.Done || job.Result is null)
        {
            _events.Emit(repoId, "check", "done", "Check", "no completed discovery to check");
            return;
        }
        var apps = job.Result.Apps;
        var live = apps.Where(a => _runner.IsListening(a.Port)).Select(a => a.Name).ToList();
        var detail = live.Count == 0
            ? $"nothing listening ({apps.Count} app{(apps.Count == 1 ? "" : "s")} checked)"
            : $"{live.Count} of {apps.Count} listening: {string.Join(", ", live)}";
        _events.Emit(repoId, "check", "done", "Check", detail);
    }

    // Start a single discovered app for the caller's repo, by port. The command run
    // is the one DISCOVERY extracted (resolved server-side from this repo's latest
    // scan by port), never a string off the wire — see openspec change
    // discover-local-apps-run-controls. Launched detached in the app's folder so it
    // outlives the request; the dock confirms it came up via the live `running` flag.
    [HttpPost("run")]
    public IActionResult Run([FromBody] RunRequest body)
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });
        if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
            return BadRequest(new { error = $"Repository working directory not found: '{repo.Path}'." });

        var job = _jobs.Get(repo.Id);
        if (job is null || job.Status != DiscoveryStatus.Done || job.Result is null)
            return BadRequest(new { error = "No completed discovery for this repository; run Discover first." });

        var app = job.Result.Apps.FirstOrDefault(a => a.Port == body.Port);
        if (app is null)
            return BadRequest(new { error = $"No discovered app on port {body.Port} for this repository." });
        if (string.IsNullOrWhiteSpace(app.StartCommand))
            return BadRequest(new { error = $"Discovered app '{app.Name}' has no known start command." });

        // The folder is repo-relative (per the discovery contract); resolve it under
        // the repo root and confirm it is inside the repo before launching there.
        var folder = Path.GetFullPath(Path.Combine(repo.Path, app.Folder));
        var repoRoot = Path.GetFullPath(repo.Path);
        if (!folder.StartsWith(repoRoot, StringComparison.OrdinalIgnoreCase) || !Directory.Exists(folder))
            return BadRequest(new { error = $"App folder not found in repository: '{app.Folder}'." });

        // Event Console (openspec agent-dock-event-console): emit at the boundary —
        // we launch detached and do NOT retain the PID, so the truthful terminal is
        // "launch issued", not "running" (liveness is read off the port by Check).
        _events.Emit(repo.Id, "run", "started", $"Run · {app.Name}",
            $"launching on :{app.Port} (detached)…");
        try
        {
            var proc = _runner.Launch(app.StartCommand, folder);
            _events.Emit(repo.Id, "run", "done", $"Run · {app.Name}",
                "launch issued — port liveness is read separately");
            return Ok(new { ok = true, port = app.Port, name = app.Name, command = app.StartCommand, pid = proc.Id });
        }
        catch (Exception ex)
        {
            _events.Emit(repo.Id, "run", "error", $"Run · {app.Name}", ex.Message);
            return BadRequest(new { error = $"Failed to start '{app.Name}': {ex.Message}" });
        }
    }

    // Stop a running cached app by port (openspec local-app-lifecycle-controls).
    // No PID is retained from launches, so the owner is resolved LIVE from the
    // port's listener at stop time — which also makes hand-started apps stoppable.
    // Guards: the port must be a cached/discovered finding of THIS repo (checked
    // before anything is touched), and the resolved PID must not be the harness
    // itself or an ancestor (self-dev: a scan of the harness repo can cache the
    // harness's own port — the kill structurally cannot land on us).
    [HttpPost("stop")]
    public IActionResult Stop([FromBody] RunRequest body)
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });

        var app = ResolveApp(repo.Id, body.Port);
        if (app is null)
            return BadRequest(new { error = $"No discovered app on port {body.Port} for this repository." });

        var (ok, error) = StopCore(repo.Id, app, op: "stop");
        return ok
            ? Ok(new { ok = true, port = app.Port, name = app.Name })
            : BadRequest(new { error });
    }

    // Restart = stop-if-running (same guards) → bounded wait for the port to
    // actually free → detached launch of the cached startCommand. Fails WITHOUT
    // launching when the stop fails or the port stays busy; not running → plain
    // start. Synchronous within the request (~10 s bound) — a human-clicked
    // action, no job machinery (design D5).
    [HttpPost("restart")]
    public IActionResult Restart([FromBody] RunRequest body)
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });
        if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
            return BadRequest(new { error = $"Repository working directory not found: '{repo.Path}'." });

        var app = ResolveApp(repo.Id, body.Port);
        if (app is null)
            return BadRequest(new { error = $"No discovered app on port {body.Port} for this repository." });
        if (string.IsNullOrWhiteSpace(app.StartCommand))
            return BadRequest(new { error = $"Discovered app '{app.Name}' has no known start command." });

        var folder = Path.GetFullPath(Path.Combine(repo.Path, app.Folder));
        var repoRoot = Path.GetFullPath(repo.Path);
        if (!folder.StartsWith(repoRoot, StringComparison.OrdinalIgnoreCase) || !Directory.Exists(folder))
            return BadRequest(new { error = $"App folder not found in repository: '{app.Folder}'." });

        if (_runner.IsListening(app.Port))
        {
            var (stopped, stopError) = StopCore(repo.Id, app, op: "restart");
            if (!stopped)
                return BadRequest(new { error = $"Restart aborted at the stop phase: {stopError}" });
            if (!_runner.WaitForPortFree(app.Port, TimeSpan.FromSeconds(10)))
            {
                _events.Emit(repo.Id, "restart", "error", $"Restart · {app.Name}",
                    $"port :{app.Port} did not free within 10s — not launching a second instance");
                return BadRequest(new { error = $"Port {app.Port} did not free up within 10 seconds; not launching." });
            }
        }
        else
        {
            _events.Emit(repo.Id, "restart", "started", $"Restart · {app.Name}",
                "not running — going straight to launch");
        }

        try
        {
            var proc = _runner.Launch(app.StartCommand, folder);
            _events.Emit(repo.Id, "restart", "done", $"Restart · {app.Name}",
                $"launch issued (pid {proc.Id}) — port liveness is read separately");
            return Ok(new { ok = true, port = app.Port, name = app.Name, command = app.StartCommand, pid = proc.Id });
        }
        catch (Exception ex)
        {
            _events.Emit(repo.Id, "restart", "error", $"Restart · {app.Name}", ex.Message);
            return BadRequest(new { error = $"Failed to relaunch '{app.Name}': {ex.Message}" });
        }
    }

    // Rebuild = start-or-join a disconnect-proof build job running the cached
    // buildCommand in the app's folder (openspec local-app-lifecycle-controls,
    // D4). Deliberately does NOT stop or start the server — restarting into the
    // new build is the operator's separate click. The row's rebuild state rides
    // the normal status projections; this returns the same shape immediately.
    [HttpPost("rebuild")]
    public IActionResult Rebuild([FromBody] RunRequest body)
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });
        if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
            return BadRequest(new { error = $"Repository working directory not found: '{repo.Path}'." });

        var app = ResolveApp(repo.Id, body.Port);
        if (app is null)
            return BadRequest(new { error = $"No discovered app on port {body.Port} for this repository." });
        if (string.IsNullOrWhiteSpace(app.BuildCommand))
            return BadRequest(new { error = $"Discovered app '{app.Name}' has no known build command." });

        var folder = Path.GetFullPath(Path.Combine(repo.Path, app.Folder));
        var repoRoot = Path.GetFullPath(repo.Path);
        if (!folder.StartsWith(repoRoot, StringComparison.OrdinalIgnoreCase) || !Directory.Exists(folder))
            return BadRequest(new { error = $"App folder not found in repository: '{app.Folder}'." });

        var job = _builds.StartOrJoin(repo.Id, app.Port, app.Name, app.BuildCommand, folder);
        return Ok(new { ok = true, port = app.Port, name = app.Name, rebuild = RebuildBody(job) });
    }

    // Backfill build commands into an EXISTING cache without a rescan (openspec
    // local-app-lifecycle-controls, D6): enumerate the cached findings missing a
    // buildCommand and send the targeted ask as a disconnect-proof job. The
    // nothing-to-do outcomes (no cache / nothing missing) short-circuit HERE, so
    // the agent is never invoked for them.
    [HttpPost("backfill-build-commands")]
    public IActionResult BackfillBuildCommands()
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });
        if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
            return BadRequest(new { error = $"Repository working directory not found: '{repo.Path}'." });

        var cached = _cache.Load(repo.Id);
        if (cached is null)
            return Ok(new { status = "nothing-to-do", reason = "no-cache" });

        var missing = cached.Report.Apps.Where(a => string.IsNullOrWhiteSpace(a.BuildCommand)).ToList();
        if (missing.Count == 0)
            return Ok(new { status = "nothing-to-do", reason = "none-missing" });

        _backfills.StartOrJoin(repo.Id, repo.Path, missing);
        return Ok(new { status = "started", backfill = BackfillBody(repo.Id) });
    }

    // Resolve a cached/discovered finding for this repo by port — same trust model
    // as Run (the command/folder come from the repo's own discovery result, never
    // off the wire). Falls back to the on-disk cache (seeding the in-memory job,
    // as GET /cache does) so lifecycle actions work right after a harness restart.
    private LocalAppFinding? ResolveApp(string repoId, int port)
    {
        var job = _jobs.Get(repoId);
        if (job is null || job.Status != DiscoveryStatus.Done || job.Result is null)
        {
            var cached = _cache.Load(repoId);
            if (cached is null) return null;
            job = _jobs.SeedFromCache(repoId, cached);
        }
        return job.Result?.Apps.FirstOrDefault(a => a.Port == port);
    }

    // The stop primitive shared by Stop and Restart's stop phase: resolve the
    // port's live owner, run the guards, kill the tree. `op` names the emitting
    // action so the activity feed attributes phases to what the operator clicked.
    private (bool Ok, string? Error) StopCore(string repoId, LocalAppFinding app, string op)
    {
        string Fail(string error)
        {
            _events.Emit(repoId, op, "error", $"{Cap(op)} · {app.Name}", error);
            return error;
        }

        if (!_runner.IsListening(app.Port))
            return (false, Fail($"Nothing is listening on port {app.Port}."));

        var pid = _runner.ResolveListenerPid(app.Port);
        if (pid is null)
            return (false, Fail($"Could not resolve the process listening on port {app.Port}."));

        // The structural self-guard (design D2): PIDs are ground truth, ports are
        // config. Protects THIS process and whatever hosts it; another harness
        // instance (an isolated test copy) is a legitimate, stoppable product.
        if (_runner.ProtectedPids().Contains(pid.Value))
            return (false, Fail($"Refusing to stop PID {pid} on :{app.Port} — that is the harness itself (or its host process)."));

        _events.Emit(repoId, op, "started", $"{Cap(op)} · {app.Name}",
            $"stopping PID {pid} on :{app.Port} (process tree)…");
        var (ok, detail) = _runner.KillTree(pid.Value);
        if (!ok)
            return (false, Fail($"taskkill failed for PID {pid}: {detail}"));

        if (op == "stop")
            _events.Emit(repoId, op, "done", $"Stop · {app.Name}",
                $"PID {pid} terminated — port liveness is read separately");
        return (true, null);
    }

    private static string Cap(string op) => char.ToUpperInvariant(op[0]) + op[1..];

    // Rebuild-job state as the panel consumes it (shared by the Rebuild response
    // and the per-row projection in Row()).
    private object RebuildBody(BuildJob build) => new
    {
        status = build.Status switch
        {
            BuildStatus.Succeeded => "succeeded",
            BuildStatus.Failed => "failed",
            _ => "running",
        },
        exitCode = build.ExitCode,
        output = build.Output,
        startedAt = build.StartedAt,
        finishedAt = build.FinishedAt,
    };

    public sealed class RunRequest
    {
        public int Port { get; set; }
    }

    // Shared projection. A null job means "no recent discovery" (idle); otherwise we
    // surface running/done/error with the apps list on done. The completed shape
    // keeps { repoId, repoName, apps } so the route stays backward-compatible; each
    // app additionally carries its scanned `startCommand` and a `running` flag the
    // harness computes LIVE here (port liveness), so it is fresh as of this fetch
    // rather than frozen at scan time — openspec change discover-local-apps-run-controls.
    private object JobBody(string repoId, string repoName, DiscoveryJob? job)
    {
        if (job is null)
            return new { repoId, repoName, status = "idle" };

        var status = job.Status switch
        {
            DiscoveryStatus.Done => "done",
            DiscoveryStatus.Error => "error",
            _ => "running",
        };

        return new
        {
            repoId,
            repoName,
            status,
            apps = job.Status == DiscoveryStatus.Done
                // Per-row age (openspec discover-apps-panel, D4): under the union
                // cache a done result mixes scans; falls back to the job's finish
                // time for results that never carried per-port times.
                ? job.Result!.Apps.Select(a => Row(repoId, a,
                    job.DiscoveredAt is not null && job.DiscoveredAt.TryGetValue(a.Port, out var t)
                        ? t
                        : job.FinishedAt))
                : null,
            error = job.Status == DiscoveryStatus.Error ? job.Error : null,
            startedAt = job.StartedAt,
            finishedAt = job.FinishedAt,
            // The cache's latest-scan time (openspec discover-apps-panel): truthful
            // even for a cache-seeded job, whose finishedAt is only the seed time.
            cachedAt = job.CachedAt,
            backfill = BackfillBody(repoId),
        };
    }
}
