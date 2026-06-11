using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Repository endpoints. The phone user picks one of these; the chosen id
/// is then sent on every other request via the X-Repo-Id header.
///
/// Since plans/projects-tab.md the End User can also register a new project
/// over the web (previously Operator-only via the desktop GUI):
///
///   GET  /api/repos -- [{ id, name, path, exists, isGitRepo, isSelf }]
///   POST /api/repos -- { path, name? } -> { id, name, path, exists, isGitRepo, isSelf }
/// </summary>
[ApiController]
[Route("api/repos")]
public class RepoController : ControllerBase
{
    private readonly RepositoryRegistry _registry;
    private readonly Logger _logger;

    public RepoController(RepositoryRegistry registry, Logger logger)
    {
        _registry = registry;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        var repos = _registry.GetAll()
            .Select(r => new { id = r.Id, name = r.Name, path = r.Path, exists = r.Exists, isGitRepo = r.IsGitRepo, isSelf = r.IsSelf });
        return Ok(repos);
    }

    public record AddRequest(string? Path, string? Name);

    [HttpPost]
    public IActionResult Add([FromBody] AddRequest request)
    {
        _logger.CountRequest();
        if (string.IsNullOrWhiteSpace(request?.Path))
            return BadRequest(new { error = "Path is required" });

        try
        {
            var r = _registry.Add(request.Path, request.Name);
            return Ok(new { id = r.Id, name = r.Name, path = r.Path, exists = r.Exists, isGitRepo = r.IsGitRepo, isSelf = r.IsSelf });
        }
        catch (Exception ex) when (ex is ArgumentException or DirectoryNotFoundException or IOException or UnauthorizedAccessException)
        {
            _logger.Error($"[REPO] Add failed: {ex.Message}");
            return BadRequest(new { error = ex.Message });
        }
    }
}
