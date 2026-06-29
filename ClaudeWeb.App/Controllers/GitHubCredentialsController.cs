using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Write-only control to establish the box's GLOBAL GitHub credential from a pasted
/// Personal Access Token (openspec add-git-identity-surface):
///   POST /api/github-credentials  { token } -> { ok, host?, account?, error? }
///
/// Kept separate from the read-only <see cref="AccountsController"/> precisely because
/// this one MUTATES auth state. Always returns 200 with a typed result — "gh not
/// installed" / "token rejected" are statuses, not HTTP errors. The submitted token is
/// handled only by <see cref="GitHubCredentialsService"/> (stdin to gh) and never
/// appears in the response or any log line.
/// </summary>
[ApiController]
[Route("api")]
public sealed class GitHubCredentialsController : ControllerBase
{
    private readonly GitHubCredentialsService _creds;
    private readonly Logger _logger;

    public GitHubCredentialsController(GitHubCredentialsService creds, Logger logger)
    {
        _creds = creds;
        _logger = logger;
    }

    public sealed record SetTokenRequest(string? Token);

    [HttpPost("github-credentials")]
    public IActionResult Set([FromBody] SetTokenRequest? req)
    {
        _logger.CountRequest();
        var r = _creds.SetToken(req?.Token);
        return Ok(new { ok = r.Ok, host = r.Host, account = r.Account, error = r.Error });
    }
}
