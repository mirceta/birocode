using System.Text;
using ClaudeWeb.Models;

namespace ClaudeWeb.Services;

/// <summary>
/// Browses and reads files under <see cref="AppConfig.WorkingDirectory"/>.
///
/// SECURITY: this is the most security-sensitive module -- a path-traversal
/// bug here is arbitrary file read on the host. Every requested path is
/// resolved against the working directory and validated to stay inside it
/// (see <see cref="ResolveSafePath"/>). The working directory is read
/// per-request (never cached) because the operator can change it at runtime.
/// </summary>
public class FileService
{
    private readonly AppConfig _config;
    private readonly Logger _logger;

    /// <summary>Maximum file size returned by <see cref="ReadFile"/> (1 MB).</summary>
    private const long MaxReadBytes = 1024 * 1024;

    public FileService(AppConfig config, Logger logger)
    {
        _config = config;
        _logger = logger;
    }

    /// <summary>Outcome of a path-validation attempt. Either valid (with the
    /// resolved absolute path) or a violation that must map to HTTP 403.</summary>
    public sealed record PathResult(bool IsValid, string FullPath, string Reason);

    /// <summary>An entry in a directory listing.</summary>
    public sealed record FileEntry(string Name, string Type, long Size);

    /// <summary>The content of a read file.</summary>
    public sealed record FileContent(string Content, string Path);

    /// <summary>
    /// Resolves a client-supplied relative path against the current working
    /// directory and verifies it cannot escape that root. Returns an invalid
    /// result (caller -> HTTP 403) on any violation; never throws on bad input.
    /// </summary>
    public PathResult ResolveSafePath(string? requestedPath)
    {
        var workingDir = _config.WorkingDirectory;

        if (string.IsNullOrWhiteSpace(workingDir))
            return new PathResult(false, "", "Working directory is not configured");

        // Normalize the root to a full path WITHOUT a trailing separator, then
        // build a comparison prefix that always ends in one separator. This
        // prevents "C:\work-evil" from being accepted as a child of "C:\work".
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(workingDir));
        var rootPrefix = root + Path.DirectorySeparatorChar;

        // Treat "/" and "" as the root itself. Strip any leading slashes so the
        // path is always treated as RELATIVE to the working dir, never absolute.
        var relative = (requestedPath ?? "/").Replace('\\', '/').Trim();
        relative = relative.TrimStart('/');

        // Reject ".." outright (defense in depth -- GetFullPath also collapses it).
        if (relative.Split('/').Contains(".."))
            return new PathResult(false, "", "Path contains '..'");

        string fullPath;
        try
        {
            // Combine against the root. Because we stripped leading slashes,
            // Path.Combine cannot reset to a drive root or absolute path.
            fullPath = Path.GetFullPath(Path.Combine(root, relative));
        }
        catch
        {
            return new PathResult(false, "", "Path is malformed");
        }

        // The resolved path must be the root itself or live strictly underneath it.
        var insideRoot = string.Equals(fullPath, root, StringComparison.OrdinalIgnoreCase)
            || fullPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase);

        if (!insideRoot)
            return new PathResult(false, "", "Path escapes the working directory");

        // Reject symlinks/junctions whose real target escapes the root. We only
        // inspect existing entries; non-existent paths are handled by callers.
        if (LinkEscapesRoot(fullPath, root, rootPrefix))
            return new PathResult(false, "", "Path resolves to a link outside the working directory");

        return new PathResult(true, fullPath, "");
    }

    /// <summary>
    /// Lists the entries in the given directory: directories first, then files,
    /// alphabetical within each group. Throws <see cref="DirectoryNotFoundException"/>
    /// if the (already-validated) path is not an existing directory.
    /// </summary>
    public IReadOnlyList<FileEntry> ListDirectory(string fullPath)
    {
        if (!Directory.Exists(fullPath))
            throw new DirectoryNotFoundException("Directory not found");

        var dirs = Directory.EnumerateDirectories(fullPath)
            .Select(d => new FileEntry(Path.GetFileName(d), "dir", 0))
            .OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase);

        var files = Directory.EnumerateFiles(fullPath)
            .Select(f => new FileEntry(Path.GetFileName(f), "file", SafeFileLength(f)))
            .OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase);

        return dirs.Concat(files).ToList();
    }

    /// <summary>
    /// Reads a UTF-8 text file. Returns null when the file is missing, too
    /// large (>1 MB), or detected as binary -- the caller maps null to an
    /// error response rather than returning raw bytes.
    /// </summary>
    public FileContent? ReadFile(string fullPath, string requestedPath, out string error)
    {
        error = "";

        if (!File.Exists(fullPath))
        {
            error = "File not found";
            return null;
        }

        var info = new FileInfo(fullPath);
        if (info.Length > MaxReadBytes)
        {
            error = $"File is too large to display ({info.Length} bytes, limit {MaxReadBytes})";
            return null;
        }

        byte[] bytes;
        try { bytes = File.ReadAllBytes(fullPath); }
        catch (Exception ex)
        {
            error = $"Could not read file: {ex.Message}";
            return null;
        }

        if (LooksBinary(bytes))
        {
            error = "File appears to be binary and cannot be displayed";
            return null;
        }

        return new FileContent(Encoding.UTF8.GetString(bytes), requestedPath);
    }

    // --- helpers -------------------------------------------------------------

    /// <summary>True if any existing component along the path is a reparse
    /// point (symlink/junction) whose resolved target leaves the root.</summary>
    private static bool LinkEscapesRoot(string fullPath, string root, string rootPrefix)
    {
        FileSystemInfo? info = Directory.Exists(fullPath)
            ? new DirectoryInfo(fullPath)
            : File.Exists(fullPath) ? new FileInfo(fullPath) : null;

        if (info is null)
            return false; // nothing on disk yet -- normal-path checks already passed

        if (!info.Attributes.HasFlag(FileAttributes.ReparsePoint))
            return false;

        var target = info.ResolveLinkTarget(returnFinalTarget: true);
        if (target is null)
            return false;

        var resolved = Path.TrimEndingDirectorySeparator(Path.GetFullPath(target.FullName));
        var insideRoot = string.Equals(resolved, root, StringComparison.OrdinalIgnoreCase)
            || (resolved + Path.DirectorySeparatorChar).StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase)
            || resolved.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase);

        return !insideRoot;
    }

    private static long SafeFileLength(string path)
    {
        try { return new FileInfo(path).Length; }
        catch { return 0; }
    }

    /// <summary>Heuristic binary check: a NUL byte in the first 8 KB.</summary>
    private static bool LooksBinary(byte[] bytes)
    {
        var span = bytes.AsSpan(0, Math.Min(bytes.Length, 8192));
        return span.IndexOf((byte)0) >= 0;
    }
}
