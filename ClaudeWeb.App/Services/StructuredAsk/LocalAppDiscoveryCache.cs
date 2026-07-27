using System.Text.Json;
using ClaudeWeb.Services;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// Durable per-repository cache of the most recent SUCCESSFUL local-app discovery
/// (openspec change cache-discovered-local-apps). Discovery is an expensive agent
/// scan, and <see cref="LocalAppDiscoveryJobs"/> keeps only an in-memory,
/// latest-only job that a harness restart drops — so every dock re-runs the agent.
/// This service write-throughs a completed discovery to disk so it survives a
/// restart and can be reused via the dock's "Load cache" action without paying for
/// another scan.
///
/// The cache lives in the HARNESS data dir, keyed by repo id — NOT inside the
/// scanned repository — so writing it never dirties the scanned repo's git tree and
/// the read-only-scan guarantee is preserved (see the change's design.md, D1). Both
/// Save and Load are best-effort: a failure is logged and swallowed (Save so a cache
/// write never fails a discovery; Load so a corrupt/absent file reads as "no cache").
/// </summary>
public class LocalAppDiscoveryCache
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _dir;

    public LocalAppDiscoveryCache(Logger logger)
    {
        _logger = logger;
        _dir = Path.Combine(AppPaths.DataDir, "local-app-cache");
    }

    /// <summary>
    /// Write-through the report + finish time for a repo, overwriting any prior
    /// cache. Best-effort: any failure is logged and swallowed so a cache-write
    /// problem never fails the discovery that produced the result.
    /// </summary>
    public void Save(string repoId, LocalAppExposureReport report, DateTimeOffset cachedAt)
    {
        try
        {
            Directory.CreateDirectory(_dir);
            var record = new CachedDiscovery { Report = report, CachedAt = cachedAt };
            File.WriteAllText(PathFor(repoId), JsonSerializer.Serialize(record, JsonOpts));
        }
        catch (Exception ex)
        {
            _logger.Error($"[LOCALAPPCACHE] failed to write cache for repo {repoId}: {ex.Message}");
        }
    }

    /// <summary>The cached discovery for a repo, or null if none exists (or on a read failure).</summary>
    public CachedDiscovery? Load(string repoId)
    {
        try
        {
            var path = PathFor(repoId);
            if (!File.Exists(path)) return null;
            return JsonSerializer.Deserialize<CachedDiscovery>(File.ReadAllText(path), JsonOpts);
        }
        catch (Exception ex)
        {
            _logger.Error($"[LOCALAPPCACHE] failed to read cache for repo {repoId}: {ex.Message}");
            return null;
        }
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

/// <summary>One repo's cached discovery: the typed report plus when it was cached.</summary>
public class CachedDiscovery
{
    public LocalAppExposureReport Report { get; set; } = new();
    public DateTimeOffset CachedAt { get; set; }
}
