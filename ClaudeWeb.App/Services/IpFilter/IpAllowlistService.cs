using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.IpFilter;

/// <summary>
/// The IP allowlist: named, approved guests + the attempt log
/// (plans/auth-ip-filter.md). Exact IPs only — no CIDR, no ranges.
///
/// Persisted OUTSIDE the repo in %APPDATA%\ClaudeWeb\ipallow.json (same
/// pattern as auth.json / sessions.json). First run seeds 127.0.0.1 as a
/// normal, removable "localhost" guest — there is deliberately NO code-level
/// localhost bypass.
///
/// SECURITY INVARIANT: <see cref="Approve"/> must only ever be called from
/// the desktop GUI (IpFilterPanel). No controller may expose it — the web
/// surface is read + remove only.
///
/// Last-access and attempt updates are flushed to disk at most every
/// ~30 s (no disk write per request); approve/remove persist immediately.
/// Thread-safe singleton, pre-built in Program.cs so the WinForms GUI and
/// the API share one instance (same pattern as RepositoryRegistry).
/// </summary>
public class IpAllowlistService
{
    private const int MaxAttemptIps = 200;
    private static readonly TimeSpan FlushInterval = TimeSpan.FromSeconds(30);
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();
    private DateTime _lastFlushUtc = DateTime.MinValue;
    private bool _dirty;

    /// <summary>Raised with the removed IP — the connection registry kills
    /// that IP's live connections; GUIs refresh.</summary>
    public event Action<string>? GuestRemoved;
    /// <summary>Raised on any data change (approve/remove/attempt) so the
    /// desktop panel can refresh. May fire on request threads.</summary>
    public event Action? Changed;

    public class GuestRecord
    {
        public string Ip { get; set; } = "";
        public string Name { get; set; } = "";
        public DateTime AddedUtc { get; set; }
        public DateTime? LastAccessUtc { get; set; }
    }

    public class AttemptRecord
    {
        public string Ip { get; set; } = "";
        public int Count { get; set; }
        public DateTime FirstUtc { get; set; }
        public DateTime LastUtc { get; set; }
    }

    private sealed class Store
    {
        public List<GuestRecord> Guests { get; set; } = new();
        public List<AttemptRecord> Attempts { get; set; } = new();
    }

    public IpAllowlistService(Logger logger)
    {
        _logger = logger;
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        _path = Path.Combine(dir, "ipallow.json");
        Load();
    }

    // --- gate -----------------------------------------------------------------

    public bool IsApproved(string ip)
    {
        lock (_gate) return _store.Guests.Any(g => g.Ip == ip);
    }

    /// <summary>Approved IP touched the harness — update last access (throttled flush).</summary>
    public void RecordAccess(string ip)
    {
        lock (_gate)
        {
            var guest = _store.Guests.FirstOrDefault(g => g.Ip == ip);
            if (guest == null) return;
            guest.LastAccessUtc = DateTime.UtcNow;
            _dirty = true;
            FlushIfDueLocked();
        }
    }

    /// <summary>Unapproved IP knocked — aggregate into the attempt log.</summary>
    public void RecordAttempt(string ip)
    {
        lock (_gate)
        {
            var now = DateTime.UtcNow;
            var attempt = _store.Attempts.FirstOrDefault(a => a.Ip == ip);
            if (attempt == null)
            {
                _store.Attempts.Add(new AttemptRecord { Ip = ip, Count = 1, FirstUtc = now, LastUtc = now });
                // Cap: keep the most recently seen IPs.
                if (_store.Attempts.Count > MaxAttemptIps)
                    _store.Attempts = _store.Attempts.OrderByDescending(a => a.LastUtc).Take(MaxAttemptIps).ToList();
            }
            else
            {
                attempt.Count++;
                attempt.LastUtc = now;
            }
            _dirty = true;
            FlushIfDueLocked();
        }
        Changed?.Invoke();
    }

    // --- management -----------------------------------------------------------

    /// <summary>DESKTOP GUI ONLY (see class doc). Approves an exact IP with a
    /// name and clears its attempt history. Returns an error message or null.</summary>
    public string? Approve(string ip, string name)
    {
        ip = ip.Trim();
        name = name.Trim();
        if (!System.Net.IPAddress.TryParse(ip, out _))
            return $"'{ip}' is not a valid IP address (exact IPs only — no ranges).";
        if (name.Length == 0)
            return "Every guest needs a name.";

        lock (_gate)
        {
            if (_store.Guests.Any(g => g.Ip == ip))
                return $"{ip} is already approved.";
            _store.Guests.Add(new GuestRecord { Ip = ip, Name = name, AddedUtc = DateTime.UtcNow });
            _store.Attempts.RemoveAll(a => a.Ip == ip);
            SaveLocked();
        }
        _logger.Info($"[IPFILTER] Approved {ip} as \"{name}\" (desktop GUI)");
        Changed?.Invoke();
        return null;
    }

    /// <summary>Removes a guest. Takes effect immediately: GuestRemoved lets
    /// the connection registry abort that IP's live connections.</summary>
    public bool Remove(string ip)
    {
        lock (_gate)
        {
            if (_store.Guests.RemoveAll(g => g.Ip == ip) == 0)
                return false;
            SaveLocked();
        }
        _logger.Info($"[IPFILTER] Removed {ip} from the allowlist — live connections terminated");
        GuestRemoved?.Invoke(ip);
        Changed?.Invoke();
        return true;
    }

    /// <summary>Clears the attempt log (a "dismiss" for the Operator).</summary>
    public void ClearAttempts()
    {
        lock (_gate)
        {
            _store.Attempts.Clear();
            SaveLocked();
        }
        Changed?.Invoke();
    }

    public (List<GuestRecord> Guests, List<AttemptRecord> Attempts) Snapshot()
    {
        lock (_gate)
        {
            return (
                _store.Guests.Select(Clone).OrderBy(g => g.Name, StringComparer.OrdinalIgnoreCase).ToList(),
                _store.Attempts.Select(Clone).OrderByDescending(a => a.LastUtc).ToList());
        }
    }

    private static GuestRecord Clone(GuestRecord g) => new()
    { Ip = g.Ip, Name = g.Name, AddedUtc = g.AddedUtc, LastAccessUtc = g.LastAccessUtc };

    private static AttemptRecord Clone(AttemptRecord a) => new()
    { Ip = a.Ip, Count = a.Count, FirstUtc = a.FirstUtc, LastUtc = a.LastUtc };

    // --- persistence ----------------------------------------------------------

    private void Load()
    {
        try
        {
            if (File.Exists(_path))
            {
                _store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path)) ?? new Store();
                _logger.Info($"[IPFILTER] Loaded {_store.Guests.Count} guest(s), {_store.Attempts.Count} attempt IP(s)");
                return;
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[IPFILTER] Failed to load {_path}: {ex.Message} — starting with seed only");
        }

        // First run: seed loopback as a normal, removable guest so local
        // testing works without any code-level localhost branch.
        _store = new Store
        {
            Guests = { new GuestRecord { Ip = "127.0.0.1", Name = "localhost", AddedUtc = DateTime.UtcNow } }
        };
        lock (_gate) SaveLocked();
        _logger.Info("[IPFILTER] Seeded allowlist with 127.0.0.1 (\"localhost\")");
    }

    private void FlushIfDueLocked()
    {
        if (_dirty && DateTime.UtcNow - _lastFlushUtc >= FlushInterval)
            SaveLocked();
    }

    private void SaveLocked()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_store, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
            _dirty = false;
            _lastFlushUtc = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            _logger.Error($"[IPFILTER] Failed to save {_path}: {ex.Message}");
        }
    }
}
