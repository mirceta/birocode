using ClaudeWeb.Services.Logging;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Notes;

/// <summary>
/// Replicates the ideas board against the shared store behind the configured
/// web-app URL (openspec ideas-drive-sync). Choreography:
///  - PULL: poll every PollSeconds; when the remote rev moved, MergeFrom.
///  - PUSH: NotesService.Changed schedules a debounced (~2 s) pull-merge-CAS-push;
///    a conflict response re-merges against the returned store and retries, so a
///    push never clobbers another harness's write.
///  - OFFLINE: failures never touch local behavior; the dirty flag retries on
///    every poll tick until a push lands.
/// Disabled/unconfigured means this service makes ZERO outbound calls.
/// The sync URL is a bearer capability: log messages go through Sanitize and
/// never contain it.
/// </summary>
public class IdeasSyncService : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan PushDebounce = TimeSpan.FromSeconds(2);
    private const int MaxCasRetries = 3;

    public sealed record SyncStatus(string State, long? LastSyncAt, string? LastError, long Rev, bool Dirty);

    private readonly NotesService _notes;
    private readonly IdeasSyncConfigStore _config;
    private readonly IdeasSyncClient _client;
    private readonly Logger _logger;

    private readonly object _gate = new();
    private string _state = "disabled"; // disabled | synced | syncing | offline | error
    private long? _lastSyncAt;
    private string? _lastError;
    private long _lastSeenRev = -1;
    private bool _dirty;
    private DateTime? _pushDueUtc;
    private DateTime _nextPollUtc = DateTime.MinValue;

    public IdeasSyncService(NotesService notes, IdeasSyncConfigStore config, IdeasSyncClient client, Logger logger)
    {
        _notes = notes;
        _config = config;
        _client = client;
        _logger = logger;
        _notes.Changed += OnLocalChange;
    }

    public SyncStatus Status
    {
        get { lock (_gate) return new SyncStatus(_state, _lastSyncAt, _lastError, _lastSeenRev, _dirty); }
    }

    /// <summary>Called by the config endpoint after an update: poll right away,
    /// and forget the seen rev when the target changed (new URL = new store).</summary>
    public void Nudge(bool targetChanged)
    {
        lock (_gate)
        {
            _nextPollUtc = DateTime.MinValue;
            if (targetChanged) _lastSeenRev = -1;
        }
    }

    private void OnLocalChange()
    {
        lock (_gate)
        {
            _dirty = true;
            _pushDueUtc = DateTime.UtcNow + PushDebounce;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { await TickAsync(ct); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex) { _logger.Error($"[IDEAS-SYNC] Tick failed: {Sanitize(ex.Message)}"); }
            try { await Task.Delay(Tick, ct); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        var cfg = _config.Current;
        if (!cfg.Enabled || string.IsNullOrWhiteSpace(cfg.SyncUrl))
        {
            lock (_gate) { _state = "disabled"; _lastError = null; }
            return;
        }

        bool pushNow, pollNow;
        var now = DateTime.UtcNow;
        lock (_gate)
        {
            pushNow = _pushDueUtc is not null && now >= _pushDueUtc || _dirty && _pushDueUtc is null;
            pollNow = !pushNow && now >= _nextPollUtc;
        }

        if (pushNow)
        {
            lock (_gate) _pushDueUtc = null;
            await PushAsync(cfg.SyncUrl!, ct);
        }
        else if (pollNow)
        {
            lock (_gate) _nextPollUtc = now + TimeSpan.FromSeconds(cfg.PollSeconds);
            await PollAsync(cfg.SyncUrl!, ct);
        }
    }

    private async Task PollAsync(string url, CancellationToken ct)
    {
        lock (_gate) _state = "syncing";
        IdeasSyncClient.EndpointResult res;
        try { res = await _client.GetAsync(url, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            Fail(Classify(ex), ex.Message);
            return;
        }
        if (!res.Ok) { Fail("error", res.Error ?? "Endpoint reported failure."); return; }

        var outcome = _notes.MergeFrom(res.Store?.Ideas ?? new(), res.Store?.Tombstones ?? new());
        lock (_gate)
        {
            _lastSeenRev = res.Rev;
            _state = "synced";
            _lastError = null;
            _lastSyncAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (outcome.RemoteStale)
            {
                // Local holds something the shared store lacks (e.g. offline
                // edits) — push soon.
                _dirty = true;
                _pushDueUtc ??= DateTime.UtcNow;
            }
        }
    }

    private async Task PushAsync(string url, CancellationToken ct)
    {
        lock (_gate) { _state = "syncing"; _dirty = false; }
        try
        {
            for (var attempt = 0; attempt < MaxCasRetries; attempt++)
            {
                // Pull-merge first: a push always uploads the MERGED board.
                var remote = await _client.GetAsync(url, ct);
                if (!remote.Ok) { FailDirty("error", remote.Error ?? "Endpoint reported failure."); return; }
                _notes.MergeFrom(remote.Store?.Ideas ?? new(), remote.Store?.Tombstones ?? new());

                var snap = _notes.Snapshot();
                var res = await _client.PostAsync(url, remote.Rev, new IdeasSyncClient.SharedStore(snap.Ideas, snap.Tombstones), ct);
                if (res.Ok)
                {
                    lock (_gate)
                    {
                        _lastSeenRev = res.Rev;
                        _state = "synced";
                        _lastError = null;
                        _lastSyncAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    }
                    _logger.Info($"[IDEAS-SYNC] Pushed board (rev {res.Rev})");
                    return;
                }
                if (!res.Conflict) { FailDirty("error", res.Error ?? "Endpoint rejected the push."); return; }
                // CAS conflict: someone wrote in between — loop re-pulls and re-merges.
            }
            FailDirty("error", $"Push kept conflicting after {MaxCasRetries} attempts.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            FailDirty(Classify(ex), ex.Message);
        }
    }

    private static string Classify(Exception ex)
        => ex is HttpRequestException or TaskCanceledException or IOException ? "offline" : "error";

    private void Fail(string state, string message)
    {
        var clean = Sanitize(message);
        lock (_gate) { _state = state; _lastError = clean; }
        _logger.Error($"[IDEAS-SYNC] {(state == "offline" ? "Unreachable" : "Failed")}: {clean}");
    }

    // A failed push stays dirty and retries at the poll cadence — not every
    // tick, or an unreachable endpoint would be hammered once a second.
    private void FailDirty(string state, string message)
    {
        Fail(state, message);
        var retry = DateTime.UtcNow + TimeSpan.FromSeconds(_config.Current.PollSeconds);
        lock (_gate) { _dirty = true; _pushDueUtc = retry; }
    }

    // The sync URL must never reach logs or the status API.
    private string Sanitize(string message)
    {
        var url = _config.Current.SyncUrl;
        return string.IsNullOrEmpty(url) ? message : message.Replace(url, "<sync-url>");
    }
}
