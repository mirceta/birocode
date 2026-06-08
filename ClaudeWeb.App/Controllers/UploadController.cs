using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Accepts file uploads from the chat UI. Files are saved to a
/// .claudeweb-uploads/ directory inside the current repository so that
/// the Claude CLI can read them with the Read tool.
///
///   POST /api/upload  (multipart/form-data, field name "file")
///   Returns { "path": "/absolute/path/to/saved/file" }
/// </summary>
[ApiController]
[Route("api")]
public class UploadController : ControllerBase
{
    private const string UploadDir = ".claudeweb-uploads";
    private const long MaxBytes = 10 * 1024 * 1024; // 10 MB

    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public UploadController(RepositoryResolver repos, Logger logger)
    {
        _repos = repos;
        _logger = logger;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile? file)
    {
        if (file is null || file.Length == 0)
            return BadRequest("No file provided.");

        if (file.Length > MaxBytes)
            return BadRequest($"File too large (max {MaxBytes / 1024 / 1024} MB).");

        var repo = _repos.Current();
        if (repo is null)
            return BadRequest("No repository selected.");

        var dir = Path.Combine(repo.Path, UploadDir);
        Directory.CreateDirectory(dir);

        // Unique filename to avoid collisions, preserving the original extension.
        var ext = Path.GetExtension(file.FileName);
        var safeName = $"{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}-{Guid.NewGuid().ToString("N")[..8]}{ext}";
        var destPath = Path.Combine(dir, safeName);

        await using var stream = new FileStream(destPath, FileMode.Create);
        await file.CopyToAsync(stream);

        _logger.Info($"[UPLOAD] Saved {file.FileName} ({file.Length} bytes) -> {destPath}");

        return Ok(new { path = destPath });
    }
}
