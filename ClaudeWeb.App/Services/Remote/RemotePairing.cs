using System.Security.Cryptography;
using System.Text;

namespace ClaudeWeb.Services.Remote;

/// <summary>
/// The pairing PIN (openspec sofa-mode, design D5 as decided: "a pairing PIN, absolutely").
/// The big screen — a logged-in harness tab — asks for a PIN; the harness shows it large for
/// five minutes; the phone types it once at /remote and receives the SAME session cookie a
/// password login mints. One PIN at a time (a new one replaces the old), single use,
/// constant-time compare. Failures are counted by the caller against the same per-IP throttle
/// as failed logins (<see cref="Auth.AuthService.RecordFailure"/>), so guessing a 6-digit PIN
/// costs 5 tries per lockout — the PIN itself expires long before that matters.
/// </summary>
public class RemotePairing
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    private readonly object _lock = new();
    private readonly Func<DateTime> _now;
    private string? _pin;
    private DateTime _expiresUtc;

    public RemotePairing() : this(() => DateTime.UtcNow) { }

    internal RemotePairing(Func<DateTime> now) { _now = now; }

    /// <summary>Mint a new 6-digit PIN, replacing any current one.</summary>
    public (string Pin, DateTime ExpiresUtc) NewPin()
    {
        lock (_lock)
        {
            _pin = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
            _expiresUtc = _now() + Lifetime;
            return (_pin, _expiresUtc);
        }
    }

    /// <summary>True while a PIN is outstanding and not yet expired.</summary>
    public bool HasActivePin
    {
        get { lock (_lock) return _pin is not null && _now() < _expiresUtc; }
    }

    /// <summary>Redeem the current PIN: true exactly once for the right digits before expiry.
    /// A wrong attempt leaves the PIN in place (the caller throttles); an expired PIN is cleared.</summary>
    public bool Redeem(string? pin)
    {
        var digits = new string((pin ?? "").Where(char.IsDigit).ToArray());
        lock (_lock)
        {
            if (_pin is null) return false;
            if (_now() >= _expiresUtc) { _pin = null; return false; }
            var ok = digits.Length == _pin.Length &&
                     CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(digits), Encoding.ASCII.GetBytes(_pin));
            if (ok) _pin = null; // single use
            return ok;
        }
    }
}
