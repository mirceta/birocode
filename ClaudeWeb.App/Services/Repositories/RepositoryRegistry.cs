using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Repositories;

/// <summary>
/// Operator-managed list of repositories the app can serve. This is the single
/// source of truth mapping a stable repo id to a trusted folder path; every
/// per-request lookup goes through here, so a client can only reach a folder
/// the operator has explicitly added.
///
/// Persisted to <c>%APPDATA%\ClaudeWeb\repositories.json</c> (a stable location
/// that survives rebuilds and reinstalls, unlike the bin-copied appsettings.json).
/// On first run, if no file exists, the legacy <see cref="AppConfig.WorkingDirectory"/>
/// seeds a single entry so existing setups keep working with zero changes.
///
/// Thread-safe: all reads/writes take a lock and hand back copies, since the
/// registry is a singleton touched by both Kestrel request threads and the
/// WinForms UI thread.
/// </summary>
public class RepositoryRegistry
{
    private readonly Logger _logger;
    private readonly string _storePath;
    private readonly object _gate = new();
    private readonly List<RepositoryConfig> _repos = new();

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public RepositoryRegistry(AppConfig config, Logger logger)
    {
        _logger = logger;
        _storePath = ResolveStorePath();
        Load(config);
    }

    /// <summary>A repository plus derived status the picker/UI cares about.</summary>
    public sealed record RepositoryInfo(string Id, string Name, string Path, bool Exists, bool IsGitRepo, bool IsSelf, string Visibility, int? LocalPort);

    /// <summary>Normalizes a visibility value: anything but "basic" is "advanced".</summary>
    public static string NormalizeVisibility(string? visibility) =>
        string.Equals(visibility?.Trim(), "basic", StringComparison.OrdinalIgnoreCase) ? "basic" : "advanced";

    /// <summary>All repositories, in operator order. Returns copies.</summary>
    public IReadOnlyList<RepositoryInfo> GetAll()
    {
        lock (_gate)
            return _repos.Select(ToInfo).ToList();
    }

    /// <summary>Looks up a repository by id. Returns null if unknown.</summary>
    public RepositoryConfig? TryGet(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        lock (_gate)
        {
            var match = _repos.FirstOrDefault(r => string.Equals(r.Id, id, StringComparison.Ordinal));
            return match is null ? null : Clone(match);
        }
    }

    /// <summary>The first repository, used as a default when a client sends no id.</summary>
    public RepositoryConfig? Default()
    {
        lock (_gate)
            return _repos.Count > 0 ? Clone(_repos[0]) : null;
    }

    /// <summary>
    /// Adds a repository for the given folder. The path must be an existing
    /// directory; adding the same path twice returns the existing entry. The
    /// name defaults to the folder name when not supplied; the visibility
    /// defaults to advanced-only.
    /// </summary>
    public RepositoryInfo Add(string path, string? name = null, string? visibility = null)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("Path is required", nameof(path));

        var full = System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(path));
        if (!Directory.Exists(full))
            throw new DirectoryNotFoundException($"Folder does not exist: {full}");

        lock (_gate)
        {
            var existing = _repos.FirstOrDefault(r =>
                string.Equals(System.IO.Path.TrimEndingDirectorySeparator(r.Path), full, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
                return ToInfo(existing);

            var repo = new RepositoryConfig
            {
                Id = Guid.NewGuid().ToString("N"),
                Name = string.IsNullOrWhiteSpace(name) ? (System.IO.Path.GetFileName(full) is { Length: > 0 } n ? n : full) : name.Trim(),
                Path = full,
                Visibility = NormalizeVisibility(visibility),
            };
            _repos.Add(repo);
            Save();
            _logger.Info($"[REPO] Added \"{repo.Name}\" ({repo.Path})");
            return ToInfo(repo);
        }
    }

    /// <summary>
    /// Removes a repository by id. No-op if the id is unknown. The pinned self
    /// repo cannot be removed.
    /// </summary>
    public bool Remove(string id)
    {
        lock (_gate)
        {
            var idx = _repos.FindIndex(r => string.Equals(r.Id, id, StringComparison.Ordinal));
            if (idx < 0) return false;
            if (_repos[idx].IsSelf)
            {
                _logger.Info("[REPO] Refused to remove the pinned self repo");
                return false;
            }
            var removed = _repos[idx];
            _repos.RemoveAt(idx);
            Save();
            _logger.Info($"[REPO] Removed \"{removed.Name}\" ({removed.Path})");
            return true;
        }
    }

    /// <summary>
    /// Ensures the harness's own source repo is registered as the pinned,
    /// non-removable self repo at index 0 (so it is the default project). Called
    /// at startup once the repo root is known. Updates the path if the install
    /// moved; no-op when <paramref name="repoRoot"/> is empty.
    /// </summary>
    public void EnsureSelfRepo(string? repoRoot, string name)
    {
        if (string.IsNullOrWhiteSpace(repoRoot) || !Directory.Exists(repoRoot)) return;
        var full = System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(repoRoot));

        lock (_gate)
        {
            var self = _repos.FirstOrDefault(r => r.IsSelf);
            if (self is null)
            {
                // Reuse an existing plain entry that already points at the root,
                // otherwise create one. Either way, pin it to the front.
                self = _repos.FirstOrDefault(r =>
                    string.Equals(System.IO.Path.TrimEndingDirectorySeparator(r.Path), full, StringComparison.OrdinalIgnoreCase));
                if (self is null)
                {
                    self = new RepositoryConfig { Id = Guid.NewGuid().ToString("N") };
                    _repos.Add(self);
                }
            }

            self.IsSelf = true;
            self.Name = name;
            self.Path = full;
            _repos.Remove(self);
            _repos.Insert(0, self);
            Save();
            _logger.Info($"[REPO] Pinned self repo \"{name}\" ({full})");
        }
    }

    /// <summary>Sets a repository's UI-mode visibility ("basic" or "advanced"). No-op if the id is unknown.</summary>
    public bool SetVisibility(string id, string? visibility)
    {
        lock (_gate)
        {
            var repo = _repos.FirstOrDefault(r => string.Equals(r.Id, id, StringComparison.Ordinal));
            if (repo is null) return false;
            repo.Visibility = NormalizeVisibility(visibility);
            Save();
            _logger.Info($"[REPO] Visibility of \"{repo.Name}\" -> {repo.Visibility}");
            return true;
        }
    }

    /// <summary>
    /// Sets the project's Local-tab port (plans/local-app-tab.md); null clears
    /// it. No-op if the id is unknown or the port is out of range.
    /// </summary>
    public bool SetLocalPort(string id, int? port)
    {
        if (port is < 1 or > 65535) return false;
        lock (_gate)
        {
            var repo = _repos.FirstOrDefault(r => string.Equals(r.Id, id, StringComparison.Ordinal));
            if (repo is null) return false;
            repo.LocalPort = port;
            Save();
            _logger.Info($"[REPO] Local port of \"{repo.Name}\" -> {(port?.ToString() ?? "cleared")}");
            return true;
        }
    }

    /// <summary>Renames a repository. No-op if the id is unknown or the name is blank.</summary>
    public bool Rename(string id, string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return false;
        lock (_gate)
        {
            var repo = _repos.FirstOrDefault(r => string.Equals(r.Id, id, StringComparison.Ordinal));
            if (repo is null) return false;
            repo.Name = name.Trim();
            Save();
            _logger.Info($"[REPO] Renamed {id} -> \"{repo.Name}\"");
            return true;
        }
    }

    // --- persistence ---------------------------------------------------------

    private void Load(AppConfig config)
    {
        try
        {
            if (File.Exists(_storePath))
            {
                var json = File.ReadAllText(_storePath);
                var loaded = JsonSerializer.Deserialize<List<RepositoryConfig>>(json) ?? new();
                lock (_gate)
                {
                    _repos.Clear();
                    foreach (var r in loaded)
                        if (!string.IsNullOrWhiteSpace(r.Id) && !string.IsNullOrWhiteSpace(r.Path))
                            _repos.Add(r);
                }
                _logger.Info($"[REPO] Loaded {_repos.Count} repositor(y/ies) from {_storePath}");
                return;
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[REPO] Failed to load {_storePath}: {ex.Message}");
        }

        // First run (or unreadable store): seed from the legacy working directory.
        if (!string.IsNullOrWhiteSpace(config.WorkingDirectory))
        {
            try
            {
                Directory.CreateDirectory(config.WorkingDirectory);
                var full = System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(config.WorkingDirectory));
                lock (_gate)
                {
                    _repos.Add(new RepositoryConfig
                    {
                        Id = Guid.NewGuid().ToString("N"),
                        Name = System.IO.Path.GetFileName(full) is { Length: > 0 } n ? n : full,
                        Path = full,
                    });
                }
                Save();
                _logger.Info($"[REPO] Seeded initial repository from WorkingDirectory ({full})");
            }
            catch (Exception ex)
            {
                _logger.Error($"[REPO] Failed to seed initial repository: {ex.Message}");
            }
        }
    }

    private void Save()
    {
        // Caller holds _gate.
        try
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(_storePath)!);
            File.WriteAllText(_storePath, JsonSerializer.Serialize(_repos, JsonOpts));
        }
        catch (Exception ex)
        {
            _logger.Error($"[REPO] Failed to persist {_storePath}: {ex.Message}");
        }
    }

    private static string ResolveStorePath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return System.IO.Path.Combine(appData, "ClaudeWeb", "repositories.json");
    }

    private RepositoryInfo ToInfo(RepositoryConfig r)
    {
        var exists = Directory.Exists(r.Path);
        var isGit = exists && Directory.Exists(System.IO.Path.Combine(r.Path, ".git"));
        return new RepositoryInfo(r.Id, r.Name, r.Path, exists, isGit, r.IsSelf, NormalizeVisibility(r.Visibility), r.LocalPort);
    }

    private static RepositoryConfig Clone(RepositoryConfig r) =>
        new() { Id = r.Id, Name = r.Name, Path = r.Path, IsSelf = r.IsSelf, Visibility = r.Visibility, LocalPort = r.LocalPort };
}
