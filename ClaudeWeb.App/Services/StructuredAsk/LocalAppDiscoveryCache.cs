using System.Text.Json;
using ClaudeWeb.Services;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// Durable per-repository cache of local-app discoveries (openspec changes
/// cache-discovered-local-apps + discover-apps-panel). Discovery is an expensive
/// agent scan, and <see cref="LocalAppDiscoveryJobs"/> keeps only an in-memory,
/// latest-only job that a harness restart drops — so every dock re-runs the agent.
/// This service write-throughs a completed discovery to disk so it survives a
/// restart and can be reused via the panel's "Load cache" action without paying for
/// another scan.
///
/// Save is a UNION-BY-PORT merge, not an overwrite (discover-apps-panel, D3): the
/// agent routinely misses apps on a given run, so a later partial scan must refresh
/// the ports it did find while keeping the ones it missed. Removal is therefore
/// explicit-only, via <see cref="Delete"/> — never a side effect of a scan. Each
/// cached finding carries its own discovery time in <see
/// cref="CachedDiscovery.DiscoveredAtByPort"/> (a sidecar map, NOT a property on
/// <see cref="LocalAppFinding"/> — OutputFormatRenderer reflects every public
/// property of the report into the agent's prompt skeleton, so the report model
/// must stay exactly the agent's output contract).
///
/// The cache lives in the HARNESS data dir, keyed by repo id — NOT inside the
/// scanned repository — so writing it never dirties the scanned repo's git tree and
/// the read-only-scan guarantee is preserved (see cache-discovered-local-apps, D1).
/// Save and Load are best-effort: a failure is logged and swallowed (Save so a cache
/// write never fails a discovery; Load so a corrupt/absent file reads as "no cache").
/// Delete is NOT best-effort — it is the user's explicit edit, so a failure surfaces.
/// </summary>
public class LocalAppDiscoveryCache
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _dir;

    // `dir` is injectable for tests only; production callers use the data-dir default.
    public LocalAppDiscoveryCache(Logger logger, string? dir = null)
    {
        _logger = logger;
        _dir = dir ?? Path.Combine(AppPaths.DataDir, "local-app-cache");
    }

    /// <summary>
    /// Union-merge a completed scan into the repo's cache and return the merged
    /// record: new-scan findings win their port, cached ports the scan missed are
    /// kept with their original discovery time. The WRITE is best-effort (a cache
    /// problem never fails the discovery), but the merged record is returned
    /// regardless so the caller's in-memory job can hold the union — Run/Check must
    /// resolve against every cached port, not just the latest scan's.
    /// </summary>
    public CachedDiscovery Save(string repoId, LocalAppExposureReport report, DateTimeOffset scanFinishedAt)
    {
        var merged = Merge(Load(repoId), report, scanFinishedAt);
        try
        {
            Directory.CreateDirectory(_dir);
            File.WriteAllText(PathFor(repoId), JsonSerializer.Serialize(merged, JsonOpts));
        }
        catch (Exception ex)
        {
            _logger.Error($"[LOCALAPPCACHE] failed to write cache for repo {repoId}: {ex.Message}");
        }
        return merged;
    }

    /// <summary>The cached discovery for a repo, or null if none exists (or on a read
    /// failure). Per-finding times are normalized on the way out: a pre-union file has
    /// no map, so every finding defaults to the file's scan time.</summary>
    public CachedDiscovery? Load(string repoId)
    {
        try
        {
            var path = PathFor(repoId);
            if (!File.Exists(path)) return null;
            var record = JsonSerializer.Deserialize<CachedDiscovery>(File.ReadAllText(path), JsonOpts);
            if (record is null) return null;
            record.DiscoveredAtByPort ??= new Dictionary<int, DateTimeOffset>();
            foreach (var app in record.Report.Apps)
                if (!record.DiscoveredAtByPort.ContainsKey(app.Port))
                    record.DiscoveredAtByPort[app.Port] = record.CachedAt;
            return record;
        }
        catch (Exception ex)
        {
            _logger.Error($"[LOCALAPPCACHE] failed to read cache for repo {repoId}: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Remove ONE cached finding by port — the explicit cache edit that replaced
    /// scan-side removal (discover-apps-panel, D5/D6). Deleting the last finding
    /// leaves a valid cached-EMPTY file (distinct from "no cache"). Returns the
    /// outcome plus the updated record on success so the caller can return a
    /// snapshot without re-reading the file.
    /// </summary>
    public (CacheDeleteOutcome Outcome, CachedDiscovery? Updated) Delete(string repoId, int port)
    {
        var record = Load(repoId);
        if (record is null) return (CacheDeleteOutcome.NoCache, null);
        if (!record.Report.Apps.Any(a => a.Port == port)) return (CacheDeleteOutcome.NotFound, null);

        record.Report.Apps = record.Report.Apps.Where(a => a.Port != port).ToList();
        record.DiscoveredAtByPort!.Remove(port);
        File.WriteAllText(PathFor(repoId), JsonSerializer.Serialize(record, JsonOpts));
        return (CacheDeleteOutcome.Deleted, record);
    }

    // The union itself. First occurrence wins within one scan (duplicate ports in a
    // single report would be an agent mistake; we keep the list stable). New-scan
    // findings come first in the merged list, retained older ones after.
    private static CachedDiscovery Merge(CachedDiscovery? existing, LocalAppExposureReport report, DateTimeOffset scanFinishedAt)
    {
        var apps = new List<LocalAppFinding>();
        var times = new Dictionary<int, DateTimeOffset>();
        foreach (var app in report.Apps)
        {
            if (times.ContainsKey(app.Port)) continue;
            apps.Add(app);
            times[app.Port] = scanFinishedAt;
        }
        if (existing is not null)
        {
            foreach (var app in existing.Report.Apps)
            {
                if (times.ContainsKey(app.Port)) continue;
                apps.Add(app);
                times[app.Port] = existing.DiscoveredAtByPort!.TryGetValue(app.Port, out var t) ? t : existing.CachedAt;
            }
        }
        return new CachedDiscovery
        {
            Report = new LocalAppExposureReport { Apps = apps },
            CachedAt = scanFinishedAt,
            DiscoveredAtByPort = times,
        };
    }

    private string PathFor(string repoId) => Path.Combine(_dir, Sanitize(repoId) + ".json");

    // Repo ids are used as file names; neutralise any path-hostile characters so
    // the key can never escape the cache dir or collide with a directory separator.
    private static string Sanitize(string repoId)
    {
        var invalid = Path.GetInvalidFileNameChars();
        return new string(repoId.Select(c => Array.IndexOf(invalid, c) >= 0 ? '_' : c).ToArray());
    }
}

public enum CacheDeleteOutcome { Deleted, NoCache, NotFound }

/// <summary>One repo's cached discovery: the union-merged report, the latest
/// successful scan time, and each finding's own last-discovered time keyed by port
/// (absent in pre-union files; <see cref="LocalAppDiscoveryCache.Load"/> defaults
/// missing entries to <see cref="CachedAt"/>).</summary>
public class CachedDiscovery
{
    public LocalAppExposureReport Report { get; set; } = new();
    public DateTimeOffset CachedAt { get; set; }
    public Dictionary<int, DateTimeOffset>? DiscoveredAtByPort { get; set; }
}
