using ClaudeWeb.Services.FleetProxy;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// This harness's proxy settings (openspec fleet-proxy) for the Management App's Settings tab:
/// GET = settings + what this computer looks like (its addresses, whether it listens / reaches
/// the proxy computer, the browser setting); PUT = save and apply. Behind the password gate.
/// </summary>
[ApiController]
[Route("api/proxy")]
public class FleetProxyController : ControllerBase
{
    private readonly FleetProxyService _svc;

    public FleetProxyController(FleetProxyService svc) => _svc = svc;

    [HttpGet]
    public IActionResult Get() => Ok(_svc.Status());

    [HttpPut]
    public IActionResult Put([FromBody] FleetProxySettings? body)
    {
        if (body is null) return BadRequest(new { error = "no settings" });
        if (_svc.Save(body) is { } err) return BadRequest(new { error = err });
        return Ok(_svc.Status());
    }
}
