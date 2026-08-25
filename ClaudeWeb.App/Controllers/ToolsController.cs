using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Tools;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Per-repo MCP tool registry endpoints (openspec add-dock-tools-lane), consumed
/// by the agent dock's Tools lane. Auto-discovered; auth is global.
///
///   GET /api/tools?repoId=            -- masked config + host settings + server check
///   PUT /api/tools/birokrat?repoId=   -- save the repo's Birokrat config
///   PUT /api/tools/host               -- save the host-level server entry path
///   GET /api/tools/birokrat/check     -- server entry + node availability probe
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
