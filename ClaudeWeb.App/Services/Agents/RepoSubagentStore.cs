using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Agents;

/// <summary>The keys of repo-agent subagents (openspec repo-agent-subagents): a subagent's
/// loop slot, run slot and MCP identity all hang on <c>&lt;repoId&gt;~sub~&lt;id&gt;</c> —
/// no "#" (the run lane separator) and no "/" (the fleet key separator) in it.</summary>
public static class RepoSubagentKeys
{
    public const string Separator = "~sub~";

    public static string Key(string repoId, string subagentId) => repoId + Separator + subagentId;

    public static bool IsKey(string? key) => key is not null && key.Contains(Separator, StringComparison.Ordinal);

    /// <summary>(repoId, subagentId) of a key, or null when it is not one.</summary>
    public static (string RepoId, string SubagentId)? Parse(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return null;
        var i = key.IndexOf(Separator, StringComparison.Ordinal);
        if (i <= 0 || i + Separator.Length >= key.Length) return null;
        return (key[..i], key[(i + Separator.Length)..]);
    }

    public static string NewId() => Guid.NewGuid().ToString("N")[..8];
}

/// <summary>
/// The record of every subagent a repo agent on this harness ever started (openspec
/// repo-agent-subagents): <c>subagents.json</c> in the data dir. A subagent is a goal-driven
/// conversation in the parent's checkout, OWNED by the parent (its repo, the tab and session
/// that called <c>start_subagent</c>); its loop and run live under <see cref="RepoSubagentKeys"/>.
/// The goal step plan is the arch's <see cref="ArchGoalPlans"/>, reused as is. The finished
/// summary is PERSISTED here until it is delivered into the parent's conversation, so a
/// restart never loses it (the arch keeps goal summaries in memory; this does not).
/// </summary>
public sealed class RepoSubagentStore
{
    public const string Running = ArchGoals.Running;
    public const string Done = ArchGoals.Done;
    public const string Stopped = ArchGoals.Stopped;
    public const string Capped = ArchGoals.Capped;
    public const string Error = ArchGoals.Error;
    public const int MaxQueue = 20;
    public const int MaxPerRepo = 200;

    public sealed record QueuedMessage([property: JsonPropertyName("at")] long At, [property: JsonPropertyName("text")] string Text);

    /// <summary>One subagent as the API, the tools and the UI see it.</summary>
    public sealed record Subagent(
        string Id, string RepoId, string Name, string Goal, string State, long StartedAt, long? EndedAt, string? StartedBy, string? Outcome,
        string? ParentTabId, string? ParentSessionId, string? SessionId, int MaxIterations, bool ReadOnly, string? Model, string? Branch,
        IReadOnlyList<ArchGoalPlans.Step> Plan, bool PlanDerived, IReadOnlyList<QueuedMessage> Queue,
        bool Held, string? Summary, long? SummaryDeliveredAt, string? ContinuesId, bool Concurrent = false, IReadOnlyList<string>? Sessions = null)
    {
        public bool IsRunning => State == Running;
        public string Key => RepoSubagentKeys.Key(RepoId, Id);
    }

    private sealed class Entry
    {
        public string Id { get; set; } = "";
        public string RepoId { get; set; } = "";
        public string Name { get; set; } = "";
        public string Goal { get; set; } = "";
        public string State { get; set; } = Running;
        public long StartedAt { get; set; }
        public long? EndedAt { get; set; }
        public string? StartedBy { get; set; }
        public string? Outcome { get; set; }
        public string? ParentTabId { get; set; }
        public string? ParentSessionId { get; set; }
        public string? SessionId { get; set; }
        public int MaxIterations { get; set; }
        public bool ReadOnly { get; set; }
        public string? Model { get; set; }
        public string? Branch { get; set; }
        public List<ArchGoalPlans.Step> Plan { get; set; } = new();
        public bool PlanDerived { get; set; }
        public List<QueuedMessage> Queue { get; set; } = new();
        public bool Held { get; set; }
        public string? Summary { get; set; }
        public long? SummaryDeliveredAt { get; set; }
        public string? ContinuesId { get; set; }
        // The parent asserted the work does not overlap its own: runs alongside the parent (no lock).
        public bool Concurrent { get; set; }
        // EVERY session this subagent ever had (each turn forks one), so the picker can name them all.
        public List<string> Sessions { get; set; } = new();
    }

    private sealed class Data
    {
        public List<Entry> Subagents { get; set; } = new();
    }

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Data _data = new();

    public RepoSubagentStore(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "subagents.json");
        Load();
    }

    public string FilePath => _path;

    // ---- reads ----------------------------------------------------------------------------------

    public IReadOnlyList<Subagent> All()
    {
        lock (_gate) return _data.Subagents.Select(View).ToList();
    }

    public IReadOnlyList<Subagent> OfRepo(string? repoId)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return Array.Empty<Subagent>();
        lock (_gate) return _data.Subagents.Where(e => e.RepoId == repoId).Select(View).OrderByDescending(s => s.IsRunning).ThenByDescending(s => s.StartedAt).ToList();
    }

    public Subagent? Find(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        lock (_gate) return _data.Subagents.FirstOrDefault(e => string.Equals(e.Id, id.Trim(), StringComparison.Ordinal)) is { } e ? View(e) : null;
    }

    public Subagent? FindByKey(string? key) => RepoSubagentKeys.Parse(key) is { } p ? Find(p.SubagentId) : null;

    public int RunningCount(string repoId)
    {
        lock (_gate) return _data.Subagents.Count(e => e.RepoId == repoId && e.State == Running);
    }

    /// <summary>The subagent that owns <paramref name="sessionId"/>, if any.</summary>
    public Subagent? OwnerOfSession(string? sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return null;
        lock (_gate) return _data.Subagents.FirstOrDefault(e => string.Equals(e.SessionId, sessionId, StringComparison.Ordinal) || e.Sessions.Contains(sessionId)) is { } e ? View(e) : null;
    }

    // ---- writes ---------------------------------------------------------------------------------

    public Subagent Start(string repoId, string name, string goal, string? by, long now, int maxIterations, bool readOnly, string? model, string? branch,
        string? parentTabId, string? parentSessionId, IReadOnlyList<ArchGoalPlans.Step>? plan, bool planDerived, string? continuesId, bool concurrent = false)
    {
        lock (_gate)
        {
            var e = new Entry
            {
                Id = RepoSubagentKeys.NewId(), RepoId = repoId, Name = ArchStateStore.CleanName(name, "subagent"), Goal = (goal ?? "").Trim(), State = Running,
                StartedAt = now, StartedBy = string.IsNullOrWhiteSpace(by) ? null : by.Trim(), ParentTabId = parentTabId, ParentSessionId = parentSessionId,
                MaxIterations = maxIterations, ReadOnly = readOnly, Model = string.IsNullOrWhiteSpace(model) ? null : model.Trim(), Branch = branch,
                Plan = plan?.Take(ArchGoalPlans.MaxSteps).ToList() ?? new(), ContinuesId = continuesId, Concurrent = concurrent && !readOnly,
            };
            e.PlanDerived = planDerived && e.Plan.Count > 0;
            _data.Subagents.Add(e);
            // The record stays bounded: the oldest ENDED subagents of a repo fall off past the cap.
            var mine = _data.Subagents.Where(x => x.RepoId == repoId).ToList();
            if (mine.Count > MaxPerRepo)
                foreach (var old in mine.Where(x => x.State != Running).OrderBy(x => x.StartedAt).Take(mine.Count - MaxPerRepo)) _data.Subagents.Remove(old);
            Save();
            return View(e);
        }
    }

    public Subagent? SetPlan(string id, IReadOnlyList<ArchGoalPlans.Step> steps, bool? derived = null)
    {
        lock (_gate)
        {
            if (Get(id) is not { } e) return null;
            e.Plan = steps.Take(ArchGoalPlans.MaxSteps).ToList();
            if (derived is { } d) e.PlanDerived = d;
            Save();
            return View(e);
        }
    }

    public Subagent? SetSession(string id, string? sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return Find(id);
        lock (_gate)
        {
            if (Get(id) is not { } e) return null;
            if (string.Equals(e.SessionId, sessionId, StringComparison.Ordinal)) return View(e);
            e.SessionId = sessionId;
            if (!e.Sessions.Contains(sessionId)) e.Sessions.Add(sessionId);
            Save();
            return View(e);
        }
    }

    public Subagent? SetHeld(string id, bool held)
    {
        lock (_gate)
        {
            if (Get(id) is not { } e) return null;
            if (e.Held == held) return View(e);
            e.Held = held;
            Save();
            return View(e);
        }
    }

    /// <summary>Re-activates an ENDED subagent in place (continue): running again, the plan
    /// carried over (done steps stay done), summary cleared. Null when unknown or running.</summary>
    public Subagent? Reopen(string id, long now, int maxIterations)
    {
        lock (_gate)
        {
            if (Get(id) is not { } e || e.State == Running) return null;
            e.State = Running;
            e.EndedAt = null;
            e.Outcome = null;
            e.Held = false;
            e.Summary = null;
            e.SummaryDeliveredAt = null;
            e.MaxIterations = maxIterations;
            e.Plan = ArchGoalPlans.CarryOver(e.Plan, now);
            Save();
            return View(e);
        }
    }

    public Subagent? Queue(string id, string? text, long now)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        lock (_gate)
        {
            if (Get(id) is not { } e || e.State != Running) return null;
            e.Queue.Add(new QueuedMessage(now, text.Trim()));
            if (e.Queue.Count > MaxQueue) e.Queue.RemoveRange(0, e.Queue.Count - MaxQueue);
            Save();
            return View(e);
        }
    }

    public IReadOnlyList<QueuedMessage> Drain(string id)
    {
        lock (_gate)
        {
            if (Get(id) is not { } e || e.Queue.Count == 0) return Array.Empty<QueuedMessage>();
            var taken = e.Queue.ToList();
            e.Queue = new();
            Save();
            return taken;
        }
    }

    /// <summary>Ends a running subagent with its state, outcome and the summary to deliver.
    /// Idempotent for an ended one (returned unchanged).</summary>
    public Subagent? End(string id, string state, string? outcome, string? summary, long now)
    {
        lock (_gate)
        {
            if (Get(id) is not { } e) return null;
            if (e.State != Running) return View(e);
            e.State = string.IsNullOrWhiteSpace(state) ? Stopped : state;
            e.EndedAt = now;
            e.Outcome = string.IsNullOrWhiteSpace(outcome) ? null : outcome.Trim();
            e.Held = false;
            e.Summary = string.IsNullOrWhiteSpace(summary) ? null : summary;
            e.SummaryDeliveredAt = null;
            Save();
            return View(e);
        }
    }

    public Subagent? MarkSummaryDelivered(string id, long now)
    {
        lock (_gate)
        {
            if (Get(id) is not { } e) return null;
            e.SummaryDeliveredAt = now;
            Save();
            return View(e);
        }
    }

    /// <summary>Ended subagents whose summary has not reached the parent yet, oldest first.</summary>
    public IReadOnlyList<Subagent> UndeliveredSummaries()
    {
        lock (_gate) return _data.Subagents.Where(e => e.State != Running && e.Summary is not null && e.SummaryDeliveredAt is null).OrderBy(e => e.EndedAt ?? 0).Select(View).ToList();
    }

    public bool Remove(string id)
    {
        lock (_gate)
        {
            var n = _data.Subagents.RemoveAll(e => e.Id == id && e.State != Running);
            if (n > 0) Save();
            return n > 0;
        }
    }

    // ---- internals -------------------------------------------------------------------------------

    private Entry? Get(string? id) => string.IsNullOrWhiteSpace(id) ? null : _data.Subagents.FirstOrDefault(e => string.Equals(e.Id, id.Trim(), StringComparison.Ordinal));

    private static Subagent View(Entry e) => new(e.Id, e.RepoId, e.Name, e.Goal, e.State, e.StartedAt, e.EndedAt, e.StartedBy, e.Outcome,
        e.ParentTabId, e.ParentSessionId, e.SessionId, e.MaxIterations, e.ReadOnly, e.Model, e.Branch, e.Plan.ToList(), e.PlanDerived, e.Queue.ToList(),
        e.Held, e.Summary, e.SummaryDeliveredAt, e.ContinuesId, e.Concurrent, e.Sessions.ToList());

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            _data = JsonSerializer.Deserialize<Data>(File.ReadAllText(_path), JsonOpts) ?? new Data();
        }
        catch (Exception ex)
        {
            _logger.Error($"[SUBAGENT] failed to load {_path}: {ex.Message}");
            _data = new Data();
        }
    }

    private void Save()
    {
        try { File.WriteAllText(_path, JsonSerializer.Serialize(_data, JsonOpts)); }
        catch (Exception ex) { _logger.Error($"[SUBAGENT] failed to save {_path}: {ex.Message}"); }
    }
}
