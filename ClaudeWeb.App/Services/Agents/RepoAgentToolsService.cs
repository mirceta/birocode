using ClaudeWeb.Models;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Dock;
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

    public RepoAgentToolsService(ToolsConfigStore tools, AppConfig appConfig, TaskGraphService graph, RepositoryRegistry repos, Logger logger,
        DockRegistry? dock = null, RunSessionService? runs = null, LoopConfigStore? loops = null, AutopilotConfigStore? autopilot = null,
        LoopRecipeStore? recipes = null, AutopilotGate? gate = null, AutopilotAuditLog? audit = null,
        HubFs.HubFileStore? hubFiles = null, Events.CollectorService? collector = null)
    {
        _appConfig = appConfig;
        _logger = logger;
        Toolbox = new RepoAgentToolbox(graph, (src, repoId) =>
        {
            if (src is not null) return $"{src[..Math.Min(8, src.Length)]}/{repoId}";
            var r = repos.GetAll().FirstOrDefault(x => x.Id == repoId);
            return r is null ? repoId : (string.IsNullOrWhiteSpace(r.Handle) ? r.Name : r.Handle);
        });
        // The self-service tools' environment (openspec repo-agent-harness-tools): the harness's own
        // docs (the self repo's checkout, the embedded copy as fallback), the dock stash, the loop
        // armer shared with the arch, the Operator's gate, the audit log.
        var sessions = new SessionService(logger);
        Toolbox.Environment = new RepoAgentEnvironment
        {
            Repo = id => repos.GetAll().FirstOrDefault(r => r.Id == id) is { } r ? new RepoFacts(r.Id, r.Name, r.Path, r.Handle) : null,
            Knowledge = new HarnessKnowledge(() => repos.GetAll().FirstOrDefault(r => r.IsSelf)?.Path),
            Dock = dock,
            RunningSession = id => runs?.Get(id)?.SessionId,
            NewestSession = path => { try { return sessions.ListSessions(path).FirstOrDefault()?.Id; } catch { return null; } },
            Armer = loops is null || dock is null ? null : new LoopArmer(loops, () => autopilot?.Get().AutoAdvance ?? false, dock.GetStash,
                repoId => LoopArmer.ResolveQueueTab(dock, repoId),
                q => recipes is null ? null : (recipes.Get(q.Trim()) ?? recipes.List().FirstOrDefault(r => string.Equals(r.Name, q.Trim(), StringComparison.OrdinalIgnoreCase)))),
            Loops = loops,
            GateOpen = () => gate?.Enabled ?? false,
            Audit = (tool, repoId, repoName, outcome) => audit?.Record(new AutopilotAuditLog.Entry(
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), repoId, repoName, "", 1.0, outcome, "tool", false, 0, "agent", tool)),
            Machine = collector?.SelfLabel ?? System.Environment.MachineName,
            HubFiles = hubFiles,
        };
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
        _logger.Info("[AGENT-TOOLS] repo-agent tool server ready: my_effort, report_leg, harness_help, stash_prompt, arm_my_loop, hub_upload, hub_download, hub_files at POST /api/agents/mcp");
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
