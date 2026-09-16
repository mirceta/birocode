using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.TaskGraph;
using ClaudeWeb.Services.Tasks;
using ClaudeWeb.Services.Tools;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Agents;

/// <summary>
/// Wires the repo-agent tool server into every repo agent's turn (openspec
/// cross-repo-effort-legs): the per-process bearer token, and the <c>claude-web</c> entry
/// the per-repo MCP config carries — registered on <see cref="ToolsConfigStore"/> at startup
/// (a hosted service, so it exists before the first turn) and therefore present on every
/// path that builds a repo agent's config: the chat, the loops, the arch's sends. The URL
/// names the repo, which is how a tool call knows whom it speaks for.
/// </summary>
public sealed class RepoAgentToolsService : IHostedService
{
    private readonly McpBearer _bearer = new();
    private readonly AppConfig _appConfig;
    private readonly Logger _logger;

    public RepoAgentToolbox Toolbox { get; }

    public RepoAgentToolsService(ToolsConfigStore tools, AppConfig appConfig, TaskGraphService graph, RepositoryRegistry repos, Logger logger)
    {
        _appConfig = appConfig;
        _logger = logger;
        Toolbox = new RepoAgentToolbox(graph, (src, repoId) =>
        {
            if (src is not null) return $"{src[..Math.Min(8, src.Length)]}/{repoId}";
            var r = repos.GetAll().FirstOrDefault(x => x.Id == repoId);
            return r is null ? repoId : (string.IsNullOrWhiteSpace(r.Handle) ? r.Name : r.Handle);
        });
        tools.HarnessServers = ServersFor;
    }

    public bool ValidateMcpToken(string? supplied) => _bearer.Validate(supplied);

    /// <summary>The <c>mcpServers</c> entry every repo agent's turn carries.</summary>
    public IReadOnlyDictionary<string, object> ServersFor(string repoId) => new Dictionary<string, object>
    {
        [RepoAgentMcpServer.ServerName] = new Dictionary<string, object>
        {
            ["type"] = "http",
            ["url"] = $"http://127.0.0.1:{_appConfig.Port}/api/agents/mcp?repo={Uri.EscapeDataString(repoId)}",
            ["headers"] = new Dictionary<string, string> { ["Authorization"] = $"Bearer {_bearer.Token}" },
        },
    };

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.Info("[AGENT-TOOLS] repo-agent tool server ready: my_effort, report_leg at POST /api/agents/mcp");
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
