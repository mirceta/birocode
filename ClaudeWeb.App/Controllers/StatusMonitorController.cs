using ClaudeWeb.Services.StatusMonitor;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The status-monitor wallboard's single data endpoint (openspec change
/// status-monitor-dashboard):
///   GET /api/status-monitor/board -> { now, darkThresholdMs, fleet, attention, github }
/// One round-trip paints the whole board; all derivation (attention membership,
/// ordering, staleness math, GitHub caching) is server-side in
/// <see cref="StatusBoardService"/> / <see cref="GitHubStatusService"/> — the page
/// (events-app/board.html) is a dumb renderer. Read-only by design: the board is
/// not a control surface in v1.
/// </summary>
[ApiController]
[Route("api/status-monitor")]
public sealed class StatusMonitorController : ControllerBase
{
    private readonly StatusBoardService _board;

    public StatusMonitorController(StatusBoardService board) => _board = board;

    [HttpGet("board")]
    public async Task<IActionResult> Board(CancellationToken ct)
        => Ok(await _board.BuildAsync(ct));
}
