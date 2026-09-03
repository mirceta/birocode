using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The fleet PEER API (openspec: add-fleet-arch-agent, D2) — what a fleet arch
/// agent on ANOTHER harness calls on this one, through that harness's fleet
/// client, with this harness's password (the same credential its collector
/// stores to read our feed). Behind the normal password middleware like every
/// /api route; never reachable with the arch agent's per-process MCP token.
///
///   GET  /api/arch/peer                         -> { protocol, version, machine, acceptsSends, gateOpen, repos[] }
///   POST /api/arch/peer/send                    { repoId, text, branch?, from } -> { ok, status, detail, data }
///   GET  /api/arch/peer/transcript?repoId=&tail= -> { ok, status, detail, data }
///
/// Every logical outcome (busy, claimed, denied, not-accepting …) is a 200 with
/// a named status — the vocabulary the arch tools already speak — so the caller
/// distinguishes "the peer refused" from "the peer is dark" (transport error) and
/// "the peer is an older build" (404 on the route itself).
/// </summary>
[ApiController]
[Route("api/arch/peer")]
public class ArchPeerController : ControllerBase
{
    private readonly ArchAgentService _arch;
    private readonly Logger _logger;

    public ArchPeerController(ArchAgentService arch, Logger logger)
    {
        _arch = arch;
        _logger = logger;
    }

    [HttpGet("")]
    public IActionResult Describe()
    {
        _logger.CountRequest();
        return Ok(_arch.PeerDescribe());
    }

    public sealed record PeerSendRequest(string? RepoId, string? Text, string? Branch, string? From);

    [HttpPost("send")]
    public IActionResult Send([FromBody] PeerSendRequest? req)
    {
        _logger.CountRequest();
        var o = _arch.PeerSendTask(req?.From, req?.RepoId, req?.Text, req?.Branch);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    [HttpGet("transcript")]
    public IActionResult Transcript([FromQuery] string? repoId, [FromQuery] int tail = 6)
    {
        _logger.CountRequest();
        var o = _arch.PeerReadTranscript(repoId, tail);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }
}
