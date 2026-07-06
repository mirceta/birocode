using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Read-only account-status probes for the dashboard chips
/// (openspec add-account-status). Host-global identities, not project-scoped:
///   GET /api/github-account -- the global GitHub account the box pushes/PRs as
///   GET /api/claude-account -- the Claude subscription login agent runs use
///   GET /api/claude-usage   -- plan usage: 5-hour window + weekly quota
///                              (openspec add-claude-usage)
///
/// All always return 200: "not installed" / "not authenticated" / "usage
/// unavailable" are valid statuses, not HTTP errors, so the frontend renders
/// state from typed fields rather than status codes. The underlying probes are
/// memoised and never log in, log out, switch accounts, or expose a token.
/// </summary>
[ApiController]
[Route("api")]
public class AccountsController : ControllerBase
{
    private readonly GitHubAccountService _github;
    private readonly ClaudeAccountService _claude;
    private readonly ClaudeUsageService _usage;
    private readonly Logger _logger;

    public AccountsController(
        GitHubAccountService github, ClaudeAccountService claude, ClaudeUsageService usage, Logger logger)
    {
        _github = github;
        _claude = claude;
        _usage = usage;
        _logger = logger;
    }

    [HttpGet("github-account")]
    public IActionResult GitHub()
    {
        _logger.CountRequest();
        return Ok(_github.Get());
    }

    [HttpGet("claude-account")]
    public IActionResult Claude()
    {
        _logger.CountRequest();
        return Ok(_claude.Get());
    }

    [HttpGet("claude-usage")]
    public async Task<IActionResult> ClaudeUsage()
    {
        _logger.CountRequest();
        return Ok(await _usage.GetAsync());
    }
}
