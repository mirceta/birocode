using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Tools;

/// <summary>One named company in the Birokrat multi-company map: an API key plus
/// an optional per-company base URL (openspec add-dock-tools-lane).</summary>
public class BirokratCompany
{
    public string Name { get; set; } = "";
    public string ApiKey { get; set; } = "";
    /// <summary>Optional; falls back to the tool's default <see cref="BirokratToolConfig.ApiUrl"/>.</summary>
    public string? Url { get; set; }
}

/// <summary>
/// Per-repo configuration of the Birokrat MCP tool (openspec add-dock-tools-lane).
/// Secrets live ONLY here (host-side app-data), never in the repo working tree —
/// the sibling platform repo committed a live key in a repo-level .mcp.json once,
/// and this store exists so that cannot happen again.
/// </summary>
public class BirokratToolConfig
{
    public bool Enabled { get; set; }
    public string ApiKey { get; set; } = "";
    public string ApiUrl { get; set; } = ToolsConfigStore.DefaultApiUrl;
    public List<BirokratCompany> Companies { get; set; } = new();
}

/// <summary>Host-level tool settings: one value for the whole host, since the MCP
/// server checkout lives outside the opened repositories.</summary>
public class ToolsHostConfig
{
    public string BirokratServerEntry { get; set; } = "";
}

/// <summary>
/// Per-repo MCP tool registry (openspec add-dock-tools-lane), Birokrat first.
/// Persisted to <c>%APPDATA%\ClaudeWeb\tools.json</c>, same pattern as
/// <see cref="Dock.DockRegistry"/>/dock.json. Thread-safe: all access takes a
/// lock and hands back copies (singleton touched by Kestrel threads).
///
/// Also owns the MCP-config assembly: <see cref="BuildMcpConfigJson"/> produces
/// the exact <c>{"mcpServers":{"birokrat":{...}}}</c> shape the reference
/// integration proves out (birokrat-ai-platform api-chatbot server.js:788-824 →
/// ClaudeMonitor's --mcp-config temp file), with env assembly mirrored
/// byte-for-byte: single-key mode sets BIROKRAT_API_KEY + BIROKRAT_API_URL; a
/// non-empty company list additionally sets BIROKRAT_API_KEYS (JSON map) with
/// the first entry doubling as the default key/URL.
/// </summary>
public class ToolsConfigStore
{
    public const string DefaultApiUrl = "https://next.birokrat.si/api/v2/";

    private readonly Logger _logger;
    private readonly string _storePath;
    private readonly object _gate = new();
    private ToolsFile _file = new();

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    /// <summary><paramref name="dataDir"/> overrides the store location (tests).</summary>
    public ToolsConfigStore(Logger logger, string? dataDir = null)
    {
        _logger = logger;
        _storePath = Path.Combine(dataDir ?? AppPaths.DataDir, "tools.json");
        Load();
    }

    /// <summary>The repo's Birokrat config (a copy; defaults when never configured).</summary>
    public BirokratToolConfig GetBirokrat(string repoId)
    {
        lock (_gate)
        {
            return _file.Repos.TryGetValue(repoId, out var repo) && repo.Birokrat != null
                ? Clone(repo.Birokrat)
                : new BirokratToolConfig();
        }
    }

    /// <summary>
    /// Updates the repo's Birokrat config. Secret semantics (the masking contract):
    /// <paramref name="apiKey"/> null keeps the stored key, empty string clears it,
    /// anything else replaces it. Each company entry with a null/empty ApiKey keeps
    /// the stored key of the same-named company; companies absent from the list are
    /// removed. Returns the updated copy.
    /// </summary>
    public BirokratToolConfig SetBirokrat(string repoId, bool enabled, string? apiKey,
        string? apiUrl, List<BirokratCompany>? companies)
    {
        lock (_gate)
        {
            if (!_file.Repos.TryGetValue(repoId, out var repo))
                _file.Repos[repoId] = repo = new RepoTools();
            var cfg = repo.Birokrat ??= new BirokratToolConfig();

            cfg.Enabled = enabled;
            if (apiKey != null) cfg.ApiKey = apiKey;
            cfg.ApiUrl = string.IsNullOrWhiteSpace(apiUrl) ? DefaultApiUrl : apiUrl.Trim();

            var stored = cfg.Companies;
            cfg.Companies = (companies ?? new()).Where(c => !string.IsNullOrWhiteSpace(c.Name))
                .Select(c => new BirokratCompany
                {
                    Name = c.Name.Trim(),
                    // Null/empty incoming key = keep the same-named stored company's key.
                    ApiKey = string.IsNullOrEmpty(c.ApiKey)
                        ? stored.FirstOrDefault(s => string.Equals(s.Name, c.Name.Trim(), StringComparison.Ordinal))?.ApiKey ?? ""
                        : c.ApiKey,
                    Url = string.IsNullOrWhiteSpace(c.Url) ? null : c.Url.Trim(),
                })
                .ToList();

            Save();
            _logger.Info($"[TOOLS] Birokrat config saved for repo {repoId} (enabled={enabled}, companies={cfg.Companies.Count})");
            return Clone(cfg);
        }
    }

    /// <summary>Host-level settings (a copy).</summary>
    public ToolsHostConfig GetHost()
    {
        lock (_gate) return new ToolsHostConfig { BirokratServerEntry = _file.Host.BirokratServerEntry };
    }

    /// <summary>Sets the host-level Birokrat server entry path (empty = fall back to probe).</summary>
    public ToolsHostConfig SetHost(string? birokratServerEntry)
    {
        lock (_gate)
        {
            _file.Host.BirokratServerEntry = birokratServerEntry?.Trim() ?? "";
            Save();
            _logger.Info($"[TOOLS] Host server entry set to \"{_file.Host.BirokratServerEntry}\"");
            return new ToolsHostConfig { BirokratServerEntry = _file.Host.BirokratServerEntry };
        }
    }

    /// <summary>
    /// The effective server entry script: the operator-set host value, else the
    /// default probe — the sibling birokrat-ai-platform checkout's built
    /// <c>mcp-server/app/dist/index.js</c> (nested repo folder of the same name),
    /// probed relative to each registered repo's parent so it works wherever the
    /// playground lives. Empty string when nothing is found.
    /// </summary>
    public string ResolveServerEntry(IEnumerable<string>? repoPaths = null)
    {
        lock (_gate)
        {
            if (!string.IsNullOrWhiteSpace(_file.Host.BirokratServerEntry))
                return _file.Host.BirokratServerEntry;
        }
        foreach (var root in CandidateRoots(repoPaths))
        {
            var candidate = Path.Combine(root, "birokrat-ai-platform", "birokrat-ai-platform",
                "mcp-server", "app", "dist", "index.js");
            if (File.Exists(candidate)) return candidate;
        }
        return "";
    }

    private static IEnumerable<string> CandidateRoots(IEnumerable<string>? repoPaths)
    {
        foreach (var p in repoPaths ?? Array.Empty<string>())
        {
            string? parent = null;
            try { parent = Path.GetDirectoryName(Path.GetFullPath(p)); } catch { /* bad path */ }
            if (!string.IsNullOrEmpty(parent)) yield return parent;
        }
        // Last-resort well-known location on the operator box.
        yield return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop", "playground");
    }

    /// <summary>
    /// The MCP config JSON to inject into a chat run for this repo, or null when
    /// nothing must be injected: tool disabled/unconfigured, or the server entry
    /// script is missing on disk (spec: never launch runs with a broken MCP
    /// server — the panel's check endpoint surfaces the error instead).
    /// </summary>
    public string? BuildMcpConfigJson(string repoId, IEnumerable<string>? repoPaths = null)
    {
        var cfg = GetBirokrat(repoId);
        if (!cfg.Enabled) return null;

        var entry = ResolveServerEntry(repoPaths);
        if (string.IsNullOrEmpty(entry) || !File.Exists(entry))
        {
            _logger.Error($"[TOOLS] Birokrat enabled for repo {repoId} but server entry \"{entry}\" is missing — run gets no MCP config");
            return null;
        }

        var env = BuildEnv(cfg);
        var config = new Dictionary<string, object>
        {
            ["mcpServers"] = new Dictionary<string, object>
            {
                ["birokrat"] = new Dictionary<string, object>
                {
                    // Forward slashes like the reference chatbot — node accepts both.
                    ["command"] = "node",
                    ["args"] = new[] { entry.Replace('\\', '/') },
                    ["env"] = env,
                },
            },
        };
        return JsonSerializer.Serialize(config);
    }

    /// <summary>Env assembly, mirroring api-chatbot server.js (see class doc).</summary>
    internal static Dictionary<string, string> BuildEnv(BirokratToolConfig cfg)
    {
        var env = new Dictionary<string, string>();
        var named = cfg.Companies.Where(c => !string.IsNullOrWhiteSpace(c.Name) && !string.IsNullOrEmpty(c.ApiKey)).ToList();
        if (named.Count > 0)
        {
            var map = named.ToDictionary(
                c => c.Name,
                c => string.IsNullOrWhiteSpace(c.Url)
                    ? (object)new { apiKey = c.ApiKey }
                    : new { apiKey = c.ApiKey, url = c.Url },
                StringComparer.Ordinal);
            env["BIROKRAT_API_KEYS"] = JsonSerializer.Serialize(map);
            // First named entry doubles as the default key/URL (server.js:788-801).
            env["BIROKRAT_API_KEY"] = named[0].ApiKey;
            env["BIROKRAT_API_URL"] = string.IsNullOrWhiteSpace(named[0].Url) ? cfg.ApiUrl : named[0].Url!;
        }
        else
        {
            env["BIROKRAT_API_KEY"] = cfg.ApiKey;
            env["BIROKRAT_API_URL"] = cfg.ApiUrl;
        }
        return env;
    }

    /// <summary>Masks a secret for read-back: at most the last 4 characters.</summary>
    public static string KeyHint(string key) =>
        string.IsNullOrEmpty(key) ? "" : key.Length <= 4 ? "····" : "····" + key[^4..];

    // --- persistence ---------------------------------------------------------

    private class RepoTools
    {
        public BirokratToolConfig? Birokrat { get; set; }
    }

    private class ToolsFile
    {
        public ToolsHostConfig Host { get; set; } = new();
        public Dictionary<string, RepoTools> Repos { get; set; } = new();
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_storePath)) return;
            var loaded = JsonSerializer.Deserialize<ToolsFile>(File.ReadAllText(_storePath));
            if (loaded != null)
            {
                loaded.Host ??= new ToolsHostConfig();
                loaded.Repos ??= new();
                _file = loaded;
            }
            _logger.Info($"[TOOLS] Loaded tool config for {_file.Repos.Count} repo(s) from {_storePath}");
        }
        catch (Exception ex)
        {
            _logger.Error($"[TOOLS] Failed to load {_storePath}: {ex.Message}");
        }
    }

    private void Save()
    {
        // Caller holds _gate.
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_storePath)!);
            File.WriteAllText(_storePath, JsonSerializer.Serialize(_file, JsonOpts));
        }
        catch (Exception ex)
        {
            _logger.Error($"[TOOLS] Failed to persist {_storePath}: {ex.Message}");
        }
    }

    private static BirokratToolConfig Clone(BirokratToolConfig c) => new()
    {
        Enabled = c.Enabled,
        ApiKey = c.ApiKey,
        ApiUrl = c.ApiUrl,
        Companies = c.Companies.Select(x => new BirokratCompany { Name = x.Name, ApiKey = x.ApiKey, Url = x.Url }).ToList(),
    };
}
