using ClaudeWeb.Models;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Run;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Supports the "App" tab, which previews the product (the app in the opened
/// repo) by iframing a fixed preview port. The harness does not build, start, or
/// stop the product -- you ask Claude in chat to start it on the preview port
/// (detached, bound to 0.0.0.0). This endpoint just tells the frontend which
/// port to point the iframe at.
///
///   GET /api/app/preview -> { port }
/// </summary>
[ApiController]
[Route("api/app")]
public class AppController : ControllerBase
{
    private readonly AppConfig _config;
    private readonly RepositoryResolver _repos;

    public AppController(AppConfig config, RepositoryResolver repos)
    {
        _config = config;
        _repos = repos;
    }

    [HttpGet("preview")]
    public IActionResult Preview() => Ok(new { port = _config.PreviewPort, previewUrl = _config.PreviewUrl });

    /// <summary>
    /// Writes/updates the preview convention in the opened repo's CLAUDE.md so
    /// Claude knows how to start that project on the preview port. Idempotent.
    /// </summary>
    [HttpPost("prepare")]
    public IActionResult Prepare()
    {
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        if (!Directory.Exists(repo.Path)) return BadRequest(new { error = "Repository folder does not exist." });

        try
        {
            var result = PreviewDoc.Prepare(repo.Path, _config.PreviewPort, repo.IsSelf);
            return Ok(new { action = result.Action, file = result.FileName, project = repo.Name });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
