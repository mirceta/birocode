using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Dock;

/// <summary>
/// One agent tab in the Dock (the Agents tab of the web UI).
/// </summary>
public class DockTab
{
    public string Id { get; set; } = "";
    public string RepoId { get; set; } = "";
    public string RepoName { get; set; } = "";
    public string? SessionId { get; set; }
    public string Status { get; set; } = "idle";
    public long CreatedAt { get; set; }

    /// <summary>
    /// User-chosen highlight colour for the agent card (plans/agent-color.md),
    /// a CSS hex like "#ef4444", or null/empty for no mark. Shared across
    /// devices like the rest of the tab.
    /// </summary>
    public string? Color { get; set; }
}

/// <summary>
/// Backend-owned, authoritative list of agent tabs, shared by every device
/// (see plans/dock-sync.md). Replaces the per-browser localStorage dock so
/// the same agents appear wherever the user logs in.
///
/// Persisted to <c>%APPDATA%\ClaudeWeb\dock.json</c>, same pattern as
/// <see cref="Repositories.RepositoryRegistry"/>. Thread-safe: all access
/// takes a lock and hands back copies (singleton touched by Kestrel threads).
/// </summary>
public class DockRegistry
{
    private readonly Logger _logger;
    private readonly string _storePath;
    private readonly object _gate = new();
    private readonly List<DockTab> _tabs = new();

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public DockRegistry(Logger logger)
    {
        _logger = logger;
        _storePath = ResolveStorePath();
        Load();
    }

    /// <summary>All tabs in creation order. Returns copies.</summary>
    public IReadOnlyList<DockTab> GetAll()
    {
        lock (_gate) return _tabs.Select(Clone).ToList();
    }

    /// <summary>
    /// Adds a tab for a repo. The client may supply the id (it creates tabs
    /// optimistically and uses the id as its conversation key); posting an id
    /// that already exists returns the existing tab unchanged. The remaining
    /// optional fields let a client migrate its legacy localStorage tabs
    /// without losing their conversation linkage.
    /// </summary>
    public DockTab Add(string repoId, string repoName, string? sessionId = null,
        string? status = null, long? createdAt = null, string? id = null, string? color = null)
    {
        if (string.IsNullOrWhiteSpace(repoId))
            throw new ArgumentException("repoId is required", nameof(repoId));

        if (!string.IsNullOrWhiteSpace(id))
        {
            lock (_gate)
            {
                var existing = _tabs.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.Ordinal));
                if (existing != null) return Clone(existing);
            }
        }

        var tab = new DockTab
        {
            Id = string.IsNullOrWhiteSpace(id) ? Guid.NewGuid().ToString("N") : id,
            RepoId = repoId,
            RepoName = repoName ?? "",
            SessionId = string.IsNullOrWhiteSpace(sessionId) ? null : sessionId,
            Status = string.IsNullOrWhiteSpace(status) ? "idle" : status,
            CreatedAt = createdAt ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Color = string.IsNullOrWhiteSpace(color) ? null : color,
        };
        lock (_gate)
        {
            _tabs.Add(tab);
            Save();
        }
        _logger.Info($"[DOCK] Opened tab \"{tab.RepoName}\" ({tab.Id})");
        return Clone(tab);
    }

    /// <summary>
    /// Partial update. Only non-null fields are applied; per-tab last-write-wins
    /// when two devices race. Returns the updated copy, or null if unknown.
    /// </summary>
    public DockTab? Update(string id, string? sessionId, string? status, string? repoName, string? color)
    {
        lock (_gate)
        {
            var tab = _tabs.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.Ordinal));
            if (tab is null) return null;
            if (sessionId != null) tab.SessionId = sessionId.Length == 0 ? null : sessionId;
            if (status != null) tab.Status = status;
            if (repoName != null) tab.RepoName = repoName;
            // Empty string clears the mark; null leaves it untouched.
            if (color != null) tab.Color = color.Length == 0 ? null : color;
            Save();
            return Clone(tab);
        }
    }

    /// <summary>Closes a tab. False if the id is unknown.</summary>
    public bool Remove(string id)
    {
        lock (_gate)
        {
            var idx = _tabs.FindIndex(t => string.Equals(t.Id, id, StringComparison.Ordinal));
            if (idx < 0) return false;
            var removed = _tabs[idx];
            _tabs.RemoveAt(idx);
            Save();
            _logger.Info($"[DOCK] Closed tab \"{removed.RepoName}\" ({removed.Id})");
            return true;
        }
    }

    // --- persistence ---------------------------------------------------------

    private void Load()
    {
        try
        {
            if (!File.Exists(_storePath)) return;
            var loaded = JsonSerializer.Deserialize<List<DockTab>>(File.ReadAllText(_storePath)) ?? new();
            lock (_gate)
            {
                _tabs.Clear();
                foreach (var t in loaded)
                    if (!string.IsNullOrWhiteSpace(t.Id) && !string.IsNullOrWhiteSpace(t.RepoId))
                        _tabs.Add(t);
            }
            _logger.Info($"[DOCK] Loaded {_tabs.Count} tab(s) from {_storePath}");
        }
        catch (Exception ex)
        {
            _logger.Error($"[DOCK] Failed to load {_storePath}: {ex.Message}");
        }
    }

    private void Save()
    {
        // Caller holds _gate.
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_storePath)!);
            File.WriteAllText(_storePath, JsonSerializer.Serialize(_tabs, JsonOpts));
        }
        catch (Exception ex)
        {
            _logger.Error($"[DOCK] Failed to persist {_storePath}: {ex.Message}");
        }
    }

    private static string ResolveStorePath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine(appData, "ClaudeWeb", "dock.json");
    }

    private static DockTab Clone(DockTab t) => new()
    {
        Id = t.Id,
        RepoId = t.RepoId,
        RepoName = t.RepoName,
        SessionId = t.SessionId,
        Status = t.Status,
        CreatedAt = t.CreatedAt,
        Color = t.Color,
    };
}
