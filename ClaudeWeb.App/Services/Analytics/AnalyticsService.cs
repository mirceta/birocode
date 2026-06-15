using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Analytics;

/// <summary>
/// Folds the <see cref="ActivityLog"/> events into the Scoreboard metrics
/// (plans/scoreboard-analytics.md): longest run, peak concurrency, prompts today,
/// per-agent work/idle window, and total work time across all agents.
///
/// A "run" is one start→finish pair for an agent (its working dir / repo). Runs
/// are single-flight per repo, so pairing per agent in event order is
/// unambiguous; an unclosed start (crash / still running) is ignored for
/// duration metrics. Agents are labelled with the repo's friendly name when the
/// path still maps to a registered repo, else the folder name.
/// </summary>
public class AnalyticsService
{
    private readonly ActivityLog _log;
    private readonly RepositoryRegistry _repos;

    public AnalyticsService(ActivityLog log, RepositoryRegistry repos)
    {
        _log = log;
        _repos = repos;
    }

    public sealed record RunStat(string Agent, long Ms);
    public sealed record AgentStat(string Agent, long FirstStart, long LastFinish, long WorkMs, long IdleMs, int Runs);
    public sealed record Analytics(
        long GeneratedAt,
        RunStat? LongestRun,
        int PeakConcurrency,
        int PromptsToday,
        long TotalWorkMs,
        int TotalRuns,
        IReadOnlyList<AgentStat> Agents);

    private sealed record Run(string Agent, long Start, long Finish);

    public Analytics Compute()
    {
        var events = _log.Read();
        var nameOf = AgentLabels();

        // Pair start→finish per agent (single-flight per repo ⇒ at most one open).
        var open = new Dictionary<string, long>();
        var runs = new List<Run>();
        var promptsToday = 0;
        var todayStart = new DateTimeOffset(DateTime.Today).ToUnixTimeMilliseconds();

        foreach (var e in events)
        {
            if (e.EventType == "start")
            {
                open[e.Agent] = e.Ts;
                if (e.Ts >= todayStart) promptsToday++;
            }
            else if (e.EventType == "finish" && open.Remove(e.Agent, out var start))
            {
                // Guard against a clock-skew negative interval.
                runs.Add(new Run(e.Agent, start, Math.Max(start, e.Ts)));
            }
        }

        // Longest single run.
        RunStat? longest = null;
        foreach (var r in runs)
        {
            var ms = r.Finish - r.Start;
            if (longest is null || ms > longest.Ms)
                longest = new RunStat(Label(nameOf, r.Agent), ms);
        }

        // Peak concurrency: sweep run endpoints (+1 start, −1 finish).
        var peak = PeakConcurrency(runs);

        // Per-agent rollup.
        var agents = runs
            .GroupBy(r => r.Agent)
            .Select(g =>
            {
                var first = g.Min(r => r.Start);
                var last = g.Max(r => r.Finish);
                var work = g.Sum(r => r.Finish - r.Start);
                var idle = Math.Max(0, (last - first) - work);
                return new AgentStat(Label(nameOf, g.Key), first, last, work, idle, g.Count());
            })
            .OrderByDescending(a => a.WorkMs)
            .ToList();

        var totalWork = runs.Sum(r => r.Finish - r.Start);

        return new Analytics(
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            longest,
            peak,
            promptsToday,
            totalWork,
            runs.Count,
            agents);
    }

    private static int PeakConcurrency(List<Run> runs)
    {
        // Endpoints: +1 at each start, −1 at each finish. Sort so a finish at the
        // same instant as a start is applied first (no phantom overlap).
        var points = new List<(long Ts, int Delta)>(runs.Count * 2);
        foreach (var r in runs)
        {
            points.Add((r.Start, 1));
            points.Add((r.Finish, -1));
        }
        points.Sort((a, b) => a.Ts != b.Ts ? a.Ts.CompareTo(b.Ts) : a.Delta.CompareTo(b.Delta));
        int cur = 0, peak = 0;
        foreach (var (_, delta) in points)
        {
            cur += delta;
            if (cur > peak) peak = cur;
        }
        return peak;
    }

    // Working-dir path -> friendly repo name (for registered repos).
    private Dictionary<string, string> AgentLabels()
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in _repos.GetAll())
            if (!string.IsNullOrEmpty(r.Path)) map[r.Path] = r.Name;
        return map;
    }

    private static string Label(Dictionary<string, string> nameOf, string agentPath)
    {
        if (nameOf.TryGetValue(agentPath, out var name)) return name;
        var leaf = Path.GetFileName(agentPath.TrimEnd('/', '\\'));
        return string.IsNullOrEmpty(leaf) ? agentPath : leaf;
    }
}
