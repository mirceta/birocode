using ClaudeWeb.Services.Analytics;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Scoreboard / analytics (plans/scoreboard-analytics.md). Global stats folded
/// from the activity ledger — not project-scoped.
///   GET /api/analytics?window=today|7d|all -- window-scoped scalars
///       (prompts, peakConcurrency, longestRun, totalWorkMs, totalCostUsd) plus
///       the concurrency-over-time series, a 7-day daily rollup, and a per-agent
///       leaderboard. `window` defaults to "all".
/// </summary>
[ApiController]
[Route("api/analytics")]
public class AnalyticsController : ControllerBase
{
    private readonly AnalyticsService _analytics;
    private readonly Logger _logger;

    public AnalyticsController(AnalyticsService analytics, Logger logger)
    {
        _analytics = analytics;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult Get([FromQuery] string? window)
    {
        _logger.CountRequest();
        return Ok(_analytics.Compute(window));
    }
}
