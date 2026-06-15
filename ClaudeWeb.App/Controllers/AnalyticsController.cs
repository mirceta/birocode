using ClaudeWeb.Services.Analytics;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Scoreboard / analytics (plans/scoreboard-analytics.md). Global stats folded
/// from the activity ledger — not project-scoped.
///   GET /api/analytics -- { longestRun, peakConcurrency, promptsToday,
///                           totalWorkMs, totalRuns, agents[...] }
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
    public IActionResult Get()
    {
        _logger.CountRequest();
        return Ok(_analytics.Compute());
    }
}
