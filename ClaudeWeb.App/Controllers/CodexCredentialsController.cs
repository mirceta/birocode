using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Write-only control to establish the box's Codex CLI login from a pasted OpenAI
/// API key (openspec codex-real-run):
///   POST /api/codex-credentials  { apiKey } -> { ok, method?, home?, error? }
///
/// Separate from the read-only <see cref="AccountsController"/> because it MUTATES
/// auth state. Always 200 with a typed result — "codex not installed" / "key
/// rejected" are statuses, not HTTP errors. The key is handled only by
/// <see cref="CodexCredentialsService"/> (stdin to codex) and never appears in the
/// response or any log line.
/// </summary>
[ApiController]
[Route("api")]
public sealed class CodexCredentialsController : ControllerBase
{
    private readonly CodexCredentialsService _creds;
    private readonly Logger _logger;

    public CodexCredentialsController(CodexCredentialsService creds, Logger logger)
    {
        _creds = creds;
        _logger = logger;
    }

    public sealed record SetKeyRequest(string? ApiKey);

    [HttpPost("codex-credentials")]
    public IActionResult Set([FromBody] SetKeyRequest? req)
    {
        _logger.CountRequest();
        var r = _creds.SetApiKey(req?.ApiKey);
        return Ok(new { ok = r.Ok, method = r.Method, home = r.Home, error = r.Error });
    }
}
