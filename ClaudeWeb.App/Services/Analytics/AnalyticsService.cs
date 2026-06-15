using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Analytics;

/// <summary>
/// Folds the <see cref="ActivityLog"/> events into the Scoreboard metrics
/// (plans/scoreboard-analytics.md), scoped to a time <c>window</c> (today / 7d /
/// all) so every number shares one timeframe.
///
/// A "run" is one start→finish pair for an agent (its working dir / repo). Runs
/// are single-flight per repo, so pairing per agent in event order is
/// unambiguous; an unclosed start (crash / still running) is dropped from the
/// duration metrics. Agents are labelled with the repo's friendly name when the
/// path still maps to a registered repo, else the folder name.
///
/// Beyond the headline scalars it produces two real time series — concurrency
/// over the window (a step line of how many agents ran at once) and a per-day
/// rollup (prompts + work, last 7 calendar days) — plus a per-agent leaderboard.
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
    public sealed record AgentStat(string Agent, long WorkMs, long LongestMs, long LastUsed, int Runs);
    public sealed record ConcurrencyPoint(long Ts, int Level);
    public sealed record DayStat(long Date, int Prompts, long WorkMs);
    public sealed record Analytics(
        long GeneratedAt,
        string Window,
        long WindowStart,
        long WindowEnd,
        RunStat? LongestRun,
        int PeakConcurrency,
        int Prompts,
        long TotalWorkMs,
        double TotalCostUsd,
        int TotalRuns,
        IReadOnlyList<ConcurrencyPoint> Concurrency,
        IReadOnlyList<DayStat> Daily,
        IReadOnlyList<AgentStat> Agents);

    private sealed record Run(string Agent, long Start, long Finish, double Cost);

    /// <param name="window">"today" | "7d" | "all" (anything else ⇒ "all").</param>
    public Analytics Compute(string? window)
    {
        var win = window switch { "today" => "today", "7d" => "7d", _ => "all" };
        var events = _log.Read();
        var nameOf = AgentLabels();

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var todayMid = LocalMidnight(0);
        var countFrom = win switch
        {
            "today" => todayMid,
            "7d" => LocalMidnight(6),   // start of the 7-day calendar span (incl. today)
            _ => 0L,
        };

        // Pair start→finish per agent. Cost rides the finish event.
        var open = new Dictionary<string, long>();
        var allRuns = new List<Run>();
        foreach (var e in events)
        {
            if (e.EventType == "start")
            {
                open[e.Agent] = e.Ts;
            }
            else if (e.EventType == "finish" && open.Remove(e.Agent, out var start))
            {
                allRuns.Add(new Run(e.Agent, start, Math.Max(start, e.Ts), e.CostUsd ?? 0));
            }
        }

        // Prompts in window = `start` events at/after the window's floor.
        var prompts = events.Count(e => e.EventType == "start" && e.Ts >= countFrom);

        // Runs that touch the window. Durations are clipped to the window so a
        // run straddling the boundary only contributes its in-window slice.
        var runs = allRuns.Where(r => r.Finish >= countFrom).ToList();
        long Clip(Run r) => r.Finish - Math.Max(r.Start, countFrom);

        // For the concurrency axis, "all" starts at the first real run, not epoch.
        var axisLo = win == "all" ? (runs.Count > 0 ? runs.Min(r => r.Start) : todayMid) : countFrom;

        RunStat? longest = null;
        foreach (var r in runs)
        {
            var ms = r.Finish - r.Start;
            if (longest is null || ms > longest.Ms)
                longest = new RunStat(Label(nameOf, r.Agent), ms);
        }

        var totalWork = runs.Sum(Clip);
        var totalCost = runs.Sum(r => r.Cost);

        var (peak, concurrency) = ConcurrencySeries(runs, axisLo, now);
        var daily = Daily(allRuns, events);

        var agents = runs
            .GroupBy(r => r.Agent)
            .Select(g => new AgentStat(
                Label(nameOf, g.Key),
                g.Sum(Clip),
                g.Max(r => r.Finish - r.Start),
                g.Max(r => r.Finish),
                g.Count()))
            .OrderByDescending(a => a.WorkMs)
            .ToList();

        return new Analytics(
            now, win, axisLo, now,
            longest, peak, prompts, totalWork, totalCost, runs.Count,
            concurrency, daily, agents);
    }

    // Sweep clipped run intervals into a step series of (ts, level) emitted only
    // where the level changes, plus a closing point. Also returns the peak level.
    private static (int Peak, List<ConcurrencyPoint> Series) ConcurrencySeries(List<Run> runs, long lo, long hi)
    {
        var points = new List<(long Ts, int Delta)>(runs.Count * 2);
        foreach (var r in runs)
        {
            var s = Math.Max(r.Start, lo);
            var f = r.Finish;
            if (f <= s) continue;
            points.Add((s, 1));
            points.Add((f, -1));
        }
        // A finish at the same instant as a start applies first (no phantom overlap).
        points.Sort((a, b) => a.Ts != b.Ts ? a.Ts.CompareTo(b.Ts) : a.Delta.CompareTo(b.Delta));

        var series = new List<ConcurrencyPoint> { new(lo, 0) };
        int cur = 0, peak = 0, i = 0;
        while (i < points.Count)
        {
            var ts = points[i].Ts;
            while (i < points.Count && points[i].Ts == ts) { cur += points[i].Delta; i++; }
            if (cur > peak) peak = cur;
            series.Add(new ConcurrencyPoint(ts, cur));
        }
        if (series[^1].Ts < hi) series.Add(new ConcurrencyPoint(hi, cur));
        return (peak, series);
    }

    // Last 7 calendar days (oldest→newest): prompt starts that day + work clipped
    // to the day. Independent of the selected window so the trend strip is stable.
    private List<DayStat> Daily(List<Run> allRuns, IReadOnlyList<ActivityLog.Event> events)
    {
        var days = new List<DayStat>(7);
        for (var i = 6; i >= 0; i--)
        {
            var lo = LocalMidnight(i);
            var hi = LocalMidnight(i - 1); // next midnight
            var prompts = events.Count(e => e.EventType == "start" && e.Ts >= lo && e.Ts < hi);
            var work = allRuns
                .Where(r => r.Finish > lo && r.Start < hi)
                .Sum(r => Math.Min(r.Finish, hi) - Math.Max(r.Start, lo));
            days.Add(new DayStat(lo, prompts, work));
        }
        return days;
    }

    // Unix-ms of local midnight `daysAgo` days back (daysAgo = -1 ⇒ tomorrow).
    private static long LocalMidnight(int daysAgo) =>
        new DateTimeOffset(DateTime.Today.AddDays(-daysAgo)).ToUnixTimeMilliseconds();

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
