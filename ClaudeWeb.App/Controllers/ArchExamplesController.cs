using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The Arch examples catalogue (openspec arch-examples-tab, fleet task 7914195c): what the Operator
/// asks the arch agent for, mined from this hub's arch conversations and clustered into request
/// categories. <c>GET</c> answers this machine's mining run, or the snapshot committed with the
/// harness on a machine without arch conversations (<c>source: snapshot</c>). <c>POST mine</c> runs
/// the extraction again — only where the arch transcripts live (the hub); elsewhere 409 says so.
/// </summary>
[ApiController]
[Route("api/arch/examples")]
public class ArchExamplesController : ControllerBase
{
    private readonly ArchExamplesMiner _miner;
    private readonly Logger _logger;

    public ArchExamplesController(ArchExamplesMiner miner, Logger logger)
    {
        _miner = miner;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult Get()
    {
        _logger.CountRequest();
        var doc = _miner.Current();
        if (doc is null)
            return NotFound(new { error = "no arch examples yet: press Re-mine on the hub (or commit a snapshot at " + ArchExamplesMiner.SnapshotRelative + ")", canMine = _miner.CanMine });
        return Content(doc.ToJsonString(), "application/json");
    }

    [HttpPost("mine")]
    public IActionResult Mine()
    {
        _logger.CountRequest();
        if (!_miner.CanMine)
            return StatusCode(StatusCodes.Status409Conflict, new { error = "this machine has no arch conversations to mine (they live on the hub); the tab shows the last snapshot", transcriptDir = _miner.TranscriptDir });
        try
        {
            var report = _miner.Mine();
            var totals = report["totals"];
            return Ok(new { ok = true, detail = $"mined {totals?["requests"]} requests into {totals?["categories"]} categories ({totals?["other"]} in \"other\") — saved to {_miner.OutputPath}", minedAt = report["minedAt"]?.GetValue<long>() });
        }
        catch (Exception ex)
        {
            _logger.Error($"[ARCH-EXAMPLES] mining failed: {ex.Message}");
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = ex.Message });
        }
    }
}
