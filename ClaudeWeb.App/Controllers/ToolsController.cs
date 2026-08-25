using System.Diagnostics;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Tools;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Per-repo MCP tool registry endpoints (openspec add-dock-tools-lane), consumed
/// by the agent dock's Tools lane. Auto-discovered; auth is global.
///
///   GET /api/tools?repoId=              -- masked config + host settings + server check
///   PUT /api/tools/birokrat?repoId=     -- save the repo's Birokrat config
///   PUT /api/tools/host                 -- save the host-level server entry path
///   GET /api/tools/birokrat/check       -- server entry + node availability probe
///   GET /api/tools/birokrat/preflight   -- full readiness check of the SAVED config
///                                          (enabled, key, node runs, server entry
///                                          resolved as a sibling checkout, live
///                                          authenticated API probe)
///
/// The dock passes its OWN repoId explicitly (dock-scoped, not global-selection
/// scoped — see the agent-dock delta spec); a missing repoId falls back to the
/// resolver's current repo so plain tooling still works.
///
/// Masking contract (repo-mcp-tools spec): reads never return a stored key, only
/// "set" + a last-4 hint; a PUT with a null key keeps the stored one, an empty
/// string clears it. Same per-entry semantics inside the company list.
/// </summary>
[ApiController]
[Route("api/tools")]
public class ToolsController : ControllerBase
{
    private readonly ToolsConfigStore _store;
    private readonly RepositoryRegistry _registry;
    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public ToolsController(ToolsConfigStore store, RepositoryRegistry registry, RepositoryResolver repos, Logger logger)
    {
        _store = store;
        _registry = registry;
        _repos = repos;
        _logger = logger;
    }

    public record CompanyDto(string Name, string? ApiKey, string? Url);
    public record BirokratPutRequest(bool Enabled, string? ApiKey, string? ApiUrl, List<CompanyDto>? Companies);
    public record HostPutRequest(string? BirokratServerEntry);

    [HttpGet]
    public IActionResult Get([FromQuery] string? repoId)
    {
        _logger.CountRequest();
        var id = ResolveRepoId(repoId);
        if (id is null) return BadRequest(new { error = "No repository selected or configured." });
        return Ok(BuildView(id));
    }

    [HttpPut("birokrat")]
    public IActionResult PutBirokrat([FromQuery] string? repoId, [FromBody] BirokratPutRequest? request)
    {
        _logger.CountRequest();
        if (request is null) return BadRequest(new { error = "body is required" });
        var id = ResolveRepoId(repoId);
        if (id is null) return BadRequest(new { error = "No repository selected or configured." });

        var companies = request.Companies?
            .Select(c => new BirokratCompany { Name = c.Name ?? "", ApiKey = c.ApiKey ?? "", Url = c.Url })
            .ToList();
        _store.SetBirokrat(id, request.Enabled, request.ApiKey, request.ApiUrl, companies);
        return Ok(BuildView(id));
    }

    [HttpPut("host")]
    public IActionResult PutHost([FromQuery] string? repoId, [FromBody] HostPutRequest? request)
    {
        _logger.CountRequest();
        if (request is null) return BadRequest(new { error = "body is required" });
        _store.SetHost(request.BirokratServerEntry);
        var id = ResolveRepoId(repoId);
        return id is null ? Ok(new { host = HostView() }) : Ok(BuildView(id));
    }

    /// <summary>The explicit enable-time probe (repo-mcp-tools spec: a missing
    /// server entry surfaces an error naming the path, and runs get no broken
    /// MCP config — BuildMcpConfigJson independently refuses on the same check).</summary>
    [HttpGet("birokrat/check")]
    public IActionResult Check()
    {
        _logger.CountRequest();
        return Ok(HostView());
    }

    /// <summary>Shared by the API-probe check. 15 s, not a snappier value: a cold
    /// Birokrat service was measured taking &gt;6 s on its first answer after idle,
    /// then ~2 s — a short timeout would false-fail exactly the machines preflight
    /// is meant to validate.</summary>
    private static readonly HttpClient ProbeHttp = new() { Timeout = TimeSpan.FromSeconds(15) };

    public record PreflightCheck(string Id, bool Ok, bool Skipped, string Detail);

    /// <summary>
    /// Preflight (repo-mcp-tools spec): verifies every condition a chat run needs
    /// for the Birokrat tool to actually work ON THIS MACHINE, against the SAVED
    /// config. Five checks: enabled, key stored, node runs, server entry resolved
    /// (sibling-checkout assumption) and present, and the Birokrat API answering
    /// an authenticated request with the effective key/URL.
    /// </summary>
    [HttpGet("birokrat/preflight")]
    public async Task<IActionResult> Preflight([FromQuery] string? repoId)
    {
        _logger.CountRequest();
        var id = ResolveRepoId(repoId);
        if (id is null) return BadRequest(new { error = "No repository selected or configured." });

        var cfg = _store.GetBirokrat(id);
        var env = ToolsConfigStore.BuildEnv(cfg);
        var key = env["BIROKRAT_API_KEY"];
        var url = env["BIROKRAT_API_URL"];
        var checks = new List<PreflightCheck>
        {
            new("enabled", cfg.Enabled, false,
                cfg.Enabled ? "" : "the tool is disabled — enable it and save"),
            new("apiKey", !string.IsNullOrEmpty(key), false,
                string.IsNullOrEmpty(key) ? "no API key stored for this repo"
                                          : $"stored ({ToolsConfigStore.KeyHint(key)})"),
            ProbeNode(),
            ProbeServerEntry(),
        };
        checks.Add(await ProbeApi(key, url));

        var ready = checks.All(c => c.Ok);
        _logger.Info($"[TOOLS] Preflight for repo {id}: {(ready ? "ready" : "NOT ready — " + string.Join(", ", checks.Where(c => !c.Ok).Select(c => c.Id)))}");
        return Ok(new { repoId = id, ready, checks });
    }

    /// <summary>Runs <c>node --version</c> rather than scanning PATH — proves the
    /// runtime actually starts under the harness's environment.</summary>
    private static PreflightCheck ProbeNode()
    {
        try
        {
            var psi = new ProcessStartInfo("node", "--version")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using var p = Process.Start(psi);
            if (p is null) return new("node", false, false, "node could not be started");
            if (!p.WaitForExit(4000))
            {
                try { p.Kill(entireProcessTree: true); } catch { /* already gone */ }
                return new("node", false, false, "node --version did not answer within 4 s");
            }
            var version = p.StandardOutput.ReadToEnd().Trim();
            return p.ExitCode == 0 && version.Length > 0
                ? new("node", true, false, version)
                : new("node", false, false, $"node --version exited with code {p.ExitCode}");
        }
        catch (Exception ex)
        {
            return new("node", false, false, $"node is not on the harness's PATH ({ex.Message})");
        }
    }

    private PreflightCheck ProbeServerEntry()
    {
        var entry = _store.ResolveServerEntry(RepoPaths());
        if (!string.IsNullOrEmpty(entry) && System.IO.File.Exists(entry))
            return new("serverEntry", true, false, entry);

        var siblings = RepoPaths()
            .Select(p => { try { return Path.GetDirectoryName(Path.GetFullPath(p)); } catch { return null; } })
            .Where(p => !string.IsNullOrEmpty(p))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(p => Path.Combine(p!, "birokrat-ai-platform"));
        return new("serverEntry", false, false,
            !string.IsNullOrEmpty(entry)
                ? $"configured script missing on disk: {entry}"
                : "birokrat-ai-platform checkout (built mcp-server/app/dist/index.js) not found as a sibling of any registered repo — expected at "
                  + string.Join(" or ", siblings));
    }

    /// <summary>Authenticated GET against the cheap <c>sifrant/pagelen</c> endpoint —
    /// the same header (<c>X-API-KEY</c>) and slash normalization the MCP server uses,
    /// so a green check means real tool calls will authenticate too.</summary>
    private static async Task<PreflightCheck> ProbeApi(string key, string url)
    {
        if (string.IsNullOrEmpty(key))
            return new("api", false, true, "skipped — no API key to probe with");
        var probeUrl = url.TrimEnd('/') + "/sifrant/pagelen";
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, probeUrl);
            req.Headers.TryAddWithoutValidation("X-API-KEY", key);
            using var res = await ProbeHttp.SendAsync(req);
            var code = (int)res.StatusCode;
            return res.IsSuccessStatusCode
                ? new("api", true, false, $"HTTP {code} from {probeUrl}")
                : new("api", false, false,
                    $"HTTP {code} from {probeUrl}" + (code is 401 or 403 ? " — key rejected" : ""));
        }
        catch (Exception ex)
        {
            return new("api", false, false, $"unreachable: {probeUrl} ({(ex.InnerException ?? ex).Message})");
        }
    }

    // --- helpers -------------------------------------------------------------

    private string? ResolveRepoId(string? repoId)
    {
        if (!string.IsNullOrWhiteSpace(repoId)) return repoId;
        return _repos.Current()?.Id;
    }

    private IEnumerable<string> RepoPaths() => _registry.GetAll().Select(r => r.Path);

    private object HostView()
    {
        var host = _store.GetHost();
        var effective = _store.ResolveServerEntry(RepoPaths());
        return new
        {
            birokratServerEntry = host.BirokratServerEntry,
            effectiveServerEntry = effective,
            serverEntryExists = !string.IsNullOrEmpty(effective) && System.IO.File.Exists(effective),
            nodeAvailable = NodeOnPath(),
        };
    }

    private object BuildView(string repoId)
    {
        var cfg = _store.GetBirokrat(repoId);
        return new
        {
            repoId,
            birokrat = new
            {
                enabled = cfg.Enabled,
                apiKeySet = !string.IsNullOrEmpty(cfg.ApiKey),
                apiKeyHint = ToolsConfigStore.KeyHint(cfg.ApiKey),
                apiUrl = cfg.ApiUrl,
                companies = cfg.Companies.Select(c => new
                {
                    name = c.Name,
                    apiKeySet = !string.IsNullOrEmpty(c.ApiKey),
                    apiKeyHint = ToolsConfigStore.KeyHint(c.ApiKey),
                    url = c.Url,
                }),
            },
            host = HostView(),
        };
    }

    private static bool NodeOnPath()
    {
        var path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                if (System.IO.File.Exists(Path.Combine(dir.Trim(), "node.exe"))
                    || System.IO.File.Exists(Path.Combine(dir.Trim(), "node")))
                    return true;
            }
            catch { /* malformed PATH segment */ }
        }
        return false;
    }
}
