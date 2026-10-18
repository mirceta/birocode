using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Memory;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The Management "Memory" tab's API (openspec arch-memory-store, fleet task 0953472c): the hub's memory store,
/// read and written by the Operator. Every write from here is the Operator's (author "operator"): it may add,
/// edit, pin, retire, restore, confirm and DELETE — the one thing the arch's tools cannot do. The store refuses
/// secrets and a missing kind / reason with 400 + the reason, which the tab shows. <c>GET context</c> previews
/// what an arch turn in a conversation loads right now (the same selection the turn makes). Peers will read
/// <c>GET</c> over the fleet channel later; this harness stays the single writer.
/// </summary>
[ApiController]
[Route("api/memory")]
public class MemoryController : ControllerBase
{
    private const string Operator = "operator";
    private readonly MemoryStore _store;
    private readonly ArchAgentService _arch;
    private readonly Logger _logger;

    public MemoryController(MemoryStore store, ArchAgentService arch, Logger logger)
    {
        _store = store;
        _arch = arch;
        _logger = logger;
    }

    public sealed record EntryRequest(string? Title, string? Body, string? Kind, List<string>? Tags, bool? Pinned, string? Reason);
    public sealed record ReasonRequest(string? Reason);
    public sealed record PinRequest(bool Pinned);
    public sealed record SettingsRequest(int? StaleDays, int? UsedWindowTurns);

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        _arch.EnsureMemoryImported();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var settings = _store.GetSettings();
        var turn = _store.TurnSeq;
        var entries = _store.All().Select(e => View(e, now, settings, turn)).ToList();
        return Ok(new { entries, settings, turnSeq = turn, kinds = MemoryStore.Kinds, now, writer = Environment.MachineName });
    }

    [HttpGet("{id}")]
    public IActionResult Get(string id)
    {
        _logger.CountRequest();
        var e = _store.Get(id);
        return e is null ? NotFound(new { error = $"no memory entry {id}" }) : Ok(new { entry = e });
    }

    [HttpPost]
    public IActionResult Add([FromBody] EntryRequest req) => Write(() => _store.Add(new MemoryStore.Input(req.Title, req.Body, req.Kind, req.Tags, req.Pinned), Operator, req.Reason));

    [HttpPut("{id}")]
    public IActionResult Update(string id, [FromBody] EntryRequest req) => Write(() => _store.Update(id, new MemoryStore.Input(req.Title, req.Body, req.Kind, req.Tags, req.Pinned), Operator, req.Reason));

    [HttpPost("{id}/confirm")]
    public IActionResult Confirm(string id) => Write(() => _store.Confirm(id, Operator));

    [HttpPost("{id}/retire")]
    public IActionResult Retire(string id, [FromBody] ReasonRequest? req) => Write(() => _store.SetStatus(id, MemoryStore.Retired, Operator, string.IsNullOrWhiteSpace(req?.Reason) ? "retired by the Operator" : req!.Reason));

    [HttpPost("{id}/restore")]
    public IActionResult Restore(string id, [FromBody] ReasonRequest? req) => Write(() => _store.SetStatus(id, MemoryStore.Active, Operator, string.IsNullOrWhiteSpace(req?.Reason) ? "restored by the Operator" : req!.Reason));

    [HttpPost("{id}/pin")]
    public IActionResult Pin(string id, [FromBody] PinRequest req) => Write(() => _store.SetPinned(id, req.Pinned, Operator));

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        try { return _store.Delete(id, Operator) ? Ok(new { deleted = id }) : NotFound(new { error = $"no memory entry {id}" }); }
        catch (MemoryStore.Refused r) { return BadRequest(new { error = r.Message }); }
    }

    [HttpPut("settings")]
    public IActionResult SaveSettings([FromBody] SettingsRequest req)
    {
        _logger.CountRequest();
        return Ok(new { settings = _store.SaveSettings(req.StaleDays, req.UsedWindowTurns) });
    }

    /// <summary>A live check for the editor: would this text be refused as a secret?</summary>
    [HttpPost("check")]
    public IActionResult Check([FromBody] EntryRequest req)
    {
        _logger.CountRequest();
        var finding = MemoryStore.SecretFinding(req.Title) ?? MemoryStore.SecretFinding(req.Body) ?? MemoryStore.SecretFinding(req.Reason);
        return Ok(new { secret = finding });
    }

    /// <summary>What an arch turn in <paramref name="conv"/> would load now, for <paramref name="message"/>
    /// (no lastUsed is recorded — a preview).</summary>
    [HttpGet("context")]
    public IActionResult Context([FromQuery] string? conv, [FromQuery] string? message)
    {
        _logger.CountRequest();
        _arch.EnsureMemoryImported();
        var ctx = _store.ContextFor(_arch.MemoryCues(conv, message));
        return Ok(new { always = ctx.Always.Select(e => e.Id), knowledge = ctx.Knowledge.Select(e => e.Id), text = ctx.Text });
    }

    private IActionResult Write(Func<MemoryStore.Entry> op)
    {
        _logger.CountRequest();
        try
        {
            var e = op();
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return Ok(new { entry = View(e, now, _store.GetSettings(), _store.TurnSeq) });
        }
        catch (MemoryStore.Refused r)
        {
            return BadRequest(new { error = r.Message });
        }
    }

    private static object View(MemoryStore.Entry e, long now, MemoryStore.Settings s, long turn) => new
    {
        e.Id, e.Title, e.Body, e.Kind, e.Tags, e.Author, e.Created, e.Updated, e.LastConfirmed, e.LastUsed, e.LastUsedTurn, e.UseCount,
        e.Status, e.Pinned, e.NeedsReview, e.Source,
        stale = MemoryStore.IsStale(e, now, s.StaleDays),
        usedRecently = e.LastUsedTurn is { } t && turn - t < s.UsedWindowTurns,
        versions = e.History.Count,
        history = e.History.TakeLast(10).Reverse().Select(h => new { h.At, h.By, h.Action, h.Reason, h.Title }),
    };
}
