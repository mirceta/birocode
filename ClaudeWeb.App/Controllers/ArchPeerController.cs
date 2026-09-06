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

    public sealed record PeerSendRequest(string? RepoId, string? Text, string? Branch, string? From, bool? Override = null);

    [HttpPost("send")]
    public IActionResult Send([FromBody] PeerSendRequest? req)
    {
        _logger.CountRequest();
        var o = _arch.PeerSendTask(req?.From, req?.RepoId, req?.Text, req?.Branch, req?.Override == true);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    [HttpGet("transcript")]
    public IActionResult Transcript([FromQuery] string? repoId, [FromQuery] int tail = 6, [FromQuery] bool @override = false, [FromQuery] string? from = null)
    {
        _logger.CountRequest();
        var o = _arch.PeerReadTranscript(repoId, tail, @override, from);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    public sealed record PeerHandoverRequest(string? RepoId, string? Branch, string? From, bool Adopt = true);

    /// <summary>Branch hand-over from a fleet arch on its Operator's ask (openspec
    /// arch-branch-handover): recorded in THIS harness's assignments, behind the same
    /// accept-sends opt-in and gate as a fleet send.</summary>
    [HttpPost("handover")]
    public IActionResult HandOver([FromBody] PeerHandoverRequest? req)
    {
        _logger.CountRequest();
        var o = _arch.PeerHandOver(req?.From, req?.RepoId, req?.Branch, req?.Adopt ?? true);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    /// <summary>Loops on this harness's managed agents, for a fleet arch (openspec arch-loop-tools).</summary>
    [HttpGet("loops")]
    public IActionResult Loops([FromQuery] string? repoId = null)
    {
        _logger.CountRequest();
        var o = _arch.PeerLoops(repoId);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    public sealed record PeerLoopRequest(
        string? From, string? Action, string? RepoId, string? LoopId, string? Kind, string? Mode, string? Goal, string? Prompt,
        string? Sentinel, int? MaxIterations, string? Recipe, string? TabId, bool? VerifyEnabled, bool? IncludeFooterClauses,
        bool? Rearm = null, bool? Override = null);

    /// <summary>Start / update / stop a loop on one of this harness's managed agents from a
    /// fleet arch: this harness's accept-sends opt-in, gate, scope and claimed rule apply;
    /// the loop is armed by <c>arch@from</c>.</summary>
    [HttpPost("loop")]
    public IActionResult Loop([FromBody] PeerLoopRequest? req)
    {
        _logger.CountRequest();
        var p = new Services.Arch.ArchLoopTools.LoopParams(req?.Kind, req?.Mode, req?.Goal, req?.Prompt, req?.Sentinel, req?.MaxIterations, req?.Recipe, req?.TabId, req?.VerifyEnabled, req?.IncludeFooterClauses);
        var o = _arch.PeerLoop(req?.From, (req?.Action ?? "").Trim().ToLowerInvariant(), req?.RepoId, req?.LoopId, p, req?.Rearm == true, req?.Override == true);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    public sealed record PeerUpgradeRequest(string? Ref, string? From);

    /// <summary>Fleet upgrade (openspec arch-peer-upgrades): bring THIS harness to a ref.
    /// Behind the password middleware AND the receiver opt-in "accept fleet upgrades".</summary>
    [HttpPost("upgrade")]
    public IActionResult Upgrade([FromBody] PeerUpgradeRequest? req)
    {
        _logger.CountRequest();
        var o = _arch.PeerStartUpgrade(req?.From, req?.Ref);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    [HttpGet("upgrade/{id}")]
    public IActionResult UpgradeStatus(string id)
    {
        _logger.CountRequest();
        var job = _arch.PeerUpgradeStatus(id);
        if (job is null) return NotFound(new { ok = false, status = "unknown", detail = $"no upgrade job {id}" });
        return Ok(new { ok = true, status = job.State, detail = job.Detail, data = job });
    }

    /// <summary>This harness's scoreboard/analytics for a window, for a fleet hub's Fleet
    /// Status Scoreboard tab (openspec fleet-status-panels). Fetched on demand only — never
    /// on the fleet poll. <c>data</c> is the analytics payload the Scoreboard renders.</summary>
    [HttpGet("scoreboard")]
    public IActionResult Scoreboard([FromQuery] string? window)
    {
        _logger.CountRequest();
        var o = _arch.PeerScoreboard(window);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }
}
