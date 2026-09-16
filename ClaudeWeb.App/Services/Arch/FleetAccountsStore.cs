using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The fleet's Claude plan usage BY ACCOUNT (openspec fleet-accounts-subtab): the same
/// per-machine overview records the Fleet Status Overview shows, re-keyed by the Claude
/// account each machine is signed in with, with a LAST-SEEN snapshot per account that
/// outlives the account no longer being used anywhere. Fed from the hub's own fleet
/// status build (one poll, one source of truth — nothing is probed here); persisted in
/// <c>fleet-accounts.json</c> under the data dir so a plan that stops being used keeps
/// rendering with the state it was last seen in, marked with when.
/// </summary>
public sealed class FleetAccountsStore
{
    /// <summary>One account as last observed: its plan and usage at the freshest capture
    /// among the machines using it, and which machines those were.</summary>
    public sealed record AccountSeen(
        [property: JsonPropertyName("key")] string Key,
        [property: JsonPropertyName("account")] string Account,
        [property: JsonPropertyName("plan")] string? Plan,
        [property: JsonPropertyName("usage")] OverviewUsage? Usage,
        [property: JsonPropertyName("capturedAt")] long? CapturedAt,
        [property: JsonPropertyName("lastSeenAt")] long LastSeenAt,
        [property: JsonPropertyName("machines")] List<string> Machines);

    /// <summary>A machine's contribution to one pass: its label and its overview (null when
    /// unreachable or on an older build — such a machine contributes nothing).</summary>
    public sealed record Observed(string Machine, FleetOverview? Overview);

    private readonly string _path;
    private readonly Logger _logger;
    private readonly object _gate = new();
    private Dictionary<string, AccountSeen> _seen = new(StringComparer.Ordinal);
    private string _lastSaved = "";

    public FleetAccountsStore(Logger logger, string? dir = null)
    {
        _logger = logger;
        _path = Path.Combine(dir ?? AppPaths.DataDir, "fleet-accounts.json");
        Load();
    }

    /// <summary>The account key: the account string, trimmed and case-folded.</summary>
    public static string KeyOf(string account) => account.Trim().ToLowerInvariant();

    /// <summary>The pure merge: every account seen in this pass is refreshed (plan, usage from
    /// the freshest capture among its machines, the machines using it, lastSeenAt = now);
    /// every account NOT seen keeps its previous record untouched. Only signed-in machines
    /// with an account name count.</summary>
    public static Dictionary<string, AccountSeen> Merge(IReadOnlyDictionary<string, AccountSeen> previous, IEnumerable<Observed> observed, long now)
    {
        var next = new Dictionary<string, AccountSeen>(previous, StringComparer.Ordinal);
        var byKey = new Dictionary<string, (string Account, string? Plan, OverviewUsage? Usage, long? CapturedAt, List<string> Machines)>(StringComparer.Ordinal);
        foreach (var o in observed)
        {
            var c = o.Overview?.Claude;
            if (c is null || !c.Authenticated || string.IsNullOrWhiteSpace(c.Account)) continue;
            var key = KeyOf(c.Account);
            var captured = o.Overview!.CapturedAt;
            if (!byKey.TryGetValue(key, out var cur))
            {
                byKey[key] = (c.Account.Trim(), c.Plan, c.Usage, captured, new List<string> { o.Machine });
                continue;
            }
            cur.Machines.Add(o.Machine);
            // The freshest usage wins: by the usage's own fetchedAt, else by the capture time.
            if (Fresher(c.Usage, captured, cur.Usage, cur.CapturedAt))
                cur = (cur.Account, c.Plan ?? cur.Plan, c.Usage, captured, cur.Machines);
            else if (cur.Plan is null && c.Plan is not null) cur = (cur.Account, c.Plan, cur.Usage, cur.CapturedAt, cur.Machines);
            byKey[key] = cur;
        }
        foreach (var (key, v) in byKey)
            next[key] = new AccountSeen(key, v.Account, v.Plan, v.Usage, v.CapturedAt, now, v.Machines.Distinct(StringComparer.Ordinal).ToList());
        return next;
    }

    private static bool Fresher(OverviewUsage? a, long? aCaptured, OverviewUsage? b, long? bCaptured)
    {
        if (a is null) return false;
        if (b is null) return true;
        var ta = Stamp(a.FetchedAt) ?? aCaptured ?? 0;
        var tb = Stamp(b.FetchedAt) ?? bCaptured ?? 0;
        return ta > tb;
    }

    private static long? Stamp(string? iso) =>
        DateTimeOffset.TryParse(iso, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AssumeUniversal, out var t)
            ? t.ToUnixTimeMilliseconds() : null;

    /// <summary>Record one fleet-status pass and return every account ever seen, live ones
    /// first (by most recent), then the rest by last seen. Saves only when something changed.</summary>
    public IReadOnlyList<AccountSeen> Record(IEnumerable<Observed> observed, long now)
    {
        lock (_gate)
        {
            _seen = Merge(_seen, observed, now);
            Save();
            return All();
        }
    }

    public IReadOnlyList<AccountSeen> All()
    {
        lock (_gate) return _seen.Values.OrderByDescending(a => a.LastSeenAt).ThenBy(a => a.Account, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var list = JsonSerializer.Deserialize<List<AccountSeen>>(File.ReadAllText(_path)) ?? new();
            _seen = list.Where(a => !string.IsNullOrWhiteSpace(a.Key)).ToDictionary(a => a.Key, a => a, StringComparer.Ordinal);
            _lastSaved = JsonSerializer.Serialize(_seen.Values.OrderBy(a => a.Key, StringComparer.Ordinal).ToList());
        }
        catch (Exception ex) { _logger.Error($"[FLEET-ACCOUNTS] failed to load {_path}: {ex.Message}"); }
    }

    private void Save()
    {
        try
        {
            var json = JsonSerializer.Serialize(_seen.Values.OrderBy(a => a.Key, StringComparer.Ordinal).ToList());
            if (json == _lastSaved) return;
            File.WriteAllText(_path, json);
            _lastSaved = json;
        }
        catch (Exception ex) { _logger.Error($"[FLEET-ACCOUNTS] failed to save {_path}: {ex.Message}"); }
    }
}
