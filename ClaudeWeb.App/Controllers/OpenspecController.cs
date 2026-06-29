using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.OpenspecCockpit;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Read-only OpenSpec Cockpit for the SELECTED repository (openspec change
/// openspec-cockpit-in-harness). The repo is resolved from the X-Repo-Id header /
/// ?repo= fallback like every other per-repo endpoint, so the Cockpit re-scopes
/// when the operator switches repositories — no per-repo copy of the Cockpit code.
/// Every endpoint only reads; no mutating verb is exposed, and drill-in ids are
/// safe-name gated before reaching a command.
///
///   GET /api/openspec/cockpit        -- { repoId, repoName, ready, activeChanges, specs, archived, errors }
///   GET /api/openspec/show?id=…      -- openspec show &lt;id&gt; --json + tasks/proposal/design
///   GET /api/openspec/archived?id=…  -- an archived change parsed from disk
///
/// The one exception to read-only is the explicit, gated setup action
/// (openspec change add-cockpit-openspec-setup):
///   POST /api/openspec/setup         -- { action:"init"|"update" } → runs ONE fixed
///                                       verb in the resolved repo dir, returns the
///                                       command result + refreshed readiness.
/// It takes an action discriminator only — never a command string, args, or path —
/// and init is guarded against clobbering an existing openspec/ tree.
/// </summary>
[ApiController]
[Route("api/openspec")]
public class OpenspecController : ControllerBase
{
    private readonly RepositoryResolver _repos;
    private readonly OpenspecCockpitService _cockpit;
    private readonly Logger _logger;

    public OpenspecController(RepositoryResolver repos, OpenspecCockpitService cockpit, Logger logger)
    {
        _repos = repos;
        _cockpit = cockpit;
        _logger = logger;
    }

    private (string Path, string Id, string Name)? ResolveRepoDir(out IActionResult? error)
    {
        error = null;
        var repo = _repos.Current();
        if (repo is null) { error = NotFound(new { error = "No repository selected." }); return null; }
        if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
        {
            error = BadRequest(new { error = $"Repository working directory not found: '{repo.Path}'." });
            return null;
        }
        return (repo.Path, repo.Id, repo.Name);
    }

    [HttpGet("cockpit")]
    public IActionResult Cockpit()
    {
        _logger.CountRequest();
        var repo = ResolveRepoDir(out var error);
        if (repo is null) return error!;

        var ready = _cockpit.CheckReadiness(repo.Value.Path);
        var readyNode = new { openspecOnPath = ready.OpenspecOnPath, openspecDirPresent = ready.OpenspecDirPresent };

        // Only aggregate when the repo is actually set up — otherwise the CLI just
        // emits noise. The frontend renders an explicit not-ready panel from `ready`.
        if (!ready.OpenspecOnPath || !ready.OpenspecDirPresent)
            return Ok(new
            {
                repoId = repo.Value.Id,
                repoName = repo.Value.Name,
                ready = readyNode,
                activeChanges = Array.Empty<object>(),
                specs = Array.Empty<object>(),
                archived = Array.Empty<object>(),
                errors = new { changes = (string?)null, specs = (string?)null },
            });

        var state = _cockpit.GetCockpit(repo.Value.Path);
        return Ok(new
        {
            repoId = repo.Value.Id,
            repoName = repo.Value.Name,
            ready = readyNode,
            activeChanges = state["activeChanges"],
            specs = state["specs"],
            archived = state["archived"],
            errors = state["errors"],
        });
    }

    [HttpGet("show")]
    public IActionResult Show([FromQuery] string? id)
    {
        _logger.CountRequest();
        if (!OpenspecCockpitService.IsSafeName(id))
            return BadRequest(new { error = $"invalid id \"{id}\" — use lowercase letters, digits and dashes" });
        var repo = ResolveRepoDir(out var error);
        if (repo is null) return error!;
        return Ok(_cockpit.Show(repo.Value.Path, id!));
    }

    [HttpGet("archived")]
    public IActionResult Archived([FromQuery] string? id)
    {
        _logger.CountRequest();
        if (!OpenspecCockpitService.IsSafeName(id))
            return BadRequest(new { error = $"invalid id \"{id}\" — use lowercase letters, digits and dashes" });
        var repo = ResolveRepoDir(out var error);
        if (repo is null) return error!;
        return Ok(_cockpit.ReadArchivedChange(repo.Value.Path, id!));
    }

    public sealed record SetupRequest(string? Action);

    // The cockpit's only state-changing endpoint. The body carries an action
    // discriminator, never a command/args/path: the service maps it to one fixed
    // verb and runs it in the resolved repo working dir. init is no-clobber guarded
    // server-side. Returns the command result + refreshed readiness so the tab can
    // update in place. See the openspec-cockpit spec delta in change
    // add-cockpit-openspec-setup.
    [HttpPost("setup")]
    public IActionResult Setup([FromBody] SetupRequest? body)
    {
        _logger.CountRequest();
        var action = body?.Action?.Trim().ToLowerInvariant();
        if (action != "init" && action != "update")
            return BadRequest(new { error = $"invalid action \"{body?.Action}\" — must be \"init\" or \"update\"" });

        var repo = ResolveRepoDir(out var error);
        if (repo is null) return error!;

        var r = _cockpit.RunSetup(repo.Value.Path, action);
        return Ok(new
        {
            ok = r.Ok,
            action = r.Action,
            exitCode = r.ExitCode,
            stdout = r.StdOut,
            stderr = r.StdErr,
            alreadyInitialized = r.AlreadyInitialized,
            ready = new { openspecOnPath = r.Ready.OpenspecOnPath, openspecDirPresent = r.Ready.OpenspecDirPresent },
        });
    }
}
