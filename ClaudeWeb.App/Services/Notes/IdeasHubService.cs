using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClaudeWeb.Services.Logging;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Notes;

/// <summary>
/// The harness-as-hub side of the shared ideas board (openspec ideas-harness-hub):
/// when enabled, THIS harness serves the same wire contract the Apps Script web
/// app speaks (GET → {ok, rev, store}; POST {baseRev, store} → CAS), so other
/// harnesses point their unchanged IdeasSyncClient at
/// /api/notes/hub/{token}. The backing store is this harness's own ideas board —
/// a remote POST lands through NotesService.MergeFrom (never a blind overwrite),
/// and a hub-local edit bumps the revision via the Changed event.
///
/// The token is a bearer capability, exactly like the Apps Script /exec URL:
/// 256 random bits, compared in constant time, exempt from session auth
/// (PasswordAuthMiddleware), and never logged. State persists to
/// %APPDATA%\ClaudeWeb\ideas-hub.json (atomic temp+rename, never-reseed load);
/// Rev persists so a hub restart cannot make a stale client CAS falsely succeed.
///
/// IHostedService only to force construction at startup, so the Changed
/// subscription is live before the first hub request.
/// </summary>
public class IdeasHubService : IHostedService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public sealed record HubState(bool Enabled, string? Token, long Rev);

    /// <summary>One contract exchange, pre-serialization. Store is null on ok
    /// POSTs (the Apps Script answers rev-only there too).</summary>
    public sealed record HubEnvelope(bool Ok, bool Conflict, long Rev, NotesService.BoardSnapshot? Store, string? Error);

    private readonly NotesService _notes;
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private HubState _state = new(false, null, 0);

    public IdeasHubService(NotesService notes, Logger logger)
    {
        _notes = notes;
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "ideas-hub.json");
        Load();
        _notes.Changed += OnLocalChange;
    }

    public HubState Current
    {
        get { lock (_gate) return _state; }
    }

    public HubState SetEnabled(bool enabled)
    {
        HubState next;
        lock (_gate)
        {
            var token = _state.Token;
            if (enabled && string.IsNullOrEmpty(token))
                token = GenerateToken();
            next = _state = new HubState(enabled, token, _state.Rev);
            Save();
        }
        _logger.Info($"[IDEAS-HUB] Hosting {(enabled ? "enabled" : "disabled")}");
        return next;
    }

    /// <summary>Constant-time token check; false when hosting is off. The token
    /// is the ONLY credential on the hub path, so no early-out on content.</summary>
    public bool TokenMatches(string? supplied)
    {
        string? token;
        bool enabled;
        lock (_gate) { token = _state.Token; enabled = _state.Enabled; }
        if (!enabled || string.IsNullOrEmpty(token) || string.IsNullOrEmpty(supplied))
            return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(supplied), Encoding.UTF8.GetBytes(token));
    }

    public HubEnvelope Get()
    {
        lock (_gate)
        {
            if (!_state.Enabled) return Disabled();
            return new HubEnvelope(true, false, _state.Rev, _notes.Snapshot(), null);
        }
    }

    public HubEnvelope Post(long baseRev, List<NotesService.Note> ideas, List<NotesService.Tombstone> tombstones)
    {
        lock (_gate)
        {
            if (!_state.Enabled) return Disabled();
            if (baseRev != _state.Rev)
                return new HubEnvelope(false, true, _state.Rev, _notes.Snapshot(), null);
            // MergeFrom does not raise Changed, so the rev moves exactly once here.
            _notes.MergeFrom(ideas, tombstones);
            _state = _state with { Rev = _state.Rev + 1 };
            Save();
            return new HubEnvelope(true, false, _state.Rev, null, null);
        }
    }

    private static HubEnvelope Disabled()
        => new(false, false, 0, null, "Hub hosting is not enabled on this harness.");

    // A hub-local edit must move the rev — pollers merge either way, but the rev
    // stays an honest "board changed" counter for CAS.
    private void OnLocalChange()
    {
        lock (_gate)
        {
            if (!_state.Enabled) return;
            _state = _state with { Rev = _state.Rev + 1 };
            Save();
        }
    }

    private static string GenerateToken()
        => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var state = JsonSerializer.Deserialize<HubState>(File.ReadAllText(_path));
            if (state is not null) _state = state;
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[IDEAS-HUB] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic temp+rename, same as NotesService.
    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_state, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[IDEAS-HUB] Failed to save {_path}: {ex.Message}");
        }
    }

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
