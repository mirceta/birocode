using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Backend-owned agent tab list, shared by every device (plans/dock-sync.md).
///
///   GET    /api/dock      -- [{ id, repoId, repoName, sessionId, status, createdAt }]
///   POST   /api/dock      -- open a tab  { repoId, repoName, sessionId?, status?, createdAt? }
///   PATCH  /api/dock/{id} -- partial update { sessionId?, status?, repoName? }
///   DELETE /api/dock/{id} -- close a tab
/// </summary>
[ApiController]
[Route("api/dock")]
public class DockController : ControllerBase
{
    public record CreateRequest(string? Id, string? RepoId, string? RepoName, string? SessionId, string? Status, long? CreatedAt);
    public record PatchRequest(string? SessionId, string? Status, string? RepoName);

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
    };

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
        var tab = _dock.Add(req.RepoId, req.RepoName ?? "", req.SessionId, req.Status, req.CreatedAt, req.Id);
        return Ok(ToDto(tab));
    }

    [HttpPatch("{id}")]
    public IActionResult Patch(string id, [FromBody] PatchRequest req)
    {
        _logger.CountRequest();
        var tab = _dock.Update(id, req.SessionId, req.Status, req.RepoName);
        return tab is null ? NotFound(new { error = "unknown tab" }) : Ok(ToDto(tab));
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        return _dock.Remove(id) ? Ok(new { removed = true }) : NotFound(new { error = "unknown tab" });
    }
}
