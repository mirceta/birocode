using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Recurring;

/// <summary>The run history (openspec recurring-tasks): <c>recurring-runs.jsonl</c>,
/// append-only — a later line with the same id REPLACES the earlier (running → done), so a
/// crash mid-run loses nothing. Compacted at startup: last line per id wins, the newest
/// <see cref="KeepPerTask"/> runs per task are kept.</summary>
public sealed class RecurringRunLog
{
    public const int KeepPerTask = 500;
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    // Per task, oldest → newest.
    private readonly Dictionary<string, List<RecurringRun>> _byTask = new(StringComparer.Ordinal);

    public RecurringRunLog(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "recurring-runs.jsonl");
        LoadAndCompact();
    }

    /// <summary>Insert or replace by id; appended to disk either way.</summary>
    public void Upsert(RecurringRun run)
    {
        lock (_gate)
        {
            if (!_byTask.TryGetValue(run.TaskId, out var list)) _byTask[run.TaskId] = list = new();
            var i = list.FindIndex(r => r.Id == run.Id);
            if (i >= 0) list[i] = run; else list.Add(run);
            if (list.Count > KeepPerTask) list.RemoveRange(0, list.Count - KeepPerTask);
            try { File.AppendAllText(_path, JsonSerializer.Serialize(run) + "\n"); }
            catch (Exception ex) { _logger.Error($"[RECURRING] failed to append to {_path}: {ex.Message}"); }
        }
    }

    /// <summary>Newest first; <paramref name="beforeMs"/> pages by the run's start (armed, else due).</summary>
    public IReadOnlyList<RecurringRun> Runs(string taskId, int limit = 50, long? beforeMs = null)
    {
        lock (_gate)
        {
            if (!_byTask.TryGetValue(taskId, out var list)) return Array.Empty<RecurringRun>();
            IEnumerable<RecurringRun> q = list.AsEnumerable().Reverse();
            if (beforeMs is long b) q = q.Where(r => (r.ArmedAt ?? r.DueAt) < b);
            return q.Take(Math.Clamp(limit, 1, KeepPerTask)).ToList();
        }
    }

    public int Count(string taskId) { lock (_gate) return _byTask.TryGetValue(taskId, out var l) ? l.Count : 0; }

    public RecurringRun? RunningOf(string taskId)
    {
        lock (_gate) return _byTask.TryGetValue(taskId, out var l) ? l.LastOrDefault(r => r.IsRunning) : null;
    }

    public IReadOnlyList<RecurringRun> Running()
    {
        lock (_gate) return _byTask.Values.SelectMany(l => l.Where(r => r.IsRunning)).ToList();
    }

    public void RemoveTask(string taskId)
    {
        lock (_gate) { if (_byTask.Remove(taskId)) Rewrite(); }
    }

    private void LoadAndCompact()
    {
        if (!File.Exists(_path)) return;
        var lines = 0;
        try
        {
            var byId = new Dictionary<string, RecurringRun>(StringComparer.Ordinal);
            var order = new List<string>();
            foreach (var line in File.ReadLines(_path))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                lines++;
                RecurringRun? r;
                try { r = JsonSerializer.Deserialize<RecurringRun>(line); } catch { continue; }   // a torn last line
                if (r is null || string.IsNullOrEmpty(r.Id)) continue;
                if (!byId.ContainsKey(r.Id)) order.Add(r.Id);
                byId[r.Id] = r;
            }
            foreach (var id in order)
            {
                var r = byId[id];
                if (!_byTask.TryGetValue(r.TaskId, out var list)) _byTask[r.TaskId] = list = new();
                list.Add(r);
            }
            foreach (var list in _byTask.Values)
                if (list.Count > KeepPerTask) list.RemoveRange(0, list.Count - KeepPerTask);
            if (lines > _byTask.Values.Sum(l => l.Count)) lock (_gate) Rewrite();
        }
        catch (Exception ex) { _logger.Error($"[RECURRING] failed to read {_path}: {ex.Message}"); }
    }

    // Caller holds _gate.
    private void Rewrite()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllLines(tmp, _byTask.Values.SelectMany(l => l).OrderBy(r => r.ArmedAt ?? r.DueAt).Select(r => JsonSerializer.Serialize(r)));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex) { _logger.Error($"[RECURRING] failed to compact {_path}: {ex.Message}"); }
    }
}
