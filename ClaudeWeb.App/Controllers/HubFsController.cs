using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.HubFs;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core.Features;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The Operator's window onto the hub file system (openspec hub-file-system), behind the
/// normal password middleware like every /api route — the Management dashboard's File System
/// tab. Read-mostly: the list (this hub's store plus every reachable peer's, so the Operator
/// sees the whole fleet's files in one place), a download, and delete — the one write, because
/// nothing in the store expires by itself.
///
///   GET    /api/hubfs                    -> { machine, stats, files[], peers[{ machine, status, detail, files[] }], transfers[] }
///   GET    /api/hubfs/file?path=         -> the bytes, streamed (attachment, ranges allowed)
///   DELETE /api/hubfs/file?path=         -> { ok, path }
/// </summary>
[ApiController]
[Route("api/hubfs")]
public class HubFsController : ControllerBase
{
    private readonly HubFileStore _store;
    private readonly ArchAgentService _arch;
    private readonly Logger _logger;

    public HubFsController(HubFileStore store, ArchAgentService arch, Logger logger)
    {
        _store = store;
        _arch = arch;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult Get([FromQuery] bool peers = true)
    {
        _logger.CountRequest();
        var stats = _store.GetStats();
        return Ok(new
        {
            machine = _arch.SelfLabel,
            stats,
            files = _store.List(),
            peers = peers ? _arch.PeerHubFileLists() : Array.Empty<object>(),
            transfers = _arch.HubTransferViews(),
            howTo = ArchAgentService.HubFilesHowTo(_arch.SelfLabel),
        });
    }

    [HttpGet("file")]
    public IActionResult Download([FromQuery] string? path)
    {
        _logger.CountRequest();
        // Streamed (openspec hubfs-large-files-tree): a FileStream, range requests allowed, the
        // response data-rate guard lifted so a multi-GB download over a slow link completes.
        var opened = _store.Open(path);
        if (opened is null) return NotFound(new { error = $"no hub file {path}" });
        var (entry, stream) = opened.Value;
        var rate = HttpContext.Features.Get<IHttpMinResponseDataRateFeature>();
        if (rate is not null) rate.MinDataRate = null;
        return File(stream, entry.ContentType, Path.GetFileName(entry.Path), enableRangeProcessing: true);
    }

    [HttpDelete("file")]
    public IActionResult Delete([FromQuery] string? path)
    {
        _logger.CountRequest();
        var norm = HubFileStore.Normalize(path, out var err);
        if (norm is null) return BadRequest(new { error = err });
        if (!_store.Delete(norm, "operator")) return NotFound(new { error = $"no hub file {norm}" });
        return Ok(new { ok = true, path = norm });
    }
}
