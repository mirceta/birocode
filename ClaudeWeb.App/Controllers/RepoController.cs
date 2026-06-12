using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Repository endpoints. The phone user picks one of these; the chosen id
/// is then sent on every other request via the X-Repo-Id header.
///
/// Since plans/projects-tab.md the End User can also register a new project
/// over the web (previously Operator-only via the desktop GUI). New projects
/// are constrained to the Projects Root — the parent folder of the pinned
/// self repo (e.g. ...\playground). Folders are only created on explicit
/// request (plans/projects-folder-picker.md):
///
///   GET  /api/repos                 -- [{ id, name, path, exists, isGitRepo, isSelf, visibility }]
///   GET  /api/repos/folders?path=   -- { root, path, folders: [{ name, registered, isGitRepo }] }
///   POST /api/repos                 -- { folder, name?, visibility?, createFolder? } -> the new repo + created flag
///   POST /api/repos/{id}/visibility -- { visibility: "basic"|"advanced" }
///
/// Per plans/project-visibility.md each project carries a visibility:
/// "advanced" (the default) hides it from Basic mode's Projects list;
/// "basic" shows it in both modes. The client stamps new projects with the
/// creating device's mode and filters the list client-side.
/// </summary>
[ApiController]
[Route("api/repos")]
public class RepoController : ControllerBase
{
    private readonly RepositoryRegistry _registry;
    private readonly Logger _logger;

    public RepoController(RepositoryRegistry registry, Logger logger)
    {
        _registry = registry;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult List()
    {
        _logger.CountRequest();
        var repos = _registry.GetAll()
            .Select(r => new { id = r.Id, name = r.Name, path = r.Path, exists = r.Exists, isGitRepo = r.IsGitRepo, isSelf = r.IsSelf, visibility = r.Visibility });
        return Ok(repos);
    }

    /// <summary>
    /// Lists subfolders for the Projects tab's navigable picker
    /// (plans/projects-folder-picker.md). <c>path</c> is relative to the
    /// Projects Root and must stay inside its subtree; omitted = the root
    /// itself. Folders already registered as a project are flagged.
    /// </summary>
    [HttpGet("folders")]
    public IActionResult Folders([FromQuery] string? path)
    {
        _logger.CountRequest();
        var root = ProjectsRoot();
        if (root is null)
            return StatusCode(500, new { error = "Projects root unknown (no self repo registered)" });

        var rel = (path ?? "").Trim().Replace('\\', '/').Trim('/');
        var dir = rel.Length == 0 ? root : Path.GetFullPath(Path.Combine(root, rel));
        // Stay inside the Projects Root subtree (rejects .. traversal).
        var rootFull = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        if (!Path.TrimEndingDirectorySeparator(dir).StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Path is outside the projects root" });
        if (!Directory.Exists(dir))
            return BadRequest(new { error = $"Folder does not exist: {rel}" });

        var registeredPaths = _registry.GetAll()
            .Select(r => Path.TrimEndingDirectorySeparator(r.Path))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var folders = Directory.EnumerateDirectories(dir)
            .Select(p => new
            {
                name = Path.GetFileName(p),
                registered = registeredPaths.Contains(Path.TrimEndingDirectorySeparator(p)),
                isGitRepo = Directory.Exists(Path.Combine(p, ".git")),
            })
            .Where(f => !string.IsNullOrEmpty(f.name) && !f.name.StartsWith('.'))
            .OrderBy(f => f.name, StringComparer.OrdinalIgnoreCase);

        return Ok(new { root, path = rel, folders });
    }

    public record AddRequest(string? Folder, string? Name, string? Visibility, bool CreateFolder = false);

    /// <summary>
    /// Registers a project. <c>Folder</c> may be either a path relative to the
    /// Projects Root (as the navigable picker supplies) or an absolute path to
    /// an existing folder anywhere on the host, registered as-is. A missing
    /// relative folder is only created when <c>CreateFolder</c> is true —
    /// per plans/projects-folder-picker.md, typos must never create folders.
    /// </summary>
    [HttpPost]
    public IActionResult Add([FromBody] AddRequest request)
    {
        _logger.CountRequest();
        var folder = request?.Folder?.Trim();
        if (string.IsNullOrEmpty(folder))
            return BadRequest(new { error = "Folder name is required" });

        try
        {
            string path;
            bool created = false;

            if (Path.IsPathRooted(folder))
            {
                // Absolute path: register an existing folder anywhere on the host.
                path = Path.TrimEndingDirectorySeparator(Path.GetFullPath(folder));
                if (!Directory.Exists(path))
                    return BadRequest(new { error = $"Folder does not exist: {path}" });
            }
            else
            {
                // Relative path: resolve under the Projects Root, inside its subtree.
                var root = ProjectsRoot();
                if (root is null)
                    return StatusCode(500, new { error = "Projects root unknown (no self repo registered)" });

                path = Path.GetFullPath(Path.Combine(root, folder.Replace('\\', '/').Trim('/')));
                var rootFull = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
                if (!Path.TrimEndingDirectorySeparator(path).StartsWith(rootFull, StringComparison.OrdinalIgnoreCase)
                    || Path.TrimEndingDirectorySeparator(path).Equals(rootFull, StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = $"Invalid folder: {folder}" });

                if (!Directory.Exists(path))
                {
                    if (!request!.CreateFolder)
                        return BadRequest(new { error = $"Folder does not exist: {folder}" });
                    Directory.CreateDirectory(path);
                    created = true;
                    _logger.Info($"[REPO] Created project folder {path}");
                }
            }

            var r = _registry.Add(path, request!.Name, request.Visibility);
            return Ok(new { id = r.Id, name = r.Name, path = r.Path, exists = r.Exists, isGitRepo = r.IsGitRepo, isSelf = r.IsSelf, visibility = r.Visibility, created });
        }
        catch (Exception ex) when (ex is ArgumentException or DirectoryNotFoundException or IOException or UnauthorizedAccessException)
        {
            _logger.Error($"[REPO] Add failed: {ex.Message}");
            return BadRequest(new { error = ex.Message });
        }
    }

    public record VisibilityRequest(string? Visibility);

    /// <summary>Sets a project's UI-mode visibility ("basic" or "advanced").</summary>
    [HttpPost("{id}/visibility")]
    public IActionResult SetVisibility(string id, [FromBody] VisibilityRequest request)
    {
        _logger.CountRequest();
        if (!_registry.SetVisibility(id, request?.Visibility))
            return NotFound(new { error = "Unknown repository id" });
        var r = _registry.GetAll().First(x => x.Id == id);
        return Ok(new { id = r.Id, visibility = r.Visibility });
    }

    /// <summary>
    /// The folder new projects live in: the parent of the pinned self repo
    /// (the harness checkout sits inside the playground next to the projects).
    /// </summary>
    private string? ProjectsRoot()
    {
        var self = _registry.GetAll().FirstOrDefault(r => r.IsSelf);
        if (self is null) return null;
        return Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(self.Path));
    }
}
