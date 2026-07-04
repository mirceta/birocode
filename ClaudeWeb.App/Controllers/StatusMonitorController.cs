using ClaudeWeb.Services.StatusMonitor;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The status-monitor wallboard's data endpoints (openspec changes
/// status-monitor-dashboard, github-pr-browser):
///   GET /api/status-monitor/board -> { now, darkThresholdMs, fleet, attention, github }
///   GET /api/status-monitor/github/prs?repo=owner/name        -> open-PR list panel
///   GET /api/status-monitor/github/pr?repo=owner/name&number=N -> PR detail panel
/// One board round-trip paints the whole page; the github/* pair serves the
/// click-driven drill-down. All derivation is server-side — the page
/// (events-app/index.html) is a dumb renderer. Read-only by design: the board is
/// not a control surface in v1. The <c>repo</c> parameter is allow-listed against
/// the derived registered-repo list (404 otherwise, GitHub never contacted);
/// GitHub failures come back as ok:false payloads, not 5xx, so a panel degrades
/// without tripping generic error handling.
/// </summary>
[ApiController]
[Route("api/status-monitor")]
public sealed class StatusMonitorController : ControllerBase
{
    private readonly StatusBoardService _board;
    private readonly GitHubStatusService _github;
    private readonly GitHubPrService _prs;

    public StatusMonitorController(StatusBoardService board, GitHubStatusService github, GitHubPrService prs)
    {
        _board = board;
        _github = github;
        _prs = prs;
    }

    [HttpGet("board")]
    public async Task<IActionResult> Board(CancellationToken ct)
        => Ok(await _board.BuildAsync(ct));

    [HttpGet("github/prs")]
    public async Task<IActionResult> OpenPrs([FromQuery] string? repo, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(repo) || !_github.IsKnownRepo(repo)) return NotFound();
        return Ok(await _prs.GetOpenPrsAsync(repo, ct));
    }

    [HttpGet("github/pr")]
    public async Task<IActionResult> PrDetail([FromQuery] string? repo, [FromQuery] int number, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(repo) || !_github.IsKnownRepo(repo)) return NotFound();
        if (number <= 0) return NotFound();
        return Ok(await _prs.GetPrAsync(repo, number, ct));
    }
}
