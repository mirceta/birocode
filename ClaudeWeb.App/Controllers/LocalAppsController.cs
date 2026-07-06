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
    private readonly LocalAppRunner _runner;
    private readonly RepoEventLog _events;
    private readonly AuditService _audit;
    private readonly Logger _logger;

    public LocalAppsController(RepositoryResolver repos, LocalAppDiscoveryJobs jobs, LocalAppRunner runner, RepoEventLog events, AuditService audit, Logger logger)
    {
        _repos = repos;
        _jobs = jobs;
        _runner = runner;
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
                ? job.Result!.Apps.Select(a => new
                {
                    name = a.Name,
                    port = a.Port,
                    folder = a.Folder,
                    evidence = a.Evidence,
                    startCommand = a.StartCommand,
                    running = _runner.IsListening(a.Port),
                })
                : null,
            error = job.Status == DiscoveryStatus.Error ? job.Error : null,
            startedAt = job.StartedAt,
            finishedAt = job.FinishedAt,
        };
    }
}
