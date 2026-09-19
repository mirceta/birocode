using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.HubFs;

/// <summary>
/// The hub file system (openspec hub-file-system, sizes unbounded since hubfs-large-files-tree):
/// a SANDBOXED store under the harness's data dir (<c>%APPDATA%\ClaudeWeb\hubfs\files\</c> +
/// <c>index.json</c>) that fleet repo agents upload to and download from, and the arch moves
/// files through between machines. Never a window onto the real file system: a hub path is a
/// short forward-slash path of plain segments (<see cref="Normalize"/>), resolved strictly
/// under the files root; dot segments, drive letters and absolute paths are refused before
/// anything touches disk. Every entry remembers who uploaded it (agent handle), from which
/// machine, when, how big, its SHA-256, a version that grows on overwrite, and a note.
///
/// SIZE: there is no size limit — a 5 GB database is a normal upload. Every write and read is
/// STREAMED (<see cref="PutStream"/>, <see cref="Open"/>): bytes go through a 1 MB buffer
/// straight to a temp file beside the target, hashed as they pass, then moved into place; a
/// read hands back a FileStream. The one hard check is free disk space on the store's volume
/// (a known length must fit with a margin). Nothing expires by itself — the Operator deletes on
/// the File System tab; the tab marks files older than <see cref="StaleDays"/> as stale.
/// Thread-safe: the index is under one lock; copies run outside it.
/// </summary>
public sealed class HubFileStore
{
    public const int MaxPathChars = 240;
    public const int MaxSegments = 8;
    public const int MaxNoteChars = 300;
    public const int StaleDays = 30;
    public const string Folder = "hubfs";
    public const int BufferBytes = 1024 * 1024;
    /// <summary>Free space that must remain on the volume after a write of a known size.</summary>
    public const long FreeSpaceMarginBytes = 256L * 1024 * 1024;

    public sealed record Entry(string Path, long Size, string Sha256, string ContentType, string UploadedBy, string Machine,
        long UploadedAt, long UpdatedAt, int Version, string? Note, string? Via);

    public sealed record Stats(int Files, long Bytes, long? FreeBytes, int StaleDays, string Root);

    private static readonly Regex Segment = new(@"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$", RegexOptions.Compiled);
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _root;
    private readonly string _filesRoot;
    private readonly string _indexPath;
    private readonly Func<long> _now;
    private readonly object _gate = new();
    private Dictionary<string, Entry> _index = new(StringComparer.Ordinal);

    /// <param name="dataDir">overrides the data dir (tests); the store lives in its <c>hubfs</c> folder</param>
    public HubFileStore(Logger logger, string? dataDir = null, Func<long>? now = null)
    {
        _logger = logger;
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _root = System.IO.Path.Combine(dataDir ?? AppPaths.DataDir, Folder);
        _filesRoot = System.IO.Path.Combine(_root, "files");
        _indexPath = System.IO.Path.Combine(_root, "index.json");
        Load();
    }

    public string Root => _root;

    // ---- paths (pure) -----------------------------------------------------------------------

    /// <summary>The one path grammar: forward-slash segments of letters, digits, <c>. _ -</c>
    /// (each starting with a letter or digit, ≤ 80 chars), at most <see cref="MaxSegments"/>
    /// segments and <see cref="MaxPathChars"/> chars. Backslashes are accepted as separators;
    /// leading/trailing slashes are dropped. Returns the normalized path, or null with the reason.</summary>
    public static string? Normalize(string? path, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(path)) { error = "path is required (e.g. fixtures/customers.json)"; return null; }
        var p = path.Trim().Replace('\\', '/');
        if (p.Contains(':')) { error = "a hub path has no drive or scheme — it is a relative path inside the hub store"; return null; }
        var parts = p.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) { error = "path is required"; return null; }
        if (parts.Length > MaxSegments) { error = $"at most {MaxSegments} path segments"; return null; }
        foreach (var seg in parts)
        {
            if (seg == "." || seg == "..") { error = "dot segments (. / ..) are not allowed — the store is a sandbox"; return null; }
            if (!Segment.IsMatch(seg)) { error = $"segment \"{seg}\" is not allowed: letters, digits, dot, underscore, dash; starts with a letter or digit; ≤ 80 chars"; return null; }
        }
        var norm = string.Join('/', parts);
        if (norm.Length > MaxPathChars) { error = $"path longer than {MaxPathChars} chars"; return null; }
        return norm;
    }

    private string DiskPath(string normalized)
    {
        var full = System.IO.Path.GetFullPath(System.IO.Path.Combine(_filesRoot, normalized.Replace('/', System.IO.Path.DirectorySeparatorChar)));
        var root = System.IO.Path.GetFullPath(_filesRoot) + System.IO.Path.DirectorySeparatorChar;
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("hub path escaped the store");
        return full;
    }

    public static string ContentTypeOf(string path)
    {
        var ext = System.IO.Path.GetExtension(path).ToLowerInvariant();
        return ext switch
        {
            ".json" => "application/json", ".txt" or ".log" or ".md" or ".csv" or ".sql" or ".cs" or ".js" or ".ts" or ".py" or ".ps1" or ".yml" or ".yaml" or ".xml" or ".html" or ".css" => "text/plain",
            ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", ".gif" => "image/gif", ".svg" => "image/svg+xml", ".pdf" => "application/pdf",
            ".zip" => "application/zip", ".gz" or ".tgz" => "application/gzip", _ => "application/octet-stream",
        };
    }

    // ---- reads ---------------------------------------------------------------------------------

    public Entry? Find(string? path)
    {
        var norm = Normalize(path, out _);
        if (norm is null) return null;
        lock (_gate) return _index.TryGetValue(norm, out var e) ? e : null;
    }

    /// <summary>Every entry (optionally under a prefix, which is a normalized path or a folder), by path.</summary>
    public IReadOnlyList<Entry> List(string? prefix = null)
    {
        var pre = string.IsNullOrWhiteSpace(prefix) ? null : Normalize(prefix, out _);
        lock (_gate)
            return _index.Values
                .Where(e => pre is null || e.Path.Equals(pre, StringComparison.Ordinal) || e.Path.StartsWith(pre + "/", StringComparison.Ordinal))
                .OrderBy(e => e.Path, StringComparer.Ordinal).ToList();
    }

    /// <summary>Free bytes on the store's volume, or null when the platform will not say.</summary>
    public long? FreeBytes()
    {
        try
        {
            Directory.CreateDirectory(_root);
            return new DriveInfo(System.IO.Path.GetPathRoot(System.IO.Path.GetFullPath(_root))!).AvailableFreeSpace;
        }
        catch { return null; }
    }

    public Stats GetStats()
    {
        lock (_gate) return new Stats(_index.Count, _index.Values.Sum(e => e.Size), FreeBytes(), StaleDays, _root);
    }

    /// <summary>The entry and an open, sequential, shareable read stream — the caller disposes
    /// it. Null when absent (an entry whose bytes vanished is dropped from the index).</summary>
    public (Entry Entry, FileStream Stream)? Open(string? path)
    {
        var e = Find(path);
        if (e is null) return null;
        try
        {
            var fs = new FileStream(DiskPath(e.Path), FileMode.Open, FileAccess.Read, FileShare.Read, BufferBytes, FileOptions.SequentialScan | FileOptions.Asynchronous);
            return (e, fs);
        }
        catch (FileNotFoundException) { Forget(e.Path); return null; }
        catch (DirectoryNotFoundException) { Forget(e.Path); return null; }
    }

    /// <summary>The entry and ALL its bytes in memory — for small files and tests only; a
    /// transfer or a download uses <see cref="Open"/>.</summary>
    public (Entry Entry, byte[] Bytes)? Get(string? path)
    {
        var opened = Open(path);
        if (opened is null) return null;
        var (e, fs) = opened.Value;
        using (fs)
        {
            using var ms = new MemoryStream();
            fs.CopyTo(ms);
            return (e, ms.ToArray());
        }
    }

    private void Forget(string norm) { lock (_gate) { if (_index.Remove(norm)) Save(); } }

    // ---- writes --------------------------------------------------------------------------------

    /// <summary>Store bytes already in memory (small content, texts, tests): the streamed path over them.</summary>
    public (Entry? Entry, string? Error) Put(string? path, byte[] content, string uploadedBy, string machine, string? note = null,
        bool overwrite = true, string? via = null, long? uploadedAt = null)
    {
        if (content is null) return (null, "no content");
        using var ms = new MemoryStream(content, writable: false);
        return PutStream(path, ms, content.LongLength, uploadedBy, machine, note, overwrite, via, uploadedAt);
    }

    /// <summary>Store a stream of any size at a hub path: refused up front when the path is bad,
    /// the path exists and <paramref name="overwrite"/> is false, or a known
    /// <paramref name="expectedLength"/> does not fit the volume; then copied through a buffer to
    /// a temp file beside the target (hashed on the way, <paramref name="progress"/> told the
    /// bytes so far), then moved into place under the lock. <paramref name="via"/> names the relay
    /// when the arch moved the file; <paramref name="uploadedAt"/> keeps the original stamp then.</summary>
    public (Entry? Entry, string? Error) PutStream(string? path, Stream source, long? expectedLength, string uploadedBy, string machine, string? note = null,
        bool overwrite = true, string? via = null, long? uploadedAt = null, Action<long>? progress = null, CancellationToken ct = default)
    {
        var norm = Normalize(path, out var err);
        if (norm is null) return (null, err);
        if (source is null) return (null, "no content");
        var by = string.IsNullOrWhiteSpace(uploadedBy) ? "unknown" : uploadedBy.Trim();
        var m = string.IsNullOrWhiteSpace(machine) ? "?" : machine.Trim();
        var n = string.IsNullOrWhiteSpace(note) ? null : (note.Trim().Length > MaxNoteChars ? note.Trim()[..MaxNoteChars] : note.Trim());
        Entry? existing;
        lock (_gate) _index.TryGetValue(norm, out existing);
        if (existing is not null && !overwrite) return (null, $"{norm} already exists on the hub (v{existing.Version}, by {existing.UploadedBy}); pass overwrite to replace it");
        if (expectedLength is { } len && FreeBytes() is { } free && len + FreeSpaceMarginBytes > free)
            return (null, $"not enough free space on the hub's volume: {Human(len)} needed, {Human(free)} free (a {Human(FreeSpaceMarginBytes)} margin is kept)");

        string disk;
        try { disk = DiskPath(norm); }
        catch (Exception ex) { return (null, ex.Message); }
        var tmp = disk + ".tmp-" + Guid.NewGuid().ToString("N")[..8];
        long written = 0;
        string sha;
        try
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(disk)!);
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            using (var fs = new FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None, BufferBytes, FileOptions.SequentialScan))
            {
                var buf = new byte[BufferBytes];
                int read;
                while ((read = source.Read(buf, 0, buf.Length)) > 0)
                {
                    ct.ThrowIfCancellationRequested();
                    fs.Write(buf, 0, read);
                    hash.AppendData(buf, 0, read);
                    written += read;
                    progress?.Invoke(written);
                }
                fs.Flush(true);
            }
            sha = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
        }
        catch (Exception ex)
        {
            try { if (File.Exists(tmp)) File.Delete(tmp); } catch { /* best effort */ }
            _logger.Error($"[HUBFS] could not write {norm}: {ex.Message}");
            return (null, ex is OperationCanceledException ? "the upload was cancelled" : $"could not write the file: {ex.Message}");
        }
        lock (_gate)
        {
            _index.TryGetValue(norm, out existing);
            if (existing is not null && !overwrite)
            {
                try { File.Delete(tmp); } catch { /* best effort */ }
                return (null, $"{norm} appeared on the hub while this upload ran (v{existing.Version}, by {existing.UploadedBy}); pass overwrite to replace it");
            }
            try { File.Move(tmp, disk, overwrite: true); }
            catch (Exception ex)
            {
                try { File.Delete(tmp); } catch { /* best effort */ }
                _logger.Error($"[HUBFS] could not place {norm}: {ex.Message}");
                return (null, $"could not place the file: {ex.Message}");
            }
            var now = _now();
            var entry = new Entry(norm, written, sha, ContentTypeOf(norm), by, m,
                existing?.UploadedAt ?? uploadedAt ?? now, now, (existing?.Version ?? 0) + 1, n ?? existing?.Note, via);
            _index[norm] = entry;
            Save();
            _logger.Info($"[HUBFS] {by}@{m} put {norm} ({Human(entry.Size)}, v{entry.Version}{(via is null ? "" : $", via {via}")})");
            return (entry, null);
        }
    }

    public bool Delete(string? path, string by = "operator")
    {
        var norm = Normalize(path, out _);
        if (norm is null) return false;
        lock (_gate)
        {
            if (!_index.Remove(norm)) return false;
            try { var disk = DiskPath(norm); if (File.Exists(disk)) File.Delete(disk); PruneEmptyDirs(System.IO.Path.GetDirectoryName(disk)!); }
            catch (Exception ex) { _logger.Error($"[HUBFS] delete {norm}: {ex.Message}"); }
            Save();
            _logger.Info($"[HUBFS] {by} deleted {norm}");
            return true;
        }
    }

    private void PruneEmptyDirs(string dir)
    {
        var root = System.IO.Path.GetFullPath(_filesRoot);
        while (dir.Length > root.Length && Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any())
        {
            Directory.Delete(dir);
            dir = System.IO.Path.GetDirectoryName(dir)!;
        }
    }

    /// <summary>"1.5 KB", "64 MB", "2 GB" — invariant culture, so the text reads the same on every box.</summary>
    public static string Human(long bytes)
    {
        var inv = System.Globalization.CultureInfo.InvariantCulture;
        return bytes switch
        {
            < 1024 => $"{bytes} B",
            < 1024 * 1024 => (bytes / 1024.0).ToString("0.#", inv) + " KB",
            < 1024L * 1024 * 1024 => (bytes / (1024.0 * 1024)).ToString("0.#", inv) + " MB",
            _ => (bytes / (1024.0 * 1024 * 1024)).ToString("0.##", inv) + " GB",
        };
    }

    // ---- persistence ----------------------------------------------------------------------------

    private void Load()
    {
        try
        {
            if (!File.Exists(_indexPath)) return;
            var loaded = JsonSerializer.Deserialize<Dictionary<string, Entry>>(File.ReadAllText(_indexPath));
            if (loaded is not null) _index = new Dictionary<string, Entry>(loaded, StringComparer.Ordinal);
            _logger.Info($"[HUBFS] {_index.Count} file(s) indexed at {_root}");
        }
        catch (Exception ex) { _logger.Error($"[HUBFS] could not load {_indexPath}: {ex.Message}"); }
    }

    private void Save()
    {
        try
        {
            Directory.CreateDirectory(_root);
            File.WriteAllText(_indexPath, JsonSerializer.Serialize(_index, JsonOpts));
        }
        catch (Exception ex) { _logger.Error($"[HUBFS] could not persist {_indexPath}: {ex.Message}"); }
    }
}
