using ClaudeWeb.Services;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// File-browsing endpoints (M2). Auto-discovered by AddControllers().
///   GET /api/files?path=       -- list a directory
///   GET /api/files/read?path=  -- read a text file
///
/// All path validation lives in <see cref="FileService"/>; any violation
/// returns HTTP 403 (not 404) so path existence is not leaked.
/// </summary>
[ApiController]
[Route("api/files")]
public class FileController : ControllerBase
{
    private readonly FileService _files;
    private readonly Logger _logger;

    public FileController(FileService files, Logger logger)
    {
        _files = files;
        _logger = logger;
    }

    /// <summary>GET /api/files?path= -- directory listing (dirs first, then files).</summary>
    [HttpGet]
    public IActionResult List([FromQuery] string? path)
    {
        _logger.CountRequest();
        var requested = string.IsNullOrEmpty(path) ? "/" : path;

        var result = _files.ResolveSafePath(requested);
        if (!result.IsValid)
        {
            _logger.Error($"[FILE] List denied '{requested}': {result.Reason}");
            return StatusCode(403, new { error = "Forbidden" });
        }

        try
        {
            var entries = _files.ListDirectory(result.FullPath);
            _logger.Info($"[FILE] List '{requested}' -> {entries.Count} entries");
            return Ok(entries);
        }
        catch (DirectoryNotFoundException)
        {
            _logger.Info($"[FILE] List '{requested}' -> not a directory");
            return NotFound(new { error = "Directory not found" });
        }
        catch (Exception ex)
        {
            _logger.Error($"[FILE] List '{requested}' failed: {ex.Message}");
            return StatusCode(500, new { error = "Could not list directory" });
        }
    }

    /// <summary>GET /api/files/read?path= -- read a text file (max 1 MB, text only).</summary>
    [HttpGet("read")]
    public IActionResult Read([FromQuery] string? path)
    {
        _logger.CountRequest();
        var requested = string.IsNullOrEmpty(path) ? "/" : path;

        var result = _files.ResolveSafePath(requested);
        if (!result.IsValid)
        {
            _logger.Error($"[FILE] Read denied '{requested}': {result.Reason}");
            return StatusCode(403, new { error = "Forbidden" });
        }

        var content = _files.ReadFile(result.FullPath, requested, out var error);
        if (content is null)
        {
            _logger.Info($"[FILE] Read '{requested}' -> {error}");
            return BadRequest(new { error });
        }

        _logger.Info($"[FILE] Read '{requested}' -> {content.Content.Length} chars");
        return Ok(content);
    }
}
