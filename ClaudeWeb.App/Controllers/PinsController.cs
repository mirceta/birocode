using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Pins;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Per-project Files-tab pins (plans/plan-files-merge.md, slice 2). Scoped to
/// the current project by the X-Repo-Id header (RepositoryResolver), like
/// Files/Notes — one project's pins are never visible under another.
///   GET  /api/pins         -- this project's pinned paths (defaults if unset)
///   POST /api/pins/toggle  -- { path } pin if absent / unpin if present
/// </summary>
[ApiController]
[Route("api/pins")]
public class PinsController : ControllerBase
{
    private readonly PinsService _pins;
    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public PinsController(PinsService pins, RepositoryResolver repos, Logger logger)
    {
        _pins = pins;
        _repos = repos;
        _logger = logger;
    }

    public record PinRequest(string? Path);

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        return Ok(_pins.List(repo.Id));
    }

    [HttpPost("toggle")]
    public IActionResult Toggle([FromBody] PinRequest? request)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        var result = _pins.Toggle(repo.Id, request?.Path);
        if (result is null) return BadRequest(new { error = "A file path is required." });
        return Ok(new { pins = result.Value.Pins, pinned = result.Value.Pinned });
    }
}
