using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Auth;

/// <summary>
/// Single-password session auth for internet exposure (plans/auth-login.md).
///
/// Secrets live OUTSIDE the repo in stable %APPDATA%\ClaudeWeb files:
///   - auth.json     -- PBKDF2-SHA256 hash of the password. Seeded from
///                      AppConfig.AuthPassword on first run; after that the
///                      committed config value is ignored.
///   - sessions.json -- active sessions, storing SHA-256 hashes of the tokens
///                      (a leaked file does not leak usable tokens). Sliding
///                      30-day expiry; survives restarts so devices stay
///                      logged in across deploys.
///
/// Brute-force throttling is in-memory per client key (IP): 5 free attempts,
/// then an exponential lockout (30 s doubling, capped at 1 h).
///
/// Thread-safe: singleton shared by Kestrel request threads.
/// </summary>
public class AuthService
{
    private const int Pbkdf2Iterations = 210_000;
    private const int SaltBytes = 16;
    private const int HashBytes = 32;
    private const int TokenBytes = 32;
    private const int MaxSessions = 100;
    private const int FreeAttempts = 5;
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(30);
    private static readonly TimeSpan BaseLockout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan MaxLockout = TimeSpan.FromHours(1);
    // LastSeen is persisted at most this often per session to limit disk writes.
    private static readonly TimeSpan LastSeenPersistInterval = TimeSpan.FromHours(1);

    private readonly Logger _logger;
    private readonly string _authPath;
    private readonly string _sessionsPath;
    private readonly object _gate = new();
    private string _passwordHash = "";
    private int _passwordVersion;
    private List<SessionRecord> _sessions = new();
    private readonly Dictionary<string, FailState> _failures = new();

    private sealed class SessionRecord
    {
        public string TokenHash { get; set; } = "";
        public DateTime CreatedUtc { get; set; }
        public DateTime LastSeenUtc { get; set; }
    }

    private sealed class FailState
    {
        public int Count;
        public DateTime BlockedUntilUtc;
    }

    private sealed class AuthFile
    {
        public string PasswordHash { get; set; } = "";
    }

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public AuthService(AppConfig config, Logger logger)
    {
        _logger = logger;
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        _authPath = Path.Combine(dir, "auth.json");
        _sessionsPath = Path.Combine(dir, "sessions.json");
        LoadOrSeed(config);
        LoadSessions();
    }

    // --- password -------------------------------------------------------------

    /// <summary>Bumped on every password change so callers can invalidate caches.</summary>
    public int PasswordVersion
    {
        get { lock (_gate) return _passwordVersion; }
    }

    public bool VerifyPassword(string? password)
    {
        if (string.IsNullOrEmpty(password)) return false;
        string hash;
        lock (_gate) hash = _passwordHash;
        return VerifyAgainstHash(password, hash);
    }

    /// <summary>
    /// Changes the password (verifying the current one) and revokes every
    /// session except <paramref name="keepToken"/>. Returns an error message
    /// or null on success.
    /// </summary>
    public string? ChangePassword(string? current, string? next, string? keepToken)
    {
        if (!VerifyPassword(current)) return "Current password is incorrect";
        if (string.IsNullOrWhiteSpace(next) || next.Length < 8)
            return "New password must be at least 8 characters";

        lock (_gate)
        {
            _passwordHash = HashPassword(next);
            _passwordVersion++;
            SaveAuth();
            var keepHash = keepToken is null ? null : Sha256(keepToken);
            _sessions.RemoveAll(s => s.TokenHash != keepHash);
            SaveSessions();
        }
        _logger.Info("[AUTH] Password changed; other sessions revoked");
        return null;
    }

    // --- sessions ---------------------------------------------------------------

    /// <summary>Creates a session and returns the raw token (only ever held by the client).</summary>
    public string CreateSession()
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(TokenBytes)).ToLowerInvariant();
        var now = DateTime.UtcNow;
        lock (_gate)
        {
            Prune();
            _sessions.Add(new SessionRecord { TokenHash = Sha256(token), CreatedUtc = now, LastSeenUtc = now });
            // Cap runaway growth (oldest first).
            if (_sessions.Count > MaxSessions)
                _sessions = _sessions.OrderByDescending(s => s.LastSeenUtc).Take(MaxSessions).ToList();
            SaveSessions();
        }
        _logger.Info("[AUTH] Session created");
        return token;
    }

    /// <summary>True when the token matches a live session. Slides the expiry.</summary>
    public bool ValidateSession(string? token)
    {
        if (string.IsNullOrEmpty(token)) return false;
        var hash = Sha256(token);
        var now = DateTime.UtcNow;
        lock (_gate)
        {
            var s = _sessions.FirstOrDefault(x => x.TokenHash == hash);
            if (s is null || now - s.LastSeenUtc > SessionLifetime) return false;
            if (now - s.LastSeenUtc > LastSeenPersistInterval)
            {
                s.LastSeenUtc = now;
                SaveSessions();
            }
            else
            {
                s.LastSeenUtc = now;
            }
            return true;
        }
    }

    public void RevokeSession(string? token)
    {
        if (string.IsNullOrEmpty(token)) return;
        var hash = Sha256(token);
        lock (_gate)
        {
            if (_sessions.RemoveAll(s => s.TokenHash == hash) > 0)
                SaveSessions();
        }
        _logger.Info("[AUTH] Session revoked");
    }

    // --- brute-force throttle ----------------------------------------------------

    /// <summary>Remaining lockout for this client, or null when attempts are allowed.</summary>
    public TimeSpan? BlockedFor(string clientKey)
    {
        lock (_gate)
        {
            if (_failures.TryGetValue(clientKey, out var f) && f.BlockedUntilUtc > DateTime.UtcNow)
                return f.BlockedUntilUtc - DateTime.UtcNow;
            return null;
        }
    }

    public void RecordFailure(string clientKey)
    {
        lock (_gate)
        {
            if (!_failures.TryGetValue(clientKey, out var f))
                _failures[clientKey] = f = new FailState();
            f.Count++;
            if (f.Count >= FreeAttempts)
            {
                var factor = Math.Min(f.Count - FreeAttempts, 7); // 30s..64min, capped below
                var lockout = TimeSpan.FromTicks(BaseLockout.Ticks << factor);
                if (lockout > MaxLockout) lockout = MaxLockout;
                f.BlockedUntilUtc = DateTime.UtcNow + lockout;
                _logger.Error($"[AUTH] {clientKey} locked out for {lockout.TotalSeconds:F0}s after {f.Count} failures");
            }
        }
    }

    public void RecordSuccess(string clientKey)
    {
        lock (_gate) _failures.Remove(clientKey);
    }

    // --- hashing -----------------------------------------------------------------

    private static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Pbkdf2Iterations, HashAlgorithmName.SHA256, HashBytes);
        return $"pbkdf2-sha256.{Pbkdf2Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    private static bool VerifyAgainstHash(string password, string stored)
    {
        var parts = stored.Split('.');
        if (parts.Length != 4 || parts[0] != "pbkdf2-sha256" || !int.TryParse(parts[1], out var iters))
            return false;
        try
        {
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iters, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static string Sha256(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    // --- persistence ---------------------------------------------------------------

    private void LoadOrSeed(AppConfig config)
    {
        try
        {
            if (File.Exists(_authPath))
            {
                var loaded = JsonSerializer.Deserialize<AuthFile>(File.ReadAllText(_authPath));
                if (!string.IsNullOrEmpty(loaded?.PasswordHash))
                {
                    _passwordHash = loaded.PasswordHash;
                    _logger.Info($"[AUTH] Loaded password hash from {_authPath}");
                    return;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTH] Failed to load {_authPath}: {ex.Message}");
        }

        // First run: seed from the legacy config password so existing setups work.
        _passwordHash = HashPassword(config.AuthPassword);
        SaveAuth();
        _logger.Info($"[AUTH] Seeded {_authPath} from AppConfig.AuthPassword");
    }

    private void SaveAuth()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_authPath)!);
            File.WriteAllText(_authPath, JsonSerializer.Serialize(new AuthFile { PasswordHash = _passwordHash }, JsonOpts));
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTH] Failed to persist {_authPath}: {ex.Message}");
        }
    }

    private void LoadSessions()
    {
        try
        {
            if (!File.Exists(_sessionsPath)) return;
            _sessions = JsonSerializer.Deserialize<List<SessionRecord>>(File.ReadAllText(_sessionsPath)) ?? new();
            Prune();
            _logger.Info($"[AUTH] Loaded {_sessions.Count} session(s)");
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTH] Failed to load {_sessionsPath}: {ex.Message}");
        }
    }

    private void Prune()
    {
        // Caller holds _gate (or runs during single-threaded startup).
        var cutoff = DateTime.UtcNow - SessionLifetime;
        _sessions.RemoveAll(s => s.LastSeenUtc < cutoff);
    }

    private void SaveSessions()
    {
        // Caller holds _gate.
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_sessionsPath)!);
            File.WriteAllText(_sessionsPath, JsonSerializer.Serialize(_sessions, JsonOpts));
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTH] Failed to persist {_sessionsPath}: {ex.Message}");
        }
    }
}
