using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Backend-owned agent tab list, shared by every device (plans/dock-sync.md).
///
///   GET    /api/dock      -- [{ id, repoId, repoName, sessionId, status, createdAt, color, dashboard, important, waiting, waitingOn, dependsOn, wide, stash }]
///   POST   /api/dock      -- open a tab  { repoId, repoName, sessionId?, status?, createdAt?, color? }
///   PATCH  /api/dock/{id} -- partial update { sessionId?, status?, repoName?, color?, dashboard?, important?, waiting?, waitingOn?, dependsOn?, wide? }
///   POST   /api/dock/reorder -- reorder the roster { ids: [full ordered id list] }
///   DELETE /api/dock/{id} -- close a tab
///   POST   /api/dock/{id}/stash           -- stash a prompt idea { text, id?, createdAt? }
///   POST   /api/dock/{id}/stash/reorder   -- reorder the stash { ids: [full ordered id list] }
///   DELETE /api/dock/{id}/stash/{stashId} -- remove a stashed idea
///   GET    /api/dock/stash               -- the main chat's tab-independent queue
///   POST   /api/dock/stash               -- enqueue on it { text, id?, createdAt? }
///   DELETE /api/dock/stash/{stashId}     -- remove from it
/// </summary>
[ApiController]
[Route("api/dock")]
public class DockController : ControllerBase
{
    public record CreateRequest(string? Id, string? RepoId, string? RepoName, string? SessionId, string? Status, long? CreatedAt, string? Color);
    public record PatchRequest(string? SessionId, string? Status, string? RepoName, string? Color, bool? Dashboard, bool? Important, bool? Waiting, string? WaitingOn, string? DependsOn, bool? Wide);
    public record StashRequest(string? Id, string? Text, long? CreatedAt);
    public record StashReorderRequest(List<string>? Ids);
    public record ReorderRequest(List<string>? Ids);

    private readonly DockRegistry _dock;
    private readonly Logger _logger;

    public DockController(DockRegistry dock, Logger logger)
    {
        _dock = dock;
        _logger = logger;
    }

    private static object ToDto(DockTab t) => new
    {
        id = t.Id,
        repoId = t.RepoId,
        repoName = t.RepoName,
        sessionId = t.SessionId,
        status = t.Status,
        createdAt = t.CreatedAt,
        color = t.Color,
        dashboard = t.Dashboard,
        important = t.Important,
        waiting = t.Waiting,
        waitingOn = t.WaitingOn,
        dependsOn = t.DependsOn,
        wide = t.Wide,
        // Server-owned unseen-result latch (openspec dock-busy-indicator,
        // unseen-result amendment): read-only for clients — set at turn end by
        // DockUnseenResultTrigger, cleared when a PATCH turns `dashboard` on.
        unseenResult = t.UnseenResult,
        // Server-owned too (openspec dock-recent-tab-emphasis): Unix ms of the
        // last builder-run start on this tab's repo, stamped by
        // DockUnseenResultTrigger; PatchRequest has no such field, so clients
        // cannot write it. Null until the first prompt after the field existed.
        lastPromptAt = t.LastPromptAt,
        stash = t.Stash.Select(StashDto),
    };

    private static object StashDto(StashItem s) => new { id = s.Id, text = s.Text, createdAt = s.CreatedAt };

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        return Ok(_dock.GetAll().Select(ToDto));
    }

    [HttpPost]
    public IActionResult Create([FromBody] CreateRequest req)
    {
        _logger.CountRequest();
        if (string.IsNullOrWhiteSpace(req.RepoId))
            return BadRequest(new { error = "repoId is required" });
        var tab = _dock.Add(req.RepoId, req.RepoName ?? "", req.SessionId, req.Status, req.CreatedAt, req.Id, req.Color);
        return Ok(ToDto(tab));
    }

    [HttpPatch("{id}")]
    public IActionResult Patch(string id, [FromBody] PatchRequest req)
    {
        _logger.CountRequest();
        var tab = _dock.Update(id, req.SessionId, req.Status, req.RepoName, req.Color, req.Dashboard, req.Important, req.Waiting, req.WaitingOn, req.DependsOn, req.Wide);
        return tab is null ? NotFound(new { error = "unknown tab" }) : Ok(ToDto(tab));
    }

    // Reorder the roster (openspec dock-toolbar-star-and-branch): the client
    // sends the full ordered id list; the persisted list order IS the display
    // order the dashboard strip and grid render in. Unknown ids are ignored,
    // unlisted tabs keep their relative order at the end, last-write-wins —
    // same contract as the per-tab stash reorder. Returns the resulting roster.
    [HttpPost("reorder")]
    public IActionResult Reorder([FromBody] ReorderRequest req)
    {
        _logger.CountRequest();
        if (req?.Ids is null || req.Ids.Count == 0)
            return BadRequest(new { error = "ids is required" });
        var roster = _dock.Reorder(req.Ids);
        return roster is null
            ? BadRequest(new { error = "ids is required" })
            : Ok(roster.Select(ToDto));
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        return _dock.Remove(id) ? Ok(new { removed = true }) : NotFound(new { error = "unknown tab" });
    }

    // --- global (tab-independent) stash: the main chat's queue, which has no
    // dock tab to attach to (plans/queued-prompts.md).
    //   GET    /api/dock/stash           -- list the global queue
    //   POST   /api/dock/stash           -- enqueue { text, id?, createdAt? }
    //   DELETE /api/dock/stash/{stashId} -- remove one

    [HttpGet("stash")]
    public IActionResult ListGlobalStash()
    {
        _logger.CountRequest();
        return Ok(_dock.GetGlobalStash().Select(StashDto));
    }

    [HttpPost("stash")]
    public IActionResult AddGlobalStash([FromBody] StashRequest req)
    {
        _logger.CountRequest();
        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest(new { error = "text is required" });
        var item = _dock.AddGlobalStash(req.Text, req.Id, req.CreatedAt);
        return item is null ? BadRequest(new { error = "text is required" }) : Ok(StashDto(item));
    }

    [HttpDelete("stash/{stashId}")]
    public IActionResult RemoveGlobalStash(string stashId)
    {
        _logger.CountRequest();
        return _dock.RemoveGlobalStash(stashId)
            ? Ok(new { removed = true })
            : NotFound(new { error = "unknown stash item" });
    }

    [HttpPost("{id}/stash")]
    public IActionResult AddStash(string id, [FromBody] StashRequest req)
    {
        _logger.CountRequest();
        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest(new { error = "text is required" });
        var item = _dock.AddStash(id, req.Text, req.Id, req.CreatedAt);
        return item is null ? NotFound(new { error = "unknown tab" }) : Ok(StashDto(item));
    }

    // Reorder the whole stash (openspec queue-based-loop): the client sends the
    // full ordered id list; ids consumed meanwhile (e.g. by an armed queue loop)
    // are ignored, last-write-wins. Returns the resulting stash.
    [HttpPost("{id}/stash/reorder")]
    public IActionResult ReorderStash(string id, [FromBody] StashReorderRequest req)
    {
        _logger.CountRequest();
        if (req?.Ids is null)
            return BadRequest(new { error = "ids is required" });
        var stash = _dock.ReorderStash(id, req.Ids);
        return stash is null ? NotFound(new { error = "unknown tab" }) : Ok(stash.Select(StashDto));
    }

    [HttpDelete("{id}/stash/{stashId}")]
    public IActionResult RemoveStash(string id, string stashId)
    {
        _logger.CountRequest();
        return _dock.RemoveStash(id, stashId)
            ? Ok(new { removed = true })
            : NotFound(new { error = "unknown tab or stash item" });
    }
}
