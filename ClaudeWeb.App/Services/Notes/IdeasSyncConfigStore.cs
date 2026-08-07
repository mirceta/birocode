using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Notes;

/// <summary>
/// Sync configuration for the shared ideas board (openspec ideas-drive-sync):
/// one pasted Apps Script web-app URL + enabled flag + poll interval, persisted
/// to %APPDATA%\ClaudeWeb\ideas-sync.json with the atomic temp+rename write and
/// never-reseed-on-unreadable load guard (the NotesService pattern). Unconfigured
/// (no file / disabled) means ideas stay purely local.
///
/// The SyncUrl is a bearer capability — anyone holding it can read/write the
/// shared board — so it is returned only over the authenticated config API and
/// must NEVER be logged (see IdeasSyncService.Sanitize).
/// </summary>
public class IdeasSyncConfigStore
{
    public const int DefaultPollSeconds = 30;
    public const int MinPollSeconds = 5;
    public const int MaxPollSeconds = 3600;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public sealed record IdeasSyncConfig(bool Enabled, string? SyncUrl, int PollSeconds);

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private IdeasSyncConfig _config = new(false, null, DefaultPollSeconds);

    public IdeasSyncConfigStore(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "ideas-sync.json");
        Load();
    }

    public IdeasSyncConfig Current
    {
        get { lock (_gate) return _config; }
    }

    public IdeasSyncConfig Update(bool enabled, string? syncUrl, int pollSeconds)
    {
        var url = string.IsNullOrWhiteSpace(syncUrl) ? null : syncUrl.Trim();
        var next = new IdeasSyncConfig(
            enabled && url is not null,
            url,
            Math.Clamp(pollSeconds <= 0 ? DefaultPollSeconds : pollSeconds, MinPollSeconds, MaxPollSeconds));
        lock (_gate)
        {
            _config = next;
            Save();
        }
        _logger.Info($"[IDEAS-SYNC] Config updated (enabled={next.Enabled}, poll={next.PollSeconds}s)");
        return next;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var cfg = JsonSerializer.Deserialize<IdeasSyncConfig>(File.ReadAllText(_path));
            if (cfg is not null)
                _config = cfg with { PollSeconds = Math.Clamp(cfg.PollSeconds <= 0 ? DefaultPollSeconds : cfg.PollSeconds, MinPollSeconds, MaxPollSeconds) };
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[IDEAS-SYNC] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic temp+rename, same as NotesService.
    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_config, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[IDEAS-SYNC] Failed to save {_path}: {ex.Message}");
        }
    }
}
