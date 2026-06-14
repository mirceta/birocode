using ClaudeWeb.Services.Files;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// File-browsing endpoints (M2). Auto-discovered by AddControllers().
///   GET /api/files?path=       -- list a directory
///   GET /api/files/read?path=  -- read a text file
///   GET /api/files/raw?path=   -- stream an IMAGE file's bytes (plans/files-image-preview.md)
///
/// All path validation lives in <see cref="FileService"/>; any violation
/// returns HTTP 403 (not 404) so path existence is not leaked.
/// </summary>
[ApiController]
[Route("api/files")]
public class FileController : ControllerBase
{
    // Whitelist for /raw — image types only, so this never becomes a general
    // binary-download/exfil endpoint (plans/files-image-preview.md).
    private static readonly Dictionary<string, string> ImageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".gif"] = "image/gif",
        [".webp"] = "image/webp",
        [".svg"] = "image/svg+xml",
        [".bmp"] = "image/bmp",
        [".ico"] = "image/x-icon",
        [".avif"] = "image/avif",
    };

    private readonly FileService _files;
    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public FileController(FileService files, RepositoryResolver repos, Logger logger)
    {
        _files = files;
        _repos = repos;
        _logger = logger;
    }

    /// <summary>GET /api/files?path= -- directory listing (dirs first, then files).</summary>
    [HttpGet]
    public IActionResult List([FromQuery] string? path)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        var requested = string.IsNullOrEmpty(path) ? "/" : path;

        var result = _files.ResolveSafePath(repo.Path, requested);
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
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        var requested = string.IsNullOrEmpty(path) ? "/" : path;

        var result = _files.ResolveSafePath(repo.Path, requested);
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

    /// <summary>
    /// GET /api/files/raw?path= -- stream an image file's bytes (image types
    /// only). Lets the Files viewer render pictures (e.g. agent screenshots);
    /// the text /read endpoint can't carry binary. See plans/files-image-preview.md.
    /// </summary>
    [HttpGet("raw")]
    public IActionResult Raw([FromQuery] string? path)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        var requested = string.IsNullOrEmpty(path) ? "/" : path;

        var result = _files.ResolveSafePath(repo.Path, requested);
        if (!result.IsValid)
        {
            _logger.Error($"[FILE] Raw denied '{requested}': {result.Reason}");
            return StatusCode(403, new { error = "Forbidden" });
        }

        if (!ImageTypes.TryGetValue(Path.GetExtension(requested), out var contentType))
            return StatusCode(415, new { error = "Only image files can be served raw." });

        if (!System.IO.File.Exists(result.FullPath))
            return NotFound(new { error = "File not found" });

        _logger.Info($"[FILE] Raw '{requested}' -> {contentType}");
        return PhysicalFile(result.FullPath, contentType);
    }
}
