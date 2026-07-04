using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.StatusMonitor;

/// <summary>
/// Assembles the status-monitor wallboard document (openspec change
/// status-monitor-dashboard): ONE JSON payload — fleet + attention + github — so the
/// board page is a dumb renderer and every derivation lives here, testable and
/// server-side.
///
/// The fleet is a pure PROJECTION of <see cref="CollectorService"/> per-source state;
/// the collector is never written to. Design decision 5 nuance: the collector's
/// <c>lastPolledAt</c> marks the last poll ATTEMPT (failures included), so "how long
/// has this machine been dark" cannot come from it. This service tracks observed
/// state TRANSITIONS in memory instead; a source first seen in a bad state after a
/// harness restart reports its duration as unknown (null) rather than a fabricated
/// timestamp, until its next transition.
///
/// The attention queue is DERIVED, never stored (design decision 4): refusal-state
/// sources + dark sources in v1, ordered most-actionable-first. Follow-up feed
/// enrichment (per-agent awaiting-input) just adds rows here.
/// </summary>
public sealed class StatusBoardService
{
    /// <summary>An unreachable source joins the attention queue after this long dark
    /// (immediately when its dark-duration is unknown — it was already dark when the
    /// harness restarted, so it has plausibly been dark longer than the threshold).</summary>
    private static readonly TimeSpan DarkThreshold = TimeSpan.FromMinutes(5);

    // The collector's refusal taxonomy: alive but blocked on the operator by definition.
    private static readonly HashSet<string> Refusals =
        new(StringComparer.Ordinal) { "ip-blocked", "needs-credential", "bad-credential", "throttled" };

    private readonly CollectorService _collector;
    private readonly GitHubStatusService _github;

    private readonly object _lock = new();
    private readonly Dictionary<string, Transition> _transitions = new();

    private sealed record Transition(string Status, long SinceMs, bool Known);

    public StatusBoardService(CollectorService collector, GitHubStatusService github)
    {
        _collector = collector;
        _github = github;
    }

    public sealed record FleetCard(
        string Id, string Label, string Kind, bool Active, string Status, bool Alive,
        long LastPolledAt, long? StateDurationMs, LastActivity? Activity,
        IReadOnlyList<RunningAgent> Agents);

    public sealed record LastActivity(string Type, long At);

    /// <summary>An agent currently executing on a source: a turn.start in the
    /// retained aggregate with no matching turn.ended (paired by turnId).</summary>
    public sealed record RunningAgent(string Repo, long StartedAt);

    public sealed record AttentionItem(
        string Severity, string SourceId, string Label, string Title, string Fix, long? DurationMs);

    public sealed record Board(
        long Now, long DarkThresholdMs,
        IReadOnlyList<FleetCard> Fleet,
        IReadOnlyList<AttentionItem> Attention,
        // Pinned: CamelCase policy would emit "gitHub", which the board page won't find.
        [property: System.Text.Json.Serialization.JsonPropertyName("github")]
        GitHubStatusService.GitHubSection GitHub);

    public async Task<Board> BuildAsync(CancellationToken ct)
    {
        var github = await _github.GetSectionAsync(ct);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var sources = _collector.ListSources();
        var (lastActivity, runningAgents) = ScanEvents(now);

        var fleet = new List<FleetCard>(sources.Count);
        var attention = new List<AttentionItem>();

        lock (_lock)
        {
            foreach (var s in sources)
            {
                // Observed-transition tracking (design decision 5). First observation
                // of a source: duration unknown. Any status change after that: known.
                long? duration = null;
                if (_transitions.TryGetValue(s.Id, out var t))
                {
                    if (t.Status != s.Status)
                        _transitions[s.Id] = t = new Transition(s.Status, now, Known: true);
                    if (t.Known) duration = now - t.SinceMs;
                }
                else
                {
                    _transitions[s.Id] = new Transition(s.Status, now, Known: false);
                }

                fleet.Add(new FleetCard(
                    s.Id, s.Label, s.Kind, s.Active, s.Status, s.Alive,
                    s.LastPolledAt, duration,
                    lastActivity.TryGetValue(s.Id, out var act) ? act : null,
                    runningAgents.TryGetValue(s.Id, out var agents) ? agents : Array.Empty<RunningAgent>()));

                if (!s.Active) continue; // operator stopped it deliberately — not attention

                if (Refusals.Contains(s.Status))
                {
                    attention.Add(new AttentionItem(
                        s.Status == "throttled" ? "serious" : "critical",
                        s.Id, s.Label,
                        Title: s.Label + " — " + RefusalText(s.Status) + (s.LastError is null ? "" : " · " + s.LastError),
                        Fix: RefusalFix(s.Status),
                        duration));
                }
                else if (s.Status == "unreachable" &&
                         (duration is null || duration >= (long)DarkThreshold.TotalMilliseconds))
                {
                    attention.Add(new AttentionItem(
                        "warning", s.Id, s.Label,
                        Title: s.Label + " — dark " + (duration is null ? "(duration unknown)" : "for " + Mins(duration.Value)),
                        Fix: "check the machine / harness",
                        duration));
                }
            }
        }

        // Most-actionable-first: severity rank, then longest-blocked first (unknown
        // duration sorts as longest — it predates the harness restart).
        attention.Sort((a, b) =>
        {
            var r = Rank(a.Severity).CompareTo(Rank(b.Severity));
            return r != 0 ? r : (b.DurationMs ?? long.MaxValue).CompareTo(a.DurationMs ?? long.MaxValue);
        });

        return new Board(now, (long)DarkThreshold.TotalMilliseconds, fleet, attention, github);
    }

    /// <summary>An unmatched turn.start older than this is dropped: a trimmed or
    /// lost turn.ended must not pin a ghost "running" agent forever.</summary>
    private static readonly TimeSpan RunningMaxAge = TimeSpan.FromHours(4);

    /// <summary>One pass over the collector's retained aggregate: the most recent
    /// event per source ("latest activity", fleet requirement) and the running
    /// agents per source — turn.start events with no matching turn.ended, paired by
    /// turnId (spec: per-source status with running agents). Event payloads are
    /// anonymous objects for the self source but JsonElements for remote ones, so
    /// both are normalized through SerializeToElement before field access.</summary>
    private (Dictionary<string, LastActivity> Activity, Dictionary<string, List<RunningAgent>> Running)
        ScanEvents(long now)
    {
        var (events, _) = _collector.ReadEvents(0);
        var activity = new Dictionary<string, LastActivity>();
        // sourceId -> turnId -> agent (insertion order preserved = start order)
        var open = new Dictionary<string, Dictionary<string, RunningAgent>>();

        foreach (var e in events) // ascending seq — later entries overwrite earlier
        {
            activity[e.SourceId] = new LastActivity(e.Type, e.At);
            if (e.Type is not ("turn.start" or "turn.ended")) continue;

            var turnId = ReadString(e.Data, "turnId");
            if (turnId is null) continue; // old-build source: no pairing possible

            if (e.Type == "turn.start")
            {
                var repo = ReadString(e.Source, "repoName") ?? ReadString(e.Source, "repoId") ?? "?";
                if (!open.TryGetValue(e.SourceId, out var perSource))
                    open[e.SourceId] = perSource = new Dictionary<string, RunningAgent>();
                perSource[turnId] = new RunningAgent(repo, e.At);
            }
            else if (open.TryGetValue(e.SourceId, out var perSource))
            {
                perSource.Remove(turnId);
            }
        }

        var running = new Dictionary<string, List<RunningAgent>>();
        foreach (var (sourceId, perSource) in open)
        {
            var alive = perSource.Values.Where(a => now - a.StartedAt < RunningMaxAge.TotalMilliseconds).ToList();
            if (alive.Count > 0) running[sourceId] = alive;
        }
        return (activity, running);
    }

    private static string? ReadString(object? payload, string field)
    {
        if (payload is null) return null;
        try
        {
            var el = payload is System.Text.Json.JsonElement je
                ? je
                : System.Text.Json.JsonSerializer.SerializeToElement(payload);
            return el.ValueKind == System.Text.Json.JsonValueKind.Object &&
                   el.TryGetProperty(field, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String
                ? v.GetString()
                : null;
        }
        catch { return null; }
    }

    private static int Rank(string severity) => severity switch
    {
        "critical" => 0,
        "serious" => 1,
        _ => 2,
    };

    // Labels mirror the events-app taxonomy so the two pages never disagree.
    private static string RefusalText(string status) => status switch
    {
        "ip-blocked" => "blocked by IP gate",
        "needs-credential" => "needs credential",
        "bad-credential" => "credential rejected",
        "throttled" => "throttled",
        _ => status,
    };

    private static string RefusalFix(string status) => status switch
    {
        "ip-blocked" => "allowlist this harness's IP on the source",
        "needs-credential" => "enter the feed credential",
        "bad-credential" => "re-enter / rotate the feed credential",
        "throttled" => "wait — the source's brute-force throttle engaged",
        _ => "check the source",
    };

    private static string Mins(long ms)
    {
        var m = ms / 60000;
        return m < 60 ? m + "m" : (m / 60) + "h " + (m % 60) + "m";
    }
}
