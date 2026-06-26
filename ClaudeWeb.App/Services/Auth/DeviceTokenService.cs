using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Auth;

/// <summary>
/// Trusted-device tokens (openspec add-resilient-auth). When the Operator
/// approves a friend's IP and that friend logs in, the server mints a
/// long-lived "claudeweb_device" cookie on their device. Thereafter the IP
/// gate admits an approved IP OR a valid device cookie, so a rotated 4G/5G IP
/// no longer re-bars an already-approved device.
///
/// Mirrors <see cref="AuthService"/>'s session store: a 256-bit random token
/// whose SHA-256 hash is persisted in %APPDATA%\ClaudeWeb\devices.json (a
/// leaked file does not leak usable tokens). Sliding lifetime
/// (AppConfig.DeviceCookieDays). Each token is tagged with the friend's name
/// (the approved-IP guest name at mint time) and is revocable from the desktop
/// GUI — removing the IP no longer evicts a cookie-holder, so revocation must
/// exist here too.
///
/// Thread-safe singleton, pre-built in Program.cs so the WinForms "Trusted
/// devices" GUI and the web API share one instance (same pattern as
/// <see cref="IpFilter.IpAllowlistService"/>).
/// </summary>
public class DeviceTokenService
{
    public const string CookieName = "claudeweb_device";

    private const int TokenBytes = 32;
    private const int MaxTokens = 200;
    // LastSeen is persisted at most this often per token to limit disk writes
    // (a changed source IP also forces a flush, for the Operator's visibility).
    private static readonly TimeSpan LastSeenPersistInterval = TimeSpan.FromHours(1);
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly TimeSpan _lifetime;
    private readonly object _gate = new();
    private List<DeviceRecord> _devices = new();

    /// <summary>Raised on mint/revoke so the desktop "Trusted devices" panel
    /// can refresh. May fire on request threads.</summary>
    public event Action? Changed;

    /// <summary>Configured sliding lifetime — also used for the cookie Max-Age.</summary>
    public TimeSpan Lifetime => _lifetime;

    private sealed class DeviceRecord
    {
        public string TokenHash { get; set; } = "";
        public string Name { get; set; } = "";
        public DateTime IssuedUtc { get; set; }
        public DateTime LastSeenUtc { get; set; }
        public string? LastIp { get; set; }
    }

    /// <summary>Read-only view for the desktop GUI. <see cref="RevokeId"/> is the
    /// token hash — the raw token is never persisted or shown.</summary>
    public sealed record DeviceView(string RevokeId, string Name, DateTime IssuedUtc, DateTime LastSeenUtc, string? LastIp);

    public DeviceTokenService(AppConfig config, Logger logger)
    {
        _logger = logger;
        _lifetime = TimeSpan.FromDays(config.DeviceCookieDays > 0 ? config.DeviceCookieDays : 180);
        _path = Path.Combine(AppPaths.DataDir, "devices.json");
        Load();
    }

    /// <summary>Issues a token tagged with <paramref name="name"/> and returns
    /// the raw token (only ever held by the client).</summary>
    public string Issue(string name)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(TokenBytes)).ToLowerInvariant();
        var now = DateTime.UtcNow;
        lock (_gate)
        {
            Prune();
            _devices.Add(new DeviceRecord { TokenHash = Sha256(token), Name = name, IssuedUtc = now, LastSeenUtc = now });
            // Cap runaway growth (most-recently-seen first).
            if (_devices.Count > MaxTokens)
                _devices = _devices.OrderByDescending(d => d.LastSeenUtc).Take(MaxTokens).ToList();
            Save();
        }
        _logger.Info($"[DEVICE] Minted trusted-device token for \"{name}\"");
        Changed?.Invoke();
        return token;
    }

    /// <summary>Returns the device name when the token matches a live record —
    /// sliding its expiry and recording the source IP — or null otherwise.</summary>
    public string? ValidateAndSlide(string? token, string? ip = null)
    {
        if (string.IsNullOrEmpty(token)) return null;
        var hash = Sha256(token);
        var now = DateTime.UtcNow;
        lock (_gate)
        {
            var d = _devices.FirstOrDefault(x => x.TokenHash == hash);
            if (d is null || now - d.LastSeenUtc > _lifetime) return null;
            var persist = now - d.LastSeenUtc > LastSeenPersistInterval || (ip != null && ip != d.LastIp);
            d.LastSeenUtc = now;
            if (ip != null) d.LastIp = ip;
            if (persist) Save();
            return d.Name;
        }
    }

    /// <summary>True when the token is a live device token (no side effects).</summary>
    public bool IsValid(string? token)
    {
        if (string.IsNullOrEmpty(token)) return false;
        var hash = Sha256(token);
        var now = DateTime.UtcNow;
        lock (_gate)
        {
            var d = _devices.FirstOrDefault(x => x.TokenHash == hash);
            return d is not null && now - d.LastSeenUtc <= _lifetime;
        }
    }

    /// <summary>Revokes one device by its <see cref="DeviceView.RevokeId"/> (token hash).</summary>
    public bool Revoke(string revokeId)
    {
        lock (_gate)
        {
            if (_devices.RemoveAll(d => d.TokenHash == revokeId) == 0) return false;
            Save();
        }
        _logger.Info("[DEVICE] Revoked a trusted-device token");
        Changed?.Invoke();
        return true;
    }

    /// <summary>Revokes every device tagged with <paramref name="name"/> (used when a
    /// guest is removed, so a cookie can't outlive the IP removal). Returns the count.</summary>
    public int RevokeByName(string name)
    {
        int n;
        lock (_gate)
        {
            n = _devices.RemoveAll(d => string.Equals(d.Name, name, StringComparison.OrdinalIgnoreCase));
            if (n > 0) Save();
        }
        if (n > 0)
        {
            _logger.Info($"[DEVICE] Revoked {n} trusted-device token(s) for \"{name}\"");
            Changed?.Invoke();
        }
        return n;
    }

    /// <summary>Read-only snapshot for the desktop GUI (newest activity first).</summary>
    public List<DeviceView> Snapshot()
    {
        lock (_gate)
            return _devices
                .OrderByDescending(d => d.LastSeenUtc)
                .Select(d => new DeviceView(d.TokenHash, d.Name, d.IssuedUtc, d.LastSeenUtc, d.LastIp))
                .ToList();
    }

    // --- persistence ----------------------------------------------------------

    private void Load()
    {
        try
        {
            if (File.Exists(_path))
            {
                _devices = JsonSerializer.Deserialize<List<DeviceRecord>>(File.ReadAllText(_path)) ?? new();
                Prune();
                _logger.Info($"[DEVICE] Loaded {_devices.Count} trusted device(s)");
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[DEVICE] Failed to load {_path}: {ex.Message}");
        }
    }

    private void Prune()
    {
        // Caller holds _gate (or runs during single-threaded startup).
        var cutoff = DateTime.UtcNow - _lifetime;
        _devices.RemoveAll(d => d.LastSeenUtc < cutoff);
    }

    private void Save()
    {
        // Caller holds _gate. Atomic temp-then-move, like ipallow.json.
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_devices, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[DEVICE] Failed to persist {_path}: {ex.Message}");
        }
    }

    private static string Sha256(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
