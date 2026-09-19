using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.HubFs;

/// <summary>
/// The hub file system (openspec hub-file-system): a SANDBOXED store under the harness's data
/// dir (<c>%APPDATA%\ClaudeWeb\hubfs\files\</c> + <c>index.json</c>) that fleet repo agents
/// upload to and download from, and the arch moves files through between machines. Never a
/// window onto the real file system: a hub path is a short forward-slash path of plain
/// segments (<see cref="Normalize"/>), resolved strictly under the files root; dot segments,
/// drive letters, backslashes and absolute paths are refused before anything touches disk.
/// Every entry remembers who uploaded it (agent handle), from which machine, when, how big,
/// its SHA-256, a version that grows on overwrite, and an optional note. Limits: one file up
/// to <see cref="MaxFileBytes"/>, the store up to <see cref="MaxTotalBytes"/> and
/// <see cref="MaxFiles"/>. Nothing expires by itself — the Operator deletes on the File System
/// tab; the tab marks files older than <see cref="StaleDays"/> as stale. Thread-safe: one lock,
/// copies out.
/// </summary>
public sealed class HubFileStore
{
    public const long MaxFileBytes = 64L * 1024 * 1024;
    public const long MaxTotalBytes = 2L * 1024 * 1024 * 1024;
    public const int MaxFiles = 5000;
    public const int MaxPathChars = 240;
    public const int MaxSegments = 8;
    public const int MaxNoteChars = 300;
    public const int StaleDays = 30;
    public const string Folder = "hubfs";

    public sealed record Entry(string Path, long Size, string Sha256, string ContentType, string UploadedBy, string Machine,
        long UploadedAt, long UpdatedAt, int Version, string? Note, string? Via);

    public sealed record Stats(int Files, long Bytes, long MaxFileBytes, long MaxTotalBytes, int MaxFiles, int StaleDays, string Root);

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

    public Stats GetStats()
    {
        lock (_gate) return new Stats(_index.Count, _index.Values.Sum(e => e.Size), MaxFileBytes, MaxTotalBytes, MaxFiles, StaleDays, _root);
    }

    /// <summary>The entry and its bytes, or null when absent (or its bytes vanished — then the index entry is dropped).</summary>
    public (Entry Entry, byte[] Bytes)? Get(string? path)
    {
        var e = Find(path);
        if (e is null) return null;
        try { return (e, File.ReadAllBytes(DiskPath(e.Path))); }
        catch (FileNotFoundException) { lock (_gate) { _index.Remove(e.Path); Save(); } return null; }
        catch (DirectoryNotFoundException) { lock (_gate) { _index.Remove(e.Path); Save(); } return null; }
    }

    // ---- writes --------------------------------------------------------------------------------

    /// <summary>Store bytes at a hub path. An existing path is replaced (version + 1) unless
    /// <paramref name="overwrite"/> is false. <paramref name="via"/> names the relay ("arch ← MONSTER")
    /// when the arch moved the file; <paramref name="uploadedAt"/> keeps the original stamp then.</summary>
    public (Entry? Entry, string? Error) Put(string? path, byte[] content, string uploadedBy, string machine, string? note = null,
        bool overwrite = true, string? via = null, long? uploadedAt = null)
    {
        var norm = Normalize(path, out var err);
        if (norm is null) return (null, err);
        if (content is null) return (null, "no content");
        if (content.LongLength > MaxFileBytes) return (null, $"file is {Human(content.LongLength)}; the hub takes files up to {Human(MaxFileBytes)}");
        var by = string.IsNullOrWhiteSpace(uploadedBy) ? "unknown" : uploadedBy.Trim();
        var m = string.IsNullOrWhiteSpace(machine) ? "?" : machine.Trim();
        var n = string.IsNullOrWhiteSpace(note) ? null : (note.Trim().Length > MaxNoteChars ? note.Trim()[..MaxNoteChars] : note.Trim());
        lock (_gate)
        {
            _index.TryGetValue(norm, out var existing);
            if (existing is not null && !overwrite) return (null, $"{norm} already exists on the hub (v{existing.Version}, by {existing.UploadedBy}); pass overwrite to replace it");
            var total = _index.Values.Where(e => e.Path != norm).Sum(e => e.Size) + content.LongLength;
            if (total > MaxTotalBytes) return (null, $"the hub store would exceed {Human(MaxTotalBytes)} ({Human(total)}); delete something first");
            if (existing is null && _index.Count >= MaxFiles) return (null, $"the hub store holds its maximum of {MaxFiles} files; delete something first");
            string disk;
            try { disk = DiskPath(norm); }
            catch (Exception ex) { return (null, ex.Message); }
            try
            {
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(disk)!);
                var tmp = disk + ".tmp-" + Guid.NewGuid().ToString("N")[..8];
                File.WriteAllBytes(tmp, content);
                File.Move(tmp, disk, overwrite: true);
            }
            catch (Exception ex)
            {
                _logger.Error($"[HUBFS] could not write {norm}: {ex.Message}");
                return (null, $"could not write the file: {ex.Message}");
            }
            var now = _now();
            var entry = new Entry(norm, content.LongLength, Sha(content), ContentTypeOf(norm), by, m,
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

    private static string Sha(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

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
