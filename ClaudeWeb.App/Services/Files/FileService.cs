using System.Text;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Files;

/// <summary>
/// Browses and reads files under a repository root supplied by the caller (the
/// currently selected repository's folder).
///
/// SECURITY: this is the most security-sensitive module -- a path-traversal
/// bug here is arbitrary file read on the host. Every requested path is
/// resolved against the supplied root and validated to stay inside it
/// (see <see cref="ResolveSafePath"/>). The root comes from the server-trusted
/// repository registry (keyed by id), never from a client-supplied path.
/// </summary>
public class FileService
{
    private readonly Logger _logger;

    /// <summary>Maximum file size returned by <see cref="ReadFile"/> (1 MB).</summary>
    private const long MaxReadBytes = 1024 * 1024;

    /// <summary>Largest file we'll scan for a line count in a directory listing
    /// (5 MB). Bigger files (usually data/minified/generated) report no count
    /// rather than make listing a folder pay a large read.</summary>
    private const long MaxLineCountBytes = 5 * 1024 * 1024;

    public FileService(Logger logger)
    {
        _logger = logger;
    }

    /// <summary>Outcome of a path-validation attempt. Either valid (with the
    /// resolved absolute path) or a violation that must map to HTTP 403.</summary>
    public sealed record PathResult(bool IsValid, string FullPath, string Reason);

    /// <summary>An entry in a directory listing. <c>Lines</c> is the file's line
    /// count for the size badge (plans/file-size-warnings.md); null for
    /// directories, binary files, and files over the scan cap.</summary>
    public sealed record FileEntry(string Name, string Type, long Size, int? Lines);

    /// <summary>The content of a read file.</summary>
    public sealed record FileContent(string Content, string Path);

    /// <summary>
    /// Resolves a client-supplied relative path against the given repository
    /// root and verifies it cannot escape that root. Returns an invalid
    /// result (caller -> HTTP 403) on any violation; never throws on bad input.
    /// </summary>
    public PathResult ResolveSafePath(string? workingDir, string? requestedPath)
    {
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
            .Select(d => new FileEntry(Path.GetFileName(d), "dir", 0, null))
            .OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase);

        var files = Directory.EnumerateFiles(fullPath)
            .Select(f =>
            {
                var size = SafeFileLength(f);
                return new FileEntry(Path.GetFileName(f), "file", size, CountLines(f, size));
            })
            .OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase);

        return dirs.Concat(files).ToList();
    }

    /// <summary>Result of a recursive file index: the relative paths plus
    /// whether the walk hit the cap (so the UI can say "refine your search").</summary>
    public sealed record FileIndex(IReadOnlyList<string> Files, bool Truncated);

    /// <summary>Directory names skipped by the recursive index — VCS, build
    /// output, and dependency trees that would bloat a fuzzy file search with
    /// noise no one searches for. Matched case-insensitively on the dir name.</summary>
    private static readonly HashSet<string> SkipDirs = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git", ".hg", ".svn", "node_modules", "bin", "obj", "dist", "build",
        "out", "target", ".vs", ".vscode", ".idea", ".next", ".nuxt", ".cache",
        ".selfdev-build", ".preview-test", ".claudeweb-preview",
    };

    /// <summary>Cap on indexed files. Big enough for any real repo's source,
    /// bounded so a pathological tree can't make the walk run away.</summary>
    private const int MaxIndexedFiles = 20000;

    /// <summary>
    /// Walks the repository root recursively and returns every file's path
    /// relative to the root (forward-slashed), for the Files tab's fuzzy search
    /// (plans/files-ide-mode.md). Skips VCS/build/dependency dirs
    /// (<see cref="SkipDirs"/>) and stops at <see cref="MaxIndexedFiles"/>.
    /// </summary>
    public FileIndex ListAllFiles(string fullRoot)
    {
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(fullRoot));
        var files = new List<string>();
        var truncated = false;

        var stack = new Stack<string>();
        stack.Push(root);
        while (stack.Count > 0)
        {
            var dir = stack.Pop();

            IEnumerable<string> subDirs;
            try { subDirs = Directory.EnumerateDirectories(dir); }
            catch { continue; } // unreadable dir — skip rather than fail the whole index
            foreach (var sub in subDirs)
            {
                var name = Path.GetFileName(sub);
                if (SkipDirs.Contains(name)) continue;
                // Don't follow reparse points (symlinks/junctions) — they can loop
                // or escape the root; the safe-path check covers reads, not walks.
                try { if (new DirectoryInfo(sub).Attributes.HasFlag(FileAttributes.ReparsePoint)) continue; }
                catch { continue; }
                stack.Push(sub);
            }

            IEnumerable<string> dirFiles;
            try { dirFiles = Directory.EnumerateFiles(dir); }
            catch { continue; }
            foreach (var f in dirFiles)
            {
                if (files.Count >= MaxIndexedFiles) { truncated = true; break; }
                var rel = Path.GetRelativePath(root, f).Replace('\\', '/');
                files.Add(rel);
            }
            if (truncated) break;
        }

        files.Sort(StringComparer.OrdinalIgnoreCase);
        return new FileIndex(files, truncated);
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

    /// <summary>
    /// Counts the lines in a text file for the directory listing's size badge
    /// (plans/file-size-warnings.md). "Lines" = newline count, plus one when the
    /// final line is unterminated (so a one-line file with no trailing newline
    /// reports 1). Returns null — meaning "no badge" — for binary files (a NUL
    /// byte in the first 8 KB, matching <see cref="LooksBinary"/>), files over
    /// the scan cap, or any read error. Streams in chunks so it never holds the
    /// whole file in memory.
    /// </summary>
    private static int? CountLines(string path, long size)
    {
        if (size == 0) return 0;
        if (size > MaxLineCountBytes) return null;

        try
        {
            using var stream = File.OpenRead(path);
            var buffer = new byte[64 * 1024];
            long newlines = 0;
            byte lastByte = 0;
            bool firstChunk = true;
            int read;

            while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
            {
                // Binary guard on the first chunk only, mirroring LooksBinary.
                if (firstChunk && buffer.AsSpan(0, Math.Min(read, 8192)).IndexOf((byte)0) >= 0)
                    return null;
                firstChunk = false;

                var span = buffer.AsSpan(0, read);
                int idx;
                while ((idx = span.IndexOf((byte)'\n')) >= 0)
                {
                    newlines++;
                    span = span[(idx + 1)..];
                }
                lastByte = buffer[read - 1];
            }

            return (int)(newlines + (lastByte == (byte)'\n' ? 0 : 1));
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Heuristic binary check: a NUL byte in the first 8 KB.</summary>
    private static bool LooksBinary(byte[] bytes)
    {
        var span = bytes.AsSpan(0, Math.Min(bytes.Length, 8192));
        return span.IndexOf((byte)0) >= 0;
    }
}
