using ClaudeWeb.Services.Expose;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The Exposure check (plans/product-onboarding.md, slice 1; app-aware via
/// plans/expose-check-app-aware.md). Behind the global session+IP gate like
/// everything under /api. Advanced/operator UI.
///   GET /api/expose/check?appId=... -- probe the SELECTED local app of the
///       selected project and return the per-rule checklist. Omit appId to
///       check the default (first) app.
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
    public async Task<IActionResult> Check([FromQuery] string? appId, CancellationToken ct)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        // Resolve which app to check: the requested one (by id), else the default
        // (first) app. Only real (kind:repo) apps are checkable — the synthetic
        // Understanding app isn't a product, so it isn't in EffectiveApps
        // (plans/expose-check-app-aware.md).
        var apps = RepositoryRegistry.EffectiveApps(repo);
        var app = !string.IsNullOrEmpty(appId)
            ? apps.FirstOrDefault(a => string.Equals(a.Id, appId, StringComparison.Ordinal))
            : apps.FirstOrDefault();
        if (!string.IsNullOrEmpty(appId) && app is null)
            return BadRequest(new { error = "Unknown local app for this project." });

        var port = app?.Port ?? repo.LocalPort;
        var checks = await _expose.RunAsync(repo, port, ct);
        var fixPrompt = _expose.BuildFixPrompt(repo, port, checks);
        return Ok(new { repo = repo.Name, appId = app?.Id, appName = app?.Name, localPort = port, checks, fixPrompt });
    }
}
