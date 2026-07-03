using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Read-only host-clock probe for the dashboard's host clock chip
/// (openspec add-dashboard-host-clock). Reports the host computer's current
/// local time straight from the Windows clock of the harness process — never
/// derived from anything the client sent — so a phone in another timezone can
/// still see the box's wall time. Same probe idiom as AccountsController:
/// always 200, typed fields, no state change.
/// </summary>
[ApiController]
[Route("api")]
public class HostTimeController : ControllerBase
{
    private readonly Logger _logger;

    public HostTimeController(Logger logger)
    {
        _logger = logger;
    }

    public record HostTime(long UnixMs, string Iso, string TimeZoneId, int UtcOffsetMinutes);

    [HttpGet("host-time")]
    public IActionResult Get()
    {
        _logger.CountRequest();
        // DateTimeOffset.Now carries the offset in effect right now (DST included);
        // the id names the zone for the tooltip.
        var now = DateTimeOffset.Now;
        return Ok(new HostTime(
            now.ToUnixTimeMilliseconds(),
            now.ToString("o"),
            TimeZoneInfo.Local.Id,
            (int)now.Offset.TotalMinutes));
    }
}
