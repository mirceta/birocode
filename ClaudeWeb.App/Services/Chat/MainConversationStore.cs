using System.Text.Json;
using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// The MAIN conversation of each repo agent, made explicit (openspec repo-agent-subagents,
/// "main-conversation pointer"). A repo's transcript folder (~/.claude/projects/&lt;encoded
/// checkout path&gt;) holds every conversation ever run in that checkout — the main thread, side
/// dock tabs, subagents, old forks, anything the Operator ran in a terminal. Harness paths that
/// used to take "the newest transcript in the folder" as the agent's conversation read THIS
/// pointer instead, so any number of other conversations can live in the folder without being
/// mistaken for the main one.
///
/// The pointer follows the main thread's forks (depending on the CLI version a <c>--resume</c> either
/// appends to the same session or forks a new id — both are handled):
/// a builder run on the repo's own run key that RESUMED the main session moves the pointer to
/// the run's new session; a dock tab whose session changes FROM the main session (the chat UI
/// recording the fork) — superseded by the Operator's review: a tab only SEEDS a missing pointer;
/// picking or viewing a conversation never moves it. With no pointer yet the agent's first
/// conversation becomes main, and at startup a missing pointer is seeded from the agent's main
/// (oldest) dock tab. The Operator moves it explicitly (the picker's "★ make main"); a subagent's
/// conversation is refused everywhere. Nothing ever falls back to "the newest file".
/// </summary>
public sealed class MainConversationStore
{
    public sealed record Entry(string SessionId, long SetAt, string SetBy);

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Dictionary<string, Entry> _data = new(StringComparer.Ordinal);

    /// <summary>Conversations that can NEVER be a repo agent's main one — a subagent's (set by the
    /// tracker from the subagent store). Every write path refuses them.</summary>
    public Func<string, bool>? IsForeign { get; set; }

    public bool Foreign(string? sessionId) => !string.IsNullOrWhiteSpace(sessionId) && (IsForeign?.Invoke(sessionId) ?? false);

    public MainConversationStore(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "main-conversations.json");
        Load();
    }

    /// <summary>The repo agent's main conversation, or null when it has none yet.</summary>
    public string? Get(string? repoId)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return null;
        lock (_gate) return _data.TryGetValue(repoId, out var e) ? e.SessionId : null;
    }

    public Entry? GetEntry(string? repoId)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return null;
        lock (_gate) return _data.TryGetValue(repoId, out var e) ? e : null;
    }

    /// <summary>Sets the pointer outright (the Operator's choice, or a rule below). Returns true
    /// when it changed.</summary>
    public bool Set(string repoId, string? sessionId, string by)
    {
        if (string.IsNullOrWhiteSpace(repoId) || string.IsNullOrWhiteSpace(sessionId)) return false;
        if (Foreign(sessionId)) { _logger.Info($"[MAIN] {repoId}: refused {Short(sessionId)} as main — it is a goal conversation ({by})"); return false; }
        lock (_gate)
        {
            if (_data.TryGetValue(repoId, out var cur) && cur.SessionId == sessionId) return false;
            _data[repoId] = new Entry(sessionId.Trim(), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), by);
            Save();
        }
        _logger.Info($"[MAIN] {repoId}: main conversation -> {Short(sessionId)} ({by})");
        return true;
    }

    public bool Clear(string repoId)
    {
        lock (_gate)
        {
            if (!_data.Remove(repoId)) return false;
            Save();
            return true;
        }
    }

    // ---- the follow rules (pure, unit-tested) -------------------------------------------------

    /// <summary>A finished builder run on the repo's own key: follow when it resumed the main
    /// session; adopt its session when there is no main yet. Never for another conversation.</summary>
    public static bool FollowsRun(string? current, string? resumedFrom, string? newSession) =>
        !string.IsNullOrWhiteSpace(newSession)
        && (current is null || (!string.IsNullOrWhiteSpace(resumedFrom) && string.Equals(current, resumedFrom, StringComparison.Ordinal)));

    /// <summary>A dock tab's session changed from <paramref name="old"/> to <paramref name="next"/>: it
    /// only SEEDS a repo agent that has no main yet. Picking or viewing another conversation in a tab
    /// — the main one included — never moves the pointer (the Operator's review: only "make main"
    /// does); the main thread's own turns move it through the run rule.</summary>
    public static bool FollowsTab(string? current, string? old, string? next) =>
        !string.IsNullOrWhiteSpace(next) && current is null;

    public void OnRun(string repoId, string? resumedFrom, string? newSession) =>
        CheckAndSet(repoId, newSession, cur => FollowsRun(cur, resumedFrom, newSession), resumedFrom is null ? "first conversation" : "followed its own turn");

    public void OnTab(string repoId, string? old, string? next) =>
        CheckAndSet(repoId, next, cur => FollowsTab(cur, old, next), "first conversation (dock)");

    /// <summary>The follow rules decide and write under ONE lock, so two events arriving at once can
    /// never interleave between the check and the write.</summary>
    private void CheckAndSet(string repoId, string? sessionId, Func<string?, bool> rule, string by)
    {
        if (string.IsNullOrWhiteSpace(repoId) || string.IsNullOrWhiteSpace(sessionId) || Foreign(sessionId)) return;
        bool changed;
        lock (_gate)
        {
            var cur = _data.TryGetValue(repoId, out var e) ? e.SessionId : null;
            changed = rule(cur) && cur != sessionId;
            if (changed) { _data[repoId] = new Entry(sessionId.Trim(), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), by); Save(); }
        }
        if (changed) _logger.Info($"[MAIN] {repoId}: main conversation -> {Short(sessionId)} ({by})");
    }

    /// <summary>A repo agent with no pointer yet (an older build's datadir, or a new agent) is seeded
    /// from its MAIN dock tab — the oldest tab of the repo that holds a conversation that is not a
    /// subagent's. Never from "the newest file". Returns true when it seeded.</summary>
    public bool SeedFromTabs(string repoId, IEnumerable<DockTab> tabs)
    {
        if (Get(repoId) is not null) return false;
        var tab = tabs.Where(t => t.RepoId == repoId && !string.IsNullOrWhiteSpace(t.SessionId) && !Foreign(t.SessionId))
            .OrderBy(t => t.CreatedAt).FirstOrDefault();
        if (tab is null) return false;
        CheckAndSet(repoId, tab.SessionId, cur => cur is null, $"seeded from the main dock tab {tab.Id}");
        return Get(repoId) == tab.SessionId;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            _data = JsonSerializer.Deserialize<Dictionary<string, Entry>>(File.ReadAllText(_path), JsonOpts) ?? new(StringComparer.Ordinal);
            _data = new Dictionary<string, Entry>(_data, StringComparer.Ordinal);
        }
        catch (Exception ex) { _logger.Error($"[MAIN] failed to load {_path}: {ex.Message}"); }
    }

    private void Save()
    {
        try { File.WriteAllText(_path, JsonSerializer.Serialize(_data, JsonOpts)); }
        catch (Exception ex) { _logger.Error($"[MAIN] failed to save {_path}: {ex.Message}"); }
    }

    private static string Short(string s) => s.Length > 8 ? s[..8] : s;
}

/// <summary>Keeps the pointer on the main thread: listens to finished runs and dock tab session
/// changes. Only a REGISTERED repo's own builder key counts — a subagent's runs (key
/// <c>&lt;repoId&gt;~goal~&lt;id&gt;</c>), arch conversations and the ask lane never move it.</summary>
public sealed class MainConversationTracker : IHostedService
{
    private readonly MainConversationStore _main;
    private readonly RunSessionService _runs;
    private readonly DockRegistry _dock;
    private readonly RepositoryRegistry _repos;

    public MainConversationTracker(MainConversationStore main, RunSessionService runs, DockRegistry dock, RepositoryRegistry repos,
        Agents.RepoSubagentStore? subagents = null)
    {
        _main = main;
        _runs = runs;
        _dock = dock;
        _repos = repos;
        // A subagent's conversation can never be a repo agent's main one.
        if (subagents is not null) _main.IsForeign = sid => subagents.OwnerOfSession(sid) is not null;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _runs.RunCompleted += OnRunCompleted;
        _dock.SessionChanged += OnTabSession;
        // Every registered repo agent without a pointer is seeded from its main dock tab at startup.
        var tabs = _dock.GetAll();
        foreach (var r in _repos.GetAll()) _main.SeedFromTabs(r.Id, tabs);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _runs.RunCompleted -= OnRunCompleted;
        _dock.SessionChanged -= OnTabSession;
        return Task.CompletedTask;
    }

    private void OnRunCompleted(RunSessionService.RunCompletedEvent e)
    {
        if (e.Lane != "builder" || _repos.TryGet(e.RepoId) is null) return;
        _main.OnRun(e.RepoId, e.ResumedFrom, e.SessionId);
    }

    private void OnTabSession(string repoId, string? old, string? next)
    {
        if (_repos.TryGet(repoId) is null) return;
        _main.OnTab(repoId, old, next);
    }
}
