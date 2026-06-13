using ClaudeWeb.Services.Expose;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The Exposure check (plans/product-onboarding.md, slice 1). Behind the
/// global session+IP gate like everything under /api. Advanced/operator UI.
///   GET /api/expose/check -- probe the SELECTED project's local product and
///                            return the per-rule checklist.
/// </summary>
[ApiController]
[Route("api/expose")]
public class ExposeController : ControllerBase
{
    private readonly ExposeService _expose;
    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public ExposeController(ExposeService expose, RepositoryResolver repos, Logger logger)
    {
        _expose = expose;
        _repos = repos;
        _logger = logger;
    }

    [HttpGet("check")]
    public async Task<IActionResult> Check(CancellationToken ct)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        var checks = await _expose.RunAsync(repo, ct);
        return Ok(new { repo = repo.Name, localPort = repo.LocalPort, checks });
    }
}
