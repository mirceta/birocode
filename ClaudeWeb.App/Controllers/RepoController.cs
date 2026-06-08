using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Repository list endpoint. The phone user picks one of these; the chosen id
/// is then sent on every other request via the X-Repo-Id header. Repositories
/// are managed by the operator from the desktop GUI (not over the web), so this
/// controller is read-only.
///
///   GET /api/repos -- [{ id, name, path, exists, isGitRepo }]
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
}
