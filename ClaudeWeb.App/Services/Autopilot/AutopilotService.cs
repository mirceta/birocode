using System.Collections.Concurrent;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The engine (plans/loop-autopilot-engine.md, option A — backend polling). A hosted
/// <see cref="BackgroundService"/> that, every ~10s, looks at each <b>armed</b> agent
/// (repo) that is idle, reads its last assistant message, asks the
/// <see cref="PromptClassifier"/> brain for a routine prompt or escalate, and records
/// the verdict as that agent's state — plus an append-only suggestion log.
///
/// Slice 2 is <b>suggest-only</b>: it classifies and surfaces, it NEVER sends. The
/// gate (threshold + deny-list + kill switch) lives in <see cref="AutopilotConfigStore"/>
/// and is applied by the classifier; Slice 3 reuses it to decide whether to auto-send.
///
/// It reads the last message from the on-disk transcript (the same source as
/// discovery), so it needs no new hook into the live run buffer.
/// </summary>
public class AutopilotService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);
    private const int MaxLog = 50;

    private readonly RepositoryRegistry _repos;
    private readonly SessionService _sessions;
    private readonly RunSessionService _runs;
    private readonly AutopilotConfigStore _config;
    private readonly PromptClassifier _brain;
    private readonly Logger _logger;

    private readonly ConcurrentDictionary<string, AgentState> _states = new();
    private readonly object _logGate = new();
    private readonly LinkedList<LogEntry> _log = new();

    public AutopilotService(
        RepositoryRegistry repos, SessionService sessions, RunSessionService runs,
        AutopilotConfigStore config, PromptClassifier brain, Logger logger)
    {
        _repos = repos;
        _sessions = sessions;
        _runs = runs;
        _config = config;
        _brain = brain;
        _logger = logger;
    }

    /// <param name="Decision">off | running | idle | suggestion | escalate | paused.</param>
    public sealed record AgentState(
        string RepoId, string RepoName, bool Armed, string Decision,
        string? Label, double Confidence, string Reason, string LastMessage, long UpdatedAt);

    public sealed record LogEntry(long At, string RepoName, string Outcome, string? Label, double Confidence);

    public IReadOnlyList<AgentState> States() =>
        _states.Values.OrderBy(s => s.RepoName, StringComparer.OrdinalIgnoreCase).ToList();

    public IReadOnlyList<LogEntry> Log()
    {
        lock (_logGate) return _log.ToList();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // First tick after a short delay so startup isn't competing with the build.
        try { await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken); } catch { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { Tick(); }
            catch (Exception ex) { _logger.Error($"[AUTOPILOT] engine tick failed: {ex.Message}"); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private void Tick()
    {
        var cfg = _config.Get();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        foreach (var repo in _repos.GetAll().Where(r => r.Exists))
        {
            var armed = cfg.ArmedRepoIds.Contains(repo.Id);

            // Not armed → it's listed as "off"; we don't classify it.
            if (!armed)
            {
                Set(repo.Id, new AgentState(repo.Id, repo.Name, false, "off", null, 0, "", "", now));
                continue;
            }

            // Kill switch off → armed agents are paused (reverts to manual), no classifying.
            if (!cfg.Enabled)
            {
                Set(repo.Id, new AgentState(repo.Id, repo.Name, true, "paused", null, 0, "kill switch is off", "", now));
                continue;
            }

            // A running agent isn't idle — wait for its turn to finish.
            if (_runs.IsBusy(repo.Id))
            {
                Keep(repo.Id, "running", repo, armed, now);
                continue;
            }

            var lastAssistant = LastAssistantMessage(repo.Path);
            if (string.IsNullOrWhiteSpace(lastAssistant))
            {
                Set(repo.Id, new AgentState(repo.Id, repo.Name, true, "idle", null, 0, "no recent agent message", "", now));
                continue;
            }

            var v = _brain.Classify(lastAssistant, cfg.Threshold, cfg.DenyList);
            var decision = v.Escalate ? "escalate" : "suggestion";
            var prev = _states.TryGetValue(repo.Id, out var p) ? p : null;

            Set(repo.Id, new AgentState(
                repo.Id, repo.Name, true, decision, v.Label, v.Confidence, v.Reason, Snippet(lastAssistant), now));

            // Log only when the verdict for this agent actually changes (not every tick).
            if (prev is null || prev.Decision != decision || prev.Label != v.Label)
                Append(new LogEntry(now, repo.Name, v.Escalate ? "escalated" : "suggested", v.Label, v.Confidence));
        }
    }

    private void Set(string repoId, AgentState state) => _states[repoId] = state;

    // Preserve the last suggestion fields while flipping only the decision (e.g. running).
    private void Keep(string repoId, string decision, RepositoryRegistry.RepositoryInfo repo, bool armed, long now)
    {
        if (_states.TryGetValue(repoId, out var prev))
            _states[repoId] = prev with { Decision = decision, UpdatedAt = now };
        else
            _states[repoId] = new AgentState(repoId, repo.Name, armed, decision, null, 0, "", "", now);
    }

    private void Append(LogEntry entry)
    {
        lock (_logGate)
        {
            _log.AddFirst(entry);
            while (_log.Count > MaxLog) _log.RemoveLast();
        }
    }

    // Newest transcript's last assistant message, read directly (light: one file read,
    // no metadata parse of every session like ListSessions does).
    private string? LastAssistantMessage(string repoPath)
    {
        try
        {
            var dir = SessionService.ProjectsDirectoryFor(repoPath);
            if (!Directory.Exists(dir)) return null;
            var newest = new DirectoryInfo(dir).EnumerateFiles("*.jsonl")
                .OrderByDescending(f => f.LastWriteTimeUtc).FirstOrDefault();
            if (newest is null) return null;
            var sessionId = Path.GetFileNameWithoutExtension(newest.Name);
            var msgs = _sessions.GetMessages(repoPath, sessionId);
            return msgs.LastOrDefault(m => m.Role == "assistant")?.Text;
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] read last message for {repoPath} failed: {ex.Message}");
            return null;
        }
    }

    private static string Snippet(string text)
    {
        var s = text.Replace('\n', ' ').Replace('\r', ' ').Trim();
        return s.Length > 180 ? s[..180] + "…" : s;
    }
}
