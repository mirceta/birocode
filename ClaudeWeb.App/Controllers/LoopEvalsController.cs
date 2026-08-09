using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.LoopEvals;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Loop-evals curation API (Operator-facing, Advanced-mode client surface).
/// Conversations are scoped to the selected repo via X-Repo-Id; commits come from
/// an explicit repo-copy path. Everything is read-only except export, which writes
/// only into the configured examples root — never into its sources (spec: curation
/// never mutates the source repository or the stored session).
/// </summary>
[ApiController]
[Route("api/loop-evals")]
public class LoopEvalsController : ControllerBase
{
    private readonly Logger _logger;
    private readonly RepositoryResolver _repos;
    private readonly CurationService _curation;
    private readonly BundleExporter _exporter;

    public LoopEvalsController(
        Logger logger, RepositoryResolver repos, CurationService curation, BundleExporter exporter)
    {
        _logger = logger;
        _repos = repos;
        _curation = curation;
        _exporter = exporter;
    }

    /// <summary>Stored session conversations of the selected repo, newest first.</summary>
    [HttpGet("conversations")]
    public IActionResult Conversations()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null || !Directory.Exists(repo.Path))
            return NotFound(new { error = "no repository selected" });
        return Ok(_curation.ListConversations(repo.Path));
    }

    /// <summary>Turns of one stored conversation, with stable indices.</summary>
    [HttpGet("conversations/{id}")]
    public IActionResult Turns(string id)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null || !Directory.Exists(repo.Path))
            return NotFound(new { error = "no repository selected" });
        try
        {
            return Ok(_curation.GetTurns(repo.Path, id));
        }
        catch (ArgumentException e)
        {
            return BadRequest(new { error = e.Message });
        }
    }

    /// <summary>Commit history (with files touched) of an Operator-supplied repo copy.</summary>
    [HttpGet("commits")]
    public IActionResult Commits([FromQuery] string? path, [FromQuery] int limit = 200)
    {
        _logger.CountRequest();
        try
        {
            return Ok(_curation.ListCommits(path ?? "", limit));
        }
        catch (ArgumentException e)
        {
            return BadRequest(new { error = e.Message });
        }
        catch (InvalidOperationException e)
        {
            return BadRequest(new { error = e.Message });
        }
    }

    /// <summary>Where exported examples land (for display in the UI).</summary>
    [HttpGet("config")]
    public IActionResult Config()
    {
        _logger.CountRequest();
        return Ok(new { examplesRoot = _exporter.ExamplesRoot });
    }

    /// <summary>Build the golden example bundle from the curated association.</summary>
    [HttpPost("export")]
    public IActionResult Export([FromBody] ExportRequest request)
    {
        _logger.CountRequest();
        try
        {
            return Ok(_exporter.Export(request));
        }
        catch (ArgumentException e)
        {
            return BadRequest(new { error = e.Message });
        }
        catch (InvalidOperationException e)
        {
            return BadRequest(new { error = e.Message });
        }
    }
}
