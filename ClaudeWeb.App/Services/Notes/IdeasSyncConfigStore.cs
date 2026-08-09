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

    /// <summary>
    /// Normalizes a pasted sync URL (scheme-less means https, openspec
    /// ideas-harness-hub) and rejects shapes that can never speak the
    /// shared-store contract (openspec fix-ideas-sync-url-guidance): the
    /// contract lives at a path (`…/api/notes/hub/&lt;token&gt;` or Apps Script
    /// `…/exec`), so a site root is always a mistake — it points at the gated
    /// harness front door and used to fail later with a bare 403.
    /// </summary>
    public static bool TryNormalizeUrl(string? raw, out string? url, out string? error)
    {
        error = null;
        url = string.IsNullOrWhiteSpace(raw) ? null : raw.Trim();
        if (url is null) return true;
        if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            url = "https://" + url;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            uri.AbsolutePath is null or "" or "/")
        {
            error = "That is not a shared-board endpoint. Paste the FULL URL — " +
                    "a hub URL like https://<harness>/api/notes/hub/<token> " +
                    "(shown under \"Host the shared board\" on the hosting harness) " +
                    "or a Google Apps Script …/exec URL. A bare harness address " +
                    "points at the gated home page and can never sync.";
            return false;
        }
        return true;
    }

    public IdeasSyncConfig Update(bool enabled, string? syncUrl, int pollSeconds)
    {
        // Callers validate via TryNormalizeUrl first; normalizing again here
        // keeps Update safe on its own.
        TryNormalizeUrl(syncUrl, out var url, out _);
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
