using System.Linq;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Traffic;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Read the harness throughput counters (openspec change traffic-monitor).
/// Auto-discovered by AddControllers(). The Dashboard's Traffic panel polls
/// this at the dock cadence.
///
///   GET /api/traffic
///     -> { now: { reqPerSec, bytesInPerSec, bytesOutPerSec },   // 10s window
///          avg60: { ... },                                      // 60s window
///          history: [{ requests, bytesOut } x 60],              // 1s slots, oldest first
///          buckets: [{ key, requests, bytesIn, bytesOut } x<=15], // top by bytesOut/60s
///          thresholdBytesPerSec, high }
///
/// "high" is decided HERE, server-side (60s avg bytesOut/s over the
/// AppConfig.TrafficHighBytesPerSec threshold, default 512 KB/s), so every
/// consumer shares one definition. Behind normal session auth like every /api route.
/// The panel's own polling of this endpoint is counted like everything else —
/// deliberately not special-cased (design.md: honest numbers).
/// </summary>
[ApiController]
[Route("api/traffic")]
public class TrafficController : ControllerBase
{
    public const long DefaultHighBytesPerSec = 512_000;

    private readonly TrafficStats _stats;
    private readonly AppConfig _config;
    private readonly Logger _logger;

    public TrafficController(TrafficStats stats, AppConfig config, Logger logger)
    {
        _stats = stats;
        _config = config;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult Get()
    {
        _logger.CountRequest();

        var threshold = _config.TrafficHighBytesPerSec > 0 ? _config.TrafficHighBytesPerSec : DefaultHighBytesPerSec;
        var now = _stats.Rates(10);
        var avg60 = _stats.Rates(60);

        return Ok(new
        {
            now = new { reqPerSec = now.ReqPerSec, bytesInPerSec = now.BytesInPerSec, bytesOutPerSec = now.BytesOutPerSec },
            avg60 = new { reqPerSec = avg60.ReqPerSec, bytesInPerSec = avg60.BytesInPerSec, bytesOutPerSec = avg60.BytesOutPerSec },
            history = _stats.History(60).Select(h => new { requests = h.Requests, bytesOut = h.BytesOut }),
            buckets = _stats.Top(60, 15).Select(b => new { key = b.Key, requests = b.Requests, bytesIn = b.BytesIn, bytesOut = b.BytesOut }),
            thresholdBytesPerSec = threshold,
            high = avg60.BytesOutPerSec > threshold,
        });
    }
}
