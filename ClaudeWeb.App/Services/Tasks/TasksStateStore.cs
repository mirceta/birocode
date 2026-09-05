using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Tasks;

/// <summary>
/// The Tasks agent's durable harness-side state (openspec: tasks-agent, D1): the
/// last session id, so the conversation survives a harness restart. One file under
/// the data dir: <c>tasks-agent.json</c>.
/// </summary>
public class TasksStateStore
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private readonly object _gate = new();
    private readonly string _path;
    private readonly Logger _logger;
    private Data _data = new();

    private sealed class Data
    {
        public string? LastSessionId { get; set; }
    }

    public string FilePath => _path;

    public TasksStateStore(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "tasks-agent.json");
        Load();
    }

    public string? LastSessionId
    {
        get { lock (_gate) return _data.LastSessionId; }
    }

    public void SetLastSessionId(string? sessionId)
    {
        lock (_gate)
        {
            _data.LastSessionId = string.IsNullOrWhiteSpace(sessionId) ? null : sessionId.Trim();
            Save();
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            _data = JsonSerializer.Deserialize<Data>(File.ReadAllText(_path)) ?? new Data();
        }
        catch (Exception ex)
        {
            _logger.Error($"[TASKS] could not read {_path}: {ex.Message} — starting empty (file left untouched)");
            _data = new Data();
        }
    }

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
            _logger.Error($"[TASKS] could not write {_path}: {ex.Message}");
        }
    }
}
