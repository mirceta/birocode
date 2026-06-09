using ClaudeWeb.Services.Git;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Snapshot/restore endpoints (M3). Auto-discovered by AddControllers().
///   POST /api/save             -- git add -A + commit
///   GET  /api/history          -- git log (last 50)
///   POST /api/history/restore  -- git checkout &lt;hash&gt; -- .
/// </summary>
[ApiController]
[Route("api")]
public class GitController : ControllerBase
{
    private readonly GitService _git;
    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public GitController(GitService git, RepositoryResolver repos, Logger logger)
    {
        _git = git;
        _repos = repos;
        _logger = logger;
    }

    public sealed record SaveRequest(string? Message);
    public sealed record RestoreRequest(string? Hash);

    /// <summary>POST /api/save -- stage everything and commit.</summary>
    [HttpPost("save")]
    public IActionResult Save([FromBody] SaveRequest? body)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var result = _git.Save(repo.Path, body?.Message);
            if (result.NoChanges)
                return Ok(new { noChanges = true });

            return Ok(new { hash = result.Hash, message = result.Message });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Save failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/branch -- current git branch name.</summary>
    [HttpGet("branch")]
    public IActionResult Branch()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var branch = _git.CurrentBranch(repo.Path);
            return Ok(new { branch });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Branch failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/history -- recent commits, newest first.</summary>
    [HttpGet("history")]
    public IActionResult History()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var entries = _git.History(repo.Path)
                .Select(e => new { hash = e.Hash, date = e.Date, message = e.Message });
            return Ok(entries);
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] History failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>POST /api/history/restore -- restore files to a commit (HEAD unchanged).</summary>
    [HttpPost("history/restore")]
    public IActionResult Restore([FromBody] RestoreRequest? body)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var hash = _git.Restore(repo.Path, body?.Hash);
            return Ok(new { restored = true, hash });
        }
        catch (ArgumentException ex)
        {
            _logger.Error($"[GIT] Restore rejected: {ex.Message}");
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Restore failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
