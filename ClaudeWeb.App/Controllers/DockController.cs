using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Backend-owned agent tab list, shared by every device (plans/dock-sync.md).
///
///   GET    /api/dock      -- [{ id, repoId, repoName, sessionId, status, createdAt, color, dashboard, important, waiting, waitingOn, stash }]
///   POST   /api/dock      -- open a tab  { repoId, repoName, sessionId?, status?, createdAt?, color? }
///   PATCH  /api/dock/{id} -- partial update { sessionId?, status?, repoName?, color?, dashboard?, important?, waiting?, waitingOn? }
///   DELETE /api/dock/{id} -- close a tab
///   POST   /api/dock/{id}/stash           -- stash a prompt idea { text, id?, createdAt? }
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
    public record PatchRequest(string? SessionId, string? Status, string? RepoName, string? Color, bool? Dashboard, bool? Important, bool? Waiting, string? WaitingOn);
    public record StashRequest(string? Id, string? Text, long? CreatedAt);

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
        var tab = _dock.Update(id, req.SessionId, req.Status, req.RepoName, req.Color, req.Dashboard, req.Important, req.Waiting, req.WaitingOn);
        return tab is null ? NotFound(new { error = "unknown tab" }) : Ok(ToDto(tab));
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

    [HttpDelete("{id}/stash/{stashId}")]
    public IActionResult RemoveStash(string id, string stashId)
    {
        _logger.CountRequest();
        return _dock.RemoveStash(id, stashId)
            ? Ok(new { removed = true })
            : NotFound(new { error = "unknown tab or stash item" });
    }
}
