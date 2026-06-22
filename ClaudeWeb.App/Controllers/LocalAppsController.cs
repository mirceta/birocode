using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.StructuredAsk;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Discover local-app exposures in ONE repository on demand (openspec change
/// discover-local-apps). Triggered from a repository's agent dock; the dock's repo
/// is resolved from the X-Repo-Id header / ?repo= fallback like every other
/// per-repo endpoint. Read-only: it runs a read-only agent scan and never registers
/// or mutates anything, and it does NOT read the registered-apps store as its
/// discovery source.
///
///   GET /api/local-apps/discover   -- discover the caller's repo; returns
///                                     { repoId, repoName, apps: [{ name, port, folder, evidence }] }
/// </summary>
[ApiController]
[Route("api/local-apps")]
public class LocalAppsController : ControllerBase
{
    private readonly RepositoryResolver _repos;
    private readonly LocalAppDiscoveryAsk _discovery;
    private readonly Logger _logger;

    public LocalAppsController(RepositoryResolver repos, LocalAppDiscoveryAsk discovery, Logger logger)
    {
        _repos = repos;
        _discovery = discovery;
        _logger = logger;
    }

    [HttpGet("discover")]
    public async Task<IActionResult> Discover(CancellationToken ct)
    {
        _logger.CountRequest();

        var repo = _repos.Current();
        if (repo is null)
            return NotFound(new { error = "No repository selected." });
        if (string.IsNullOrWhiteSpace(repo.Path) || !Directory.Exists(repo.Path))
            return BadRequest(new { error = $"Repository working directory not found: '{repo.Path}'." });

        var result = await _discovery.DiscoverAsync(repo.Path, ct);
        if (!result.Success)
            return StatusCode(StatusCodes.Status502BadGateway,
                new { repoId = repo.Id, repoName = repo.Name, error = result.Error });

        return Ok(new
        {
            repoId = repo.Id,
            repoName = repo.Name,
            apps = result.Report!.Apps.Select(a => new
            {
                name = a.Name,
                port = a.Port,
                folder = a.Folder,
                evidence = a.Evidence,
            }),
        });
    }
}
