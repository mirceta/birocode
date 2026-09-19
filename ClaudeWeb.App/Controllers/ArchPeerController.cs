using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core.Features;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

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
        bool? Rearm = null, bool? Override = null,
        // "recurring" when the asking hub's SCHEDULE arms the loop (openspec recurring-tasks): the loop is
        // then attributed recurring@from, which also lets it start a conversation on a silent agent.
        string? By = null);

    /// <summary>Start / update / stop a loop on one of this harness's managed agents from a
    /// fleet arch: this harness's accept-sends opt-in, gate, scope and claimed rule apply;
    /// the loop is armed by <c>arch@from</c>.</summary>
    [HttpPost("loop")]
    public IActionResult Loop([FromBody] PeerLoopRequest? req)
    {
        _logger.CountRequest();
        var p = new Services.Arch.ArchLoopTools.LoopParams(req?.Kind, req?.Mode, req?.Goal, req?.Prompt, req?.Sentinel, req?.MaxIterations, req?.Recipe, req?.TabId, req?.VerifyEnabled, req?.IncludeFooterClauses);
        var o = _arch.PeerLoop(req?.From, (req?.Action ?? "").Trim().ToLowerInvariant(), req?.RepoId, req?.LoopId, p, req?.Rearm == true, req?.Override == true, req?.By);
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

    // ---- the hub file system (openspec hub-file-system) ---------------------------------------

    /// <summary>This harness's hub file store, for a hub's fleet-wide list.</summary>
    [HttpGet("files")]
    public IActionResult Files([FromQuery] string? prefix = null)
    {
        _logger.CountRequest();
        var o = _arch.PeerHubFiles(prefix);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    /// <summary>One file's bytes as a RAW STREAM (openspec hubfs-large-files-tree) with the
    /// provenance in X-Hub-* headers, for a hub's hub_transfer — any size, never buffered. A
    /// refusal (not found, no store) is the usual JSON envelope; the caller tells them apart by
    /// content type. The response data-rate guard is lifted: a slow link must not cut a 5 GB file.</summary>
    [HttpGet("files/content")]
    public IActionResult FileContent([FromQuery] string? path)
    {
        _logger.CountRequest();
        var opened = _arch.PeerHubFileOpen(path, out var refusal);
        if (opened is null) return Ok(new { ok = false, status = refusal!.Status, detail = refusal.Detail, data = (object?)null });
        var (e, stream) = opened.Value;
        var rate = HttpContext.Features.Get<IHttpMinResponseDataRateFeature>();
        if (rate is not null) rate.MinDataRate = null;
        Response.Headers["X-Hub-UploadedBy"] = Uri.EscapeDataString(e.UploadedBy);
        Response.Headers["X-Hub-Machine"] = Uri.EscapeDataString(e.Machine);
        if (e.Note is not null) Response.Headers["X-Hub-Note"] = Uri.EscapeDataString(e.Note);
        Response.Headers["X-Hub-UploadedAt"] = e.UploadedAt.ToString();
        Response.Headers["X-Hub-Sha256"] = e.Sha256;
        Response.Headers["X-Hub-Version"] = e.Version.ToString();
        Response.Headers["X-Hub-Size"] = e.Size.ToString();
        return File(stream, "application/octet-stream");
    }

    public sealed record PeerFilePutRequest(string? From, string? Path, string? ContentBase64, string? UploadedBy, string? Machine, string? Note, long? UploadedAt, bool? Overwrite = null);

    /// <summary>A hub pushes a file into this store (hub_transfer): the body is the RAW file of
    /// any size (openspec hubfs-large-files-tree), streamed straight to the store — the request
    /// size limit and the body data-rate guard are lifted for this route; the provenance rides in
    /// the query. An older hub's JSON body (base64) is still accepted. Behind the password
    /// middleware AND this harness's "accept fleet sends" opt-in, like every write a fleet arch may do here.</summary>
    [HttpPost("files")]
    [DisableRequestSizeLimit]
    public async Task<IActionResult> FilePut([FromQuery] string? path, [FromQuery] string? from, [FromQuery] string? uploadedBy, [FromQuery] string? machine,
        [FromQuery] string? note, [FromQuery] long? uploadedAt, [FromQuery] bool overwrite = false)
    {
        _logger.CountRequest();
        var rate = HttpContext.Features.Get<IHttpMinRequestBodyDataRateFeature>();
        if (rate is not null) rate.MinDataRate = null;
        var sync = HttpContext.Features.Get<IHttpBodyControlFeature>();
        if (sync is not null) sync.AllowSynchronousIO = true;   // the store copies the body with a plain buffered loop
        Services.Arch.ArchAgentService.ToolOutcome o;
        if ((Request.ContentType ?? "").Contains("json", StringComparison.OrdinalIgnoreCase))
        {
            PeerFilePutRequest? req = null;
            try { req = await JsonSerializer.DeserializeAsync<PeerFilePutRequest>(Request.Body, new JsonSerializerOptions(JsonSerializerDefaults.Web), HttpContext.RequestAborted); } catch { /* bad body → refused below */ }
            byte[] bytes;
            try { bytes = Convert.FromBase64String(req?.ContentBase64 ?? ""); }
            catch { return Ok(new { ok = false, status = "error", detail = "contentBase64 is not valid base64", data = (object?)null }); }
            using var ms = new MemoryStream(bytes, writable: false);
            o = _arch.PeerHubFilePutStream(req?.From, req?.Path, ms, bytes.LongLength, req?.UploadedBy, req?.Machine, req?.Note, req?.UploadedAt, req?.Overwrite == true, HttpContext.RequestAborted);
        }
        else
        {
            o = _arch.PeerHubFilePutStream(from, path, Request.Body, Request.ContentLength, uploadedBy, machine, note, uploadedAt, overwrite, HttpContext.RequestAborted);
        }
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }
}
