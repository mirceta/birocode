using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Recurring;

/// <summary>The recurring-task cards (openspec recurring-tasks): <c>recurring.json</c> under
/// the data dir, atomic temp+rename writes, never reseeded over an unreadable file. Owned by
/// exactly ONE harness — deliberately not replicated over the sync channel: a card that
/// lived on two harnesses would fire twice.</summary>
public sealed class RecurringTaskStore
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private List<RecurringTask> _tasks = new();
    private bool _unreadable;

    public RecurringTaskStore(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "recurring.json");
        Load();
    }

    public IReadOnlyList<RecurringTask> All() { lock (_gate) return _tasks.ToList(); }

    public RecurringTask? Get(string id) { lock (_gate) return _tasks.FirstOrDefault(t => t.Id == id); }

    public RecurringTask Add(RecurringTask t)
    {
        lock (_gate) { _tasks.Add(t); Save(); }
        return t;
    }

    public RecurringTask? Update(string id, Func<RecurringTask, RecurringTask> change)
    {
        lock (_gate)
        {
            var i = _tasks.FindIndex(t => t.Id == id);
            if (i < 0) return null;
            _tasks[i] = change(_tasks[i]);
            Save();
            return _tasks[i];
        }
    }

    public bool Remove(string id)
    {
        lock (_gate)
        {
            if (_tasks.RemoveAll(t => t.Id == id) == 0) return false;
            Save();
            return true;
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            _tasks = JsonSerializer.Deserialize<List<RecurringTask>>(File.ReadAllText(_path)) ?? new();
        }
        catch (Exception ex)
        {
            // Keep the file: an unreadable store must never be overwritten by an empty one.
            _unreadable = true;
            _logger.Error($"[RECURRING] {_path} is unreadable ({ex.Message}); recurring tasks are off until it is fixed — the file is left untouched");
        }
    }

    // Caller holds _gate.
    private void Save()
    {
        if (_unreadable) { _logger.Error("[RECURRING] not saving: recurring.json was unreadable at startup"); return; }
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_tasks, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex) { _logger.Error($"[RECURRING] failed to save {_path}: {ex.Message}"); }
    }
}
