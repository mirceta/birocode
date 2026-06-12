using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.IpFilter;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Web surface of the IP allowlist (plans/auth-ip-filter.md) — DELIBERATELY
/// ASYMMETRIC: the web can see everything and can REMOVE guests, but there
/// is NO endpoint to add or approve an IP. That surface only exists in the
/// desktop GUI (IpFilterForm), so a remote attacker can never grant
/// themselves access. Do not add a POST/approve endpoint here. Ever.
///
///   GET    /api/ipfilter             -- guests + attempts + callerIp
///   DELETE /api/ipfilter/guests/{ip} -- unlist (kills live connections,
///                                       including your own if ip == you)
///
/// Both sit behind the IP gate AND password auth like every other /api route.
/// </summary>
[ApiController]
[Route("api/ipfilter")]
public class IpFilterController : ControllerBase
{
    private readonly IpAllowlistService _allowlist;
    private readonly Logger _logger;

    public IpFilterController(IpAllowlistService allowlist, Logger logger)
    {
        _allowlist = allowlist;
        _logger = logger;
    }

    [HttpGet("")]
    public IActionResult Get()
    {
        _logger.CountRequest();
        var (guests, attempts) = _allowlist.Snapshot();
        return Ok(new
        {
            callerIp = ClientIp.Get(HttpContext),
            guests = guests.Select(g => new
            {
                ip = g.Ip,
                name = g.Name,
                addedUtc = g.AddedUtc,
                lastAccessUtc = g.LastAccessUtc,
            }),
            attempts = attempts.Select(a => new
            {
                ip = a.Ip,
                count = a.Count,
                firstUtc = a.FirstUtc,
                lastUtc = a.LastUtc,
            }),
        });
    }

    [HttpDelete("guests/{ip}")]
    public IActionResult Remove(string ip)
    {
        _logger.CountRequest();
        _logger.Info($"[IPFILTER] Web unlist request for {ip} from {ClientIp.Get(HttpContext)}");
        if (!_allowlist.Remove(ip))
            return NotFound(new { error = $"{ip} is not on the guest list." });
        return Ok(new { removed = true });
    }
}
