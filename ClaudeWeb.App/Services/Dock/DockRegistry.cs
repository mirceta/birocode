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

    /// <summary>
    /// Whether this agent appears on the Dashboard (toggled from the Agents
    /// tab). Defaults to true so existing tabs keep showing; shared across
    /// devices like the rest of the tab.
    /// </summary>
    public bool Dashboard { get; set; } = true;

    /// <summary>
    /// Marked "important" from the dashboard (plans/important-agents.md): the
    /// dock gets a bright-red thick border and sorts first among the dashboard
    /// docks. Defaults to false so existing tabs are unaffected; shared across
    /// devices like the rest of the tab.
    /// </summary>
    public bool Important { get; set; } = false;

    /// <summary>
    /// Marked "waiting for another agent to finish" from the dashboard
    /// (plans/agent-waiting.md): the dock gets an amber waiting cue. Defaults to
    /// false so existing tabs are unaffected; shared across devices like the rest
    /// of the tab.
    /// </summary>
    public bool Waiting { get; set; } = false;

    /// <summary>
    /// Optional free-text name of the agent this dock is waiting on
    /// (plans/agent-waiting.md). Null/empty means "waiting, unspecified". Only
    /// meaningful when <see cref="Waiting"/> is true.
    /// </summary>
    public string? WaitingOn { get; set; }

    /// <summary>
    /// Optional id of the PRIMARY agent this dock depends on
    /// (plans/dependent-agents.md): the dashboard renders the two as a "together"
    /// group with this (dependent) dock shown smaller, signalling the primary
    /// must finish first. Null = independent. A structural link by tab id —
    /// distinct from the free-text <see cref="WaitingOn"/>; shared across devices.
    /// </summary>
    public string? DependsOn { get; set; }

    /// <summary>
    /// Stashed prompt ideas jotted down while the agent runs
    /// (plans/prompt-stash.md). Shared across devices like the rest of the tab.
    /// </summary>
    public List<StashItem> Stash { get; set; } = new();
}

/// <summary>One stashed prompt idea on a dock tab.</summary>
public class StashItem
{
    public string Id { get; set; } = "";
    public string Text { get; set; } = "";
    public long CreatedAt { get; set; }
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
    private readonly string _globalStorePath;
    private readonly object _gate = new();
    private readonly List<DockTab> _tabs = new();
    // Tab-independent queue for the main chat, which has no dock tab to attach to
    // (plans/queued-prompts.md). Persisted to its own dock-stash.json.
    private readonly List<StashItem> _globalStash = new();

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public DockRegistry(Logger logger)
    {
        _logger = logger;
        _storePath = ResolveStorePath();
        _globalStorePath = ResolveGlobalStorePath();
        Load();
        LoadGlobal();
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
    public DockTab? Update(string id, string? sessionId, string? status, string? repoName, string? color, bool? dashboard, bool? important, bool? waiting, string? waitingOn, string? dependsOn)
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
            if (dashboard != null) tab.Dashboard = dashboard.Value;
            if (important != null) tab.Important = important.Value;
            if (waiting != null) tab.Waiting = waiting.Value;
            // Empty string clears the name; null leaves it untouched.
            if (waitingOn != null) tab.WaitingOn = waitingOn.Length == 0 ? null : waitingOn;
            // Empty string clears the dependency; null leaves it untouched.
            if (dependsOn != null) tab.DependsOn = dependsOn.Length == 0 ? null : dependsOn;
            Save();
            return Clone(tab);
        }
    }

    /// <summary>
    /// Stashes a prompt idea on a tab (plans/prompt-stash.md). The client may
    /// supply the id (optimistic UI); an existing id returns the existing item
    /// unchanged. Returns null when the tab is unknown.
    /// </summary>
    public StashItem? AddStash(string tabId, string text, string? id = null, long? createdAt = null)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        lock (_gate)
        {
            var tab = _tabs.FirstOrDefault(t => string.Equals(t.Id, tabId, StringComparison.Ordinal));
            if (tab is null) return null;
            if (!string.IsNullOrWhiteSpace(id))
            {
                var existing = tab.Stash.FirstOrDefault(s => string.Equals(s.Id, id, StringComparison.Ordinal));
                if (existing != null) return CloneStash(existing);
            }
            var item = new StashItem
            {
                Id = string.IsNullOrWhiteSpace(id) ? Guid.NewGuid().ToString("N") : id,
                Text = text.Length > 4000 ? text[..4000] : text,
                CreatedAt = createdAt ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            tab.Stash.Add(item);
            Save();
            return CloneStash(item);
        }
    }

    /// <summary>Removes a stashed idea. False if the tab or item is unknown.</summary>
    public bool RemoveStash(string tabId, string stashId)
    {
        lock (_gate)
        {
            var tab = _tabs.FirstOrDefault(t => string.Equals(t.Id, tabId, StringComparison.Ordinal));
            if (tab is null) return false;
            var idx = tab.Stash.FindIndex(s => string.Equals(s.Id, stashId, StringComparison.Ordinal));
            if (idx < 0) return false;
            tab.Stash.RemoveAt(idx);
            Save();
            return true;
        }
    }

    // --- global (tab-independent) stash --------------------------------------
    // The main chat has no dock tab, so its queued prompts live here, persisted
    // separately to dock-stash.json (plans/queued-prompts.md). Same shape and
    // optimistic-id contract as the per-tab stash above.

    /// <summary>All global stash items, oldest first. Returns copies.</summary>
    public IReadOnlyList<StashItem> GetGlobalStash()
    {
        lock (_gate) return _globalStash.Select(CloneStash).ToList();
    }

    /// <summary>Adds a global stash item. An existing id returns it unchanged.</summary>
    public StashItem? AddGlobalStash(string text, string? id = null, long? createdAt = null)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        lock (_gate)
        {
            if (!string.IsNullOrWhiteSpace(id))
            {
                var existing = _globalStash.FirstOrDefault(s => string.Equals(s.Id, id, StringComparison.Ordinal));
                if (existing != null) return CloneStash(existing);
            }
            var item = new StashItem
            {
                Id = string.IsNullOrWhiteSpace(id) ? Guid.NewGuid().ToString("N") : id,
                Text = text.Length > 4000 ? text[..4000] : text,
                CreatedAt = createdAt ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            _globalStash.Add(item);
            SaveGlobal();
            return CloneStash(item);
        }
    }

    /// <summary>Removes a global stash item. False if unknown.</summary>
    public bool RemoveGlobalStash(string stashId)
    {
        lock (_gate)
        {
            var idx = _globalStash.FindIndex(s => string.Equals(s.Id, stashId, StringComparison.Ordinal));
            if (idx < 0) return false;
            _globalStash.RemoveAt(idx);
            SaveGlobal();
            return true;
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
                    {
                        t.Stash ??= new(); // pre-stash dock.json entries
                        _tabs.Add(t);
                    }
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

    private void LoadGlobal()
    {
        try
        {
            if (!File.Exists(_globalStorePath)) return;
            var loaded = JsonSerializer.Deserialize<List<StashItem>>(File.ReadAllText(_globalStorePath)) ?? new();
            lock (_gate)
            {
                _globalStash.Clear();
                foreach (var s in loaded)
                    if (!string.IsNullOrWhiteSpace(s.Id) && !string.IsNullOrWhiteSpace(s.Text))
                        _globalStash.Add(s);
            }
            _logger.Info($"[DOCK] Loaded {_globalStash.Count} global stash item(s) from {_globalStorePath}");
        }
        catch (Exception ex)
        {
            _logger.Error($"[DOCK] Failed to load {_globalStorePath}: {ex.Message}");
        }
    }

    private void SaveGlobal()
    {
        // Caller holds _gate.
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_globalStorePath)!);
            File.WriteAllText(_globalStorePath, JsonSerializer.Serialize(_globalStash, JsonOpts));
        }
        catch (Exception ex)
        {
            _logger.Error($"[DOCK] Failed to persist {_globalStorePath}: {ex.Message}");
        }
    }

    private static string ResolveStorePath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine(appData, "ClaudeWeb", "dock.json");
    }

    private static string ResolveGlobalStorePath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine(appData, "ClaudeWeb", "dock-stash.json");
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
        Dashboard = t.Dashboard,
        Important = t.Important,
        Waiting = t.Waiting,
        WaitingOn = t.WaitingOn,
        DependsOn = t.DependsOn,
        Stash = t.Stash.Select(CloneStash).ToList(),
    };

    private static StashItem CloneStash(StashItem s) => new()
    {
        Id = s.Id,
        Text = s.Text,
        CreatedAt = s.CreatedAt,
    };
}
