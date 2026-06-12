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
    private readonly IpInfoService _ipInfo;
    private readonly Logger _logger;

    public IpFilterController(IpAllowlistService allowlist, IpInfoService ipInfo, Logger logger)
    {
        _allowlist = allowlist;
        _ipInfo = ipInfo;
        _logger = logger;
    }

    [HttpGet("")]
    public IActionResult Get()
    {
        _logger.CountRequest();
        var (guests, attempts) = _allowlist.Snapshot();

        // Enrichment (plans/ip-intel.md): attach cache hits synchronously and
        // kick off a background fill for the rest — NEVER block this response
        // on the external API. Misses appear on a later tab load.
        var allIps = guests.Select(g => g.Ip).Concat(attempts.Select(a => a.Ip)).ToList();
        var geo = _ipInfo.Known(allIps);
        _ipInfo.FillInBackground(allIps);

        object? Geo(string ip) => geo.TryGetValue(ip, out var i) ? new
        {
            local = i.Local,
            country = i.Country,
            countryCode = i.CountryCode,
            city = i.City,
            org = i.Org,
            asn = i.Asn,
            hostname = i.Hostname,
            datacenter = i.Datacenter,
        } : null;

        return Ok(new
        {
            callerIp = ClientIp.Get(HttpContext),
            guests = guests.Select(g => new
            {
                ip = g.Ip,
                name = g.Name,
                addedUtc = g.AddedUtc,
                lastAccessUtc = g.LastAccessUtc,
                geo = Geo(g.Ip),
            }),
            attempts = attempts.Select(a => new
            {
                ip = a.Ip,
                count = a.Count,
                firstUtc = a.FirstUtc,
                lastUtc = a.LastUtc,
                geo = Geo(a.Ip),
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
