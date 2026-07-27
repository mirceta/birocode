using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// Persisted per-agent LOOP configs (plans/autopilot-loop-mode.md). Loop mode is the
/// deterministic sibling of the classifier autopilot: for an armed loop it resends ONE
/// fixed prompt every time the agent finishes a turn, until a stop condition (sentinel
/// phrase, deny-list hit, iteration cap, or run error). One loop per agent (repoId key).
///
/// Stored at <c>%APPDATA%\ClaudeWeb\loops.json</c> with the same atomic temp+rename
/// write and never-reseed-on-unreadable load guard as <see cref="AutopilotConfigStore"/>.
/// The durable fields (prompt/sentinel/cap/active) and the live counters
/// (iterationsDone/status/lastSentAt) live together so a restart resumes an in-flight
/// loop where it left off. All sends are still fenced by <see cref="AutopilotGate"/> and
/// the global kill switch — this store only holds the per-loop intent.
/// </summary>
public class LoopConfigStore
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    public const string DefaultSentinel = "LOOP_DONE";
    public const int DefaultMaxIterations = 10;

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Data _data = new();

    public LoopConfigStore(Logger logger)
    {
        _logger = logger;
        // AppPaths (not %APPDATA% directly) so an isolated CLAUDEWEB_DATADIR
        // instance keeps its own loops instead of sharing the operator's live ones.
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "loops.json");
        Load();
    }

    // On-disk shape. A loop is "active" only while Status == "looping"; every stop
    // outcome clears Active so the engine no longer ticks it.
    private sealed class Entry
    {
        public string Prompt { get; set; } = "";
        public string Sentinel { get; set; } = DefaultSentinel;
        public int MaxIterations { get; set; } = DefaultMaxIterations;
        public bool Active { get; set; }
        public int IterationsDone { get; set; }
        public string Status { get; set; } = "stopped"; // looping | done | escalate | capped | error | stopped
        public long LastSentAt { get; set; }
        // Why the loop stopped, written by Resolve (additive fields — old loops.json
        // files load with both null). Reason is the machine string naming the condition
        // that fired (sentinel | needs-human | deny-list | cap | error | user); Detail
        // is the human-readable specifics (the NEEDS_HUMAN question, the matched deny
        // word, "cap 10/10").
        public string? StopReason { get; set; }
        public string? StopDetail { get; set; }
        // The recipe this loop was armed from, if any (additive; display only —
        // the loop keeps its own copy of prompt/sentinel/cap, so a later recipe
        // edit never mutates a running loop).
        public string? RecipeId { get; set; }
        public string? RecipeName { get; set; }
    }

    private sealed class Data
    {
        public Dictionary<string, Entry> Loops { get; set; } = new();
    }

    /// <summary>One loop's state, as the API and engine see it.</summary>
    public sealed record LoopState(
        string RepoId, string Prompt, string Sentinel, int MaxIterations,
        bool Active, int IterationsDone, string Status, long LastSentAt,
        string? StopReason, string? StopDetail, string? RecipeId, string? RecipeName);

    public IReadOnlyList<LoopState> All()
    {
        lock (_gate)
            return _data.Loops
                .Select(kv => ToState(kv.Key, kv.Value))
                .OrderBy(s => s.RepoId, StringComparer.OrdinalIgnoreCase)
                .ToList();
    }

    public LoopState? Get(string repoId)
    {
        lock (_gate)
            return _data.Loops.TryGetValue(repoId, out var e) ? ToState(repoId, e) : null;
    }

    /// <summary>Arms (or re-arms) a loop: resets counters and sets it running.
    /// When armed from a recipe, the recipe's id/name are stamped on for display.</summary>
    public LoopState Start(string repoId, string prompt, string? sentinel, int? maxIterations,
        string? recipeId = null, string? recipeName = null)
    {
        lock (_gate)
        {
            var e = new Entry
            {
                Prompt = prompt,
                Sentinel = string.IsNullOrWhiteSpace(sentinel) ? DefaultSentinel : sentinel.Trim(),
                MaxIterations = Math.Clamp(maxIterations ?? DefaultMaxIterations, 1, 100),
                Active = true,
                IterationsDone = 0,
                Status = "looping",
                LastSentAt = 0,
                RecipeId = recipeId,
                RecipeName = recipeName,
            };
            _data.Loops[repoId] = e;
            Save();
            _logger.Info($"[LOOP] armed {repoId} (cap {e.MaxIterations}, sentinel \"{e.Sentinel}\")");
            return ToState(repoId, e);
        }
    }

    /// <summary>Edits a loop's fields without resetting its counter (used to tweak a
    /// running loop, e.g. raise the cap). No-op if the loop doesn't exist.</summary>
    public LoopState? Update(string repoId, string? prompt, string? sentinel, int? maxIterations)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            if (prompt != null) e.Prompt = prompt;
            if (!string.IsNullOrWhiteSpace(sentinel)) e.Sentinel = sentinel.Trim();
            if (maxIterations is int cap) e.MaxIterations = Math.Clamp(cap, 1, 100);
            Save();
            return ToState(repoId, e);
        }
    }

    /// <summary>Stops a loop by the user's hand (the Stop button).</summary>
    public LoopState? Stop(string repoId) => Resolve(repoId, "stopped", "user", "stopped by the user");

    /// <summary>Engine: terminal/stop outcome (done | escalate | capped | error | stopped),
    /// plus WHY it stopped (reason = the condition that fired, detail = its specifics).
    /// Clears Active so the loop no longer ticks; keeps the counter for the UI.</summary>
    public LoopState? Resolve(string repoId, string status, string? reason = null, string? detail = null)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            e.Active = false;
            e.Status = status;
            e.StopReason = reason;
            e.StopDetail = detail;
            Save();
            _logger.Info($"[LOOP] {repoId} -> {status} after {e.IterationsDone} iteration(s)"
                + (reason is null ? "" : $" ({reason}{(string.IsNullOrEmpty(detail) ? "" : $": {detail}")})"));
            return ToState(repoId, e);
        }
    }

    /// <summary>Engine: record one resend — bumps the iteration counter and timestamp.</summary>
    public LoopState? RecordSend(string repoId, long at)
    {
        lock (_gate)
        {
            if (!_data.Loops.TryGetValue(repoId, out var e)) return null;
            e.IterationsDone++;
            e.LastSentAt = at;
            e.Status = "looping";
            e.StopReason = null;
            e.StopDetail = null;
            Save();
            return ToState(repoId, e);
        }
    }

    private static LoopState ToState(string repoId, Entry e) =>
        new(repoId, e.Prompt, e.Sentinel, e.MaxIterations, e.Active, e.IterationsDone, e.Status, e.LastSentAt,
            e.StopReason, e.StopDetail, e.RecipeId, e.RecipeName);

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var data = JsonSerializer.Deserialize<Data>(File.ReadAllText(_path));
            if (data is null) return;
            data.Loops ??= new();
            _data = data;
        }
        catch (Exception ex)
        {
            _logger.Error($"[LOOP] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic temp+rename — a kill mid-write can't truncate it.
    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_data, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[LOOP] Failed to save {_path}: {ex.Message}");
        }
    }
}
