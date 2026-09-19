import io, re, sys

def read(p): return io.open(p, encoding='utf-8').read()
def write(p, s): io.open(p, 'w', encoding='utf-8', newline=chr(10)).write(s); print('patched', p)
def rep(s, old, new, p=''):
    assert s.count(old) == 1, (p, old[:70], s.count(old))
    return s.replace(old, new)
def cut(s, start_marker, end_marker, new, p=''):
    i = s.index(start_marker); j = s.index(end_marker, i)
    assert s.count(start_marker) == 1, (p, start_marker[:60])
    return s[:i] + new + s[j:]

# ---- csproj: embed the docs as the fallback knowledge ------------------------------------
p = 'ClaudeWeb.App/ClaudeWeb.App.csproj'; s = read(p)
s = rep(s, '    <EmbeddedResource Include="Deploy\\templates\\*.tmpl" />\n  </ItemGroup>',
'''    <EmbeddedResource Include="Deploy\\templates\\*.tmpl" />
    <!-- The harness's own convention docs, embedded as the FALLBACK knowledge of the repo agents'
         harness_help tool (openspec repo-agent-harness-tools): the live docs/ folder of the self
         checkout is read first; this copy answers only where that checkout is not on disk. -->
    <EmbeddedResource Include="..\\docs\\*.md" LogicalName="docs.%(Filename)%(Extension)" />
  </ItemGroup>''', p)
write(p, s)

# ---- LoopConfigStore: who armed it ------------------------------------------------------
p = 'ClaudeWeb.App/Services/Autopilot/LoopConfigStore.cs'; s = read(p)
s = rep(s, '    public const string ArmedByOperator = "operator";\n    public const string ArmedByArch = "arch";',
'''    public const string ArmedByOperator = "operator";
    public const string ArmedByArch = "arch";
    /// <summary>The repo agent itself, through arm_my_loop (openspec repo-agent-harness-tools).</summary>
    public const string ArmedByAgent = "agent";''', p)
write(p, s)

# ---- DockRegistry: a test-only store folder ----------------------------------------------
p = 'ClaudeWeb.App/Services/Dock/DockRegistry.cs'; s = read(p)
s = rep(s, '''    public DockRegistry(Logger logger)
    {
        _logger = logger;
        _storePath = ResolveStorePath();
        _globalStorePath = ResolveGlobalStorePath();''',
'''    /// <param name="dataDir">overrides the store folder (tests — the real one is shared with the live harness)</param>
    public DockRegistry(Logger logger, string? dataDir = null)
    {
        _logger = logger;
        _storePath = dataDir is null ? ResolveStorePath() : Path.Combine(dataDir, "dock.json");
        _globalStorePath = dataDir is null ? ResolveGlobalStorePath() : Path.Combine(dataDir, "dock-stash.json");''', p)
write(p, s)

# ---- RepoAgentToolbox: partial, header ---------------------------------------------------
p = 'ClaudeWeb.App/Services/Agents/RepoAgentToolbox.cs'; s = read(p)
s = rep(s, 'public sealed class RepoAgentToolbox\n{', 'public sealed partial class RepoAgentToolbox\n{', p)
s = rep(s, '''/// the run's config names the repo, so a tool call can only ever speak for that agent.
/// </summary>''',
'''/// the run's config names the repo, so a tool call can only ever speak for that agent.
///
/// The three SELF-SERVICE tools (openspec repo-agent-harness-tools) live in
/// RepoAgentToolbox.Harness.cs: <c>harness_help</c> (what a harness feature is and how this repo
/// uses it, read off the harness's own docs), <c>stash_prompt</c> (a prompt onto the agent's own
/// queue) and <c>arm_my_loop</c> (the agent's own loop, through the arch's armer).
/// </summary>''', p)
write(p, s)

# ---- HarnessKnowledge: the embedded names follow the csproj LogicalName ------------------
p = 'ClaudeWeb.App/Services/Agents/HarnessKnowledge.cs'; s = read(p)
s = rep(s, '''            // "ClaudeWeb.docs.understanding_app_convention.md" → the file name is the tail after
            // the docs marker; the resource name replaced '-' with '_' — undone here.
            var name = res;
            var i = name.IndexOf(".docs.", StringComparison.OrdinalIgnoreCase);
            if (i >= 0) name = name[(i + ".docs.".Length)..];
            list.Add((name.Replace('_', '-'), r.ReadToEnd()));''',
'''            // LogicalName "docs.<file>.md" (csproj): the file name is the tail after the docs marker.
            var name = res;
            var i = name.IndexOf("docs.", StringComparison.OrdinalIgnoreCase);
            if (i >= 0) name = name[(i + "docs.".Length)..];
            list.Add((name, r.ReadToEnd()));''', p)
write(p, s)

# ---- LoopArmer: a loopId mismatch was never audited by the arch -------------------------
p = 'ClaudeWeb.App/Services/Autopilot/LoopArmer.cs'; s = read(p)
s = rep(s, '''        if (!string.IsNullOrWhiteSpace(loopId) && loopId.Trim() != repoId) return new Outcome(false, "error", $"loopId {loopId} is not {repoName}'s loop slot ({repoId}); one loop per agent", null, "invalid");''',
'''        if (!string.IsNullOrWhiteSpace(loopId) && loopId.Trim() != repoId) return new Outcome(false, "error", $"loopId {loopId} is not {repoName}'s loop slot ({repoId}); one loop per agent", null, "");''', p)
s = rep(s, '''        if (!string.IsNullOrWhiteSpace(loopId) && loopId.Trim() != repoId) return new Outcome(false, "error", $"loopId {loopId} is not {repoName}'s loop slot ({repoId})", null, "invalid");''',
'''        if (!string.IsNullOrWhiteSpace(loopId) && loopId.Trim() != repoId) return new Outcome(false, "error", $"loopId {loopId} is not {repoName}'s loop slot ({repoId})", null, "");''', p)
write(p, s)

# ---- RepoAgentMcpServer: the three tools --------------------------------------------------
p = 'ClaudeWeb.App/Services/Agents/RepoAgentMcpServer.cs'; s = read(p)
s = rep(s, ''' the card is done only when every leg is merged. Every result is data.",''',
''' the card is done only when every leg is merged. harness_help answers 'what is harness feature X and how do I use / update it here' from the harness's own docs (no arguments = the topic index) — call it before guessing how the Understanding app, the Local tab or a loop works. stash_prompt adds a prompt to your own queue (the dock's stash a queue loop drains, head first) — split a long instruction into one prompt per task with it. arm_my_loop arms / updates / stops / reads your own loop with the Loop panel's parameters (kind suggestion | recipe | goal | queue). Every result is data.",''', p)
s = rep(s, '''            "report_leg" => _tools.ReportLeg(repoId, S("task"), S("leg"), S("branch"), S("commit"), S("pr")),
            _ => null,''',
'''            "report_leg" => _tools.ReportLeg(repoId, S("task"), S("leg"), S("branch"), S("commit"), S("pr")),
            "harness_help" => _tools.HarnessHelp(repoId, S("topic"), S("query")),
            "stash_prompt" => _tools.StashPrompt(repoId, S("text"), B("first")),
            "arm_my_loop" => _tools.ArmMyLoop(repoId, S("action"), new ClaudeWeb.Services.Arch.ArchLoopTools.LoopParams(
                S("kind"), S("mode"), S("goal"), S("prompt"), S("sentinel"), I("maxIterations"), S("recipe"), null,
                args.ContainsKey("verifyEnabled") ? B("verifyEnabled") : null, args.ContainsKey("includeFooterClauses") ? B("includeFooterClauses") : null), B("rearm")),
            _ => null,''', p)
s = rep(s, '''            try { return n.GetValue<bool>(); } catch { return string.Equals(n.ToString(), "true", StringComparison.OrdinalIgnoreCase); }
        }''',
'''            try { return n.GetValue<bool>(); } catch { return string.Equals(n.ToString(), "true", StringComparison.OrdinalIgnoreCase); }
        }
        int? I(string k)
        {
            var n = args[k];
            if (n is null) return null;
            try { return n.GetValue<int>(); } catch { return int.TryParse(n.ToString(), out var v) ? v : null; }
        }''', p)
s = rep(s, '''                ("pr", "string", "the pull request URL (https://github.com/<owner>/<repo>/pull/<n>)", false))));''',
'''                ("pr", "string", "the pull request URL (https://github.com/<owner>/<repo>/pull/<n>)", false))),
        Tool("harness_help",
            "What a harness (Claude Web) feature is and how YOU use or update it in this repo — the Understanding app, the Goal app, the Local tab (local exposure), the loop markers (LOOP_DONE / NEEDS_HUMAN / FLAG), detached verification, the agent concept map, networking. Read from the harness's own convention docs on every call (never stale) and prefixed with this repo's concrete paths and URLs. No arguments = the index of topics with their sections; topic = an id from the index (or id#section) for its text; query = a question (\\"how do I update the understanding app\\") for the best match.",
            Schema(("topic", "string", "a topic id from the index, optionally #section (e.g. understanding-app-convention#the-four-line-contract)", false),
                ("query", "string", "a question in words; the best-matching topic or section answers", false))),
        Tool("stash_prompt",
            "Add a prompt to YOUR OWN queue: the stash of your dock tab, which a queue loop drains head first, one prompt per turn. Use it to split one long instruction into one prompt per task, then arm_my_loop with kind queue. Add only — the Operator sees and curates the stash on the dock; you never remove items. Returns the queue as it stands.",
            Schema(("text", "string", "the prompt to queue (as you would type it in the composer)", true),
                ("first", "boolean", "put it at the head of the queue instead of the end (default false)", false))),
        Tool("arm_my_loop",
            "Arm, update, stop or read YOUR OWN loop with the Loop panel's parameters — the same loop the Operator or the arch could arm on you, armed by \\"agent\\" and visible on the dock's Loop panel. action = start (default) | update | stop | status. start: kind suggestion | recipe | goal | queue (or inferred: a goal → goal; a recipe / prompt → recipe), mode suggest | drive (drive sends when you are idle after each turn; suggest only pends the next prompt for the Operator), maxIterations 1–100, goal (what done looks like; ends on LOOP_DONE then a verification turn), recipe (id or name) or a raw prompt + sentinel, verifyEnabled (queue: verify each step, default on), includeFooterClauses. The queue kind drains your own stash (stash_prompt first; empty = refused). A closed autopilot gate refuses everything but status.",
            Schema(("action", "string", "start | update | stop | status (default start)", false),
                ("kind", "string", "suggestion | recipe | goal | queue", false),
                ("mode", "string", "suggest | drive", false),
                ("goal", "string", "goal kind: what done looks like", false),
                ("prompt", "string", "recipe kind without a recipe: the prompt to resend each iteration", false),
                ("sentinel", "string", "recipe kind: the final-line word that ends the loop (default LOOP_DONE)", false),
                ("maxIterations", "integer", "the iteration cap, 1–100", false),
                ("recipe", "string", "recipe kind: a stored recipe's id or name", false),
                ("verifyEnabled", "boolean", "queue kind: verify each step before the next (default true)", false),
                ("includeFooterClauses", "boolean", "append the chat footer clauses to driven sends (default false)", false),
                ("rearm", "boolean", "update: re-arm a stopped loop (default false)", false))));''', p)
write(p, s)

# ---- RepoAgentToolsService: the environment ---------------------------------------------
p = 'ClaudeWeb.App/Services/Agents/RepoAgentToolsService.cs'; s = read(p)
s = rep(s, 'using ClaudeWeb.Models;\nusing ClaudeWeb.Services.Logging;',
'using ClaudeWeb.Models;\nusing ClaudeWeb.Services.Autopilot;\nusing ClaudeWeb.Services.Chat;\nusing ClaudeWeb.Services.Dock;\nusing ClaudeWeb.Services.Logging;', p)
s = rep(s, '''    public RepoAgentToolsService(ToolsConfigStore tools, AppConfig appConfig, TaskGraphService graph, RepositoryRegistry repos, Logger logger)
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
    }''',
'''    public RepoAgentToolsService(ToolsConfigStore tools, AppConfig appConfig, TaskGraphService graph, RepositoryRegistry repos, Logger logger,
        DockRegistry? dock = null, RunSessionService? runs = null, LoopConfigStore? loops = null, AutopilotConfigStore? autopilot = null,
        LoopRecipeStore? recipes = null, AutopilotGate? gate = null, AutopilotAuditLog? audit = null)
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
            Machine = System.Environment.MachineName,
        };
        tools.HarnessServers = ServersFor;
    }''', p)
s = rep(s, '"[AGENT-TOOLS] repo-agent tool server ready: my_effort, report_leg at POST /api/agents/mcp"',
'"[AGENT-TOOLS] repo-agent tool server ready: my_effort, report_leg, harness_help, stash_prompt, arm_my_loop at POST /api/agents/mcp"', p)
write(p, s)

# ---- ArchAgentService: arm through the shared LoopArmer ----------------------------------
p = 'ClaudeWeb.App/Services/Arch/ArchAgentService.cs'; s = read(p)
s = cut(s, '    private ToolOutcome StartLocalLoop(RepositoryRegistry.RepositoryInfo repo, ArchLoopTools.LoopParams p, string by, string tool)\n',
        '    private LoopRecipeStore.Recipe? FindRecipe(string idOrName)\n',
'''    private LoopArmer? _armer;
    /// <summary>The one arming path (openspec repo-agent-harness-tools): shared with the repo
    /// agents' <c>arm_my_loop</c>, so the arch and an agent arm the very same way.</summary>
    private LoopArmer Armer => _armer ??= new LoopArmer(_loops, () => _config.Get().AutoAdvance, _dock.GetStash, id => LoopArmer.ResolveQueueTab(_dock, id), FindRecipe);

    private ToolOutcome StartLocalLoop(RepositoryRegistry.RepositoryInfo repo, ArchLoopTools.LoopParams p, string by, string tool)
    {
        var o = Armer.Start(repo.Id, repo.Name, p, by, ResolveRepoSession(repo));
        AuditTool(tool, repo.Id, o.Audit);
        if (!o.Ok) return new ToolOutcome(false, o.Status, o.Detail);
        _logger.Info($"[ARCH] {by} armed a {o.State!.Kind} loop on \\"{repo.Name}\\" ({o.Audit})");
        return new ToolOutcome(true, o.Status, o.Detail,
            ArchLoopTools.View(o.State, repo.Id, repo.Name, Machine, Handles.AgentLabel(SelfLabel, repo.Handle ?? repo.Id), null, Now()));
    }

''', p)
s = cut(s, '    private ToolOutcome UpdateLocalLoop(RepositoryRegistry.RepositoryInfo repo, string? loopId, ArchLoopTools.LoopParams p, bool rearm, string by, string tool)\n',
        '    private ToolOutcome StopLocalLoop(RepositoryRegistry.RepositoryInfo repo, string? loopId, string by, string tool)\n',
'''    private ToolOutcome UpdateLocalLoop(RepositoryRegistry.RepositoryInfo repo, string? loopId, ArchLoopTools.LoopParams p, bool rearm, string by, string tool)
    {
        var o = Armer.Update(repo.Id, repo.Name, loopId, p, rearm, by, () => ResolveRepoSession(repo));
        if (o.Audit.Length > 0) AuditTool(tool, repo.Id, o.Audit);
        if (!o.Ok) return new ToolOutcome(false, o.Status, o.Detail);
        var cur = _loops.Get(repo.Id);
        _logger.Info($"[ARCH] {by} {(o.Rearmed ? "re-armed" : "updated")} the {cur?.Kind ?? o.State?.Kind} loop on \\"{repo.Name}\\" ({o.Audit})");
        return new ToolOutcome(true, o.Status, o.Detail,
            o.State is null ? null : ArchLoopTools.View(o.State, repo.Id, repo.Name, Machine, Handles.AgentLabel(SelfLabel, repo.Handle ?? repo.Id), null, Now()));
    }

''', p)
s = cut(s, '    private ToolOutcome StopLocalLoop(RepositoryRegistry.RepositoryInfo repo, string? loopId, string by, string tool)\n',
        '    /// <summary>The peer API\'s loop list: the loop rows of THIS harness\'s managed agents.</summary>\n',
'''    private ToolOutcome StopLocalLoop(RepositoryRegistry.RepositoryInfo repo, string? loopId, string by, string tool)
    {
        var o = Armer.Stop(repo.Id, repo.Name, loopId, by);
        if (o.Audit.Length > 0) AuditTool(tool, repo.Id, o.Audit);
        if (!o.Ok) return new ToolOutcome(false, o.Status, o.Detail);
        if (o.Status == "stopped") _logger.Info($"[ARCH] {by} stopped the {o.State!.Kind} loop on \\"{repo.Name}\\"");
        return new ToolOutcome(true, o.Status, o.Detail,
            ArchLoopTools.View(o.State!, repo.Id, repo.Name, Machine, o.Status == "stopped" ? Handles.AgentLabel(SelfLabel, repo.Handle ?? repo.Id) : null, null, Now()));
    }

''', p)
write(p, s)

# ---- ToolsController: the harness block in the Tools lane's view -------------------------
p = 'ClaudeWeb.App/Controllers/ToolsController.cs'; s = read(p)
s = rep(s, 'using ClaudeWeb.Services.Logging;\nusing ClaudeWeb.Services.Repositories;',
'using ClaudeWeb.Models;\nusing ClaudeWeb.Services.Agents;\nusing ClaudeWeb.Services.Logging;\nusing ClaudeWeb.Services.Repositories;', p)
s = rep(s, '''    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public ToolsController(ToolsConfigStore store, RepositoryRegistry registry, RepositoryResolver repos, Logger logger)
    {
        _store = store;
        _registry = registry;
        _repos = repos;
        _logger = logger;
    }''',
'''    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;
    private readonly AppConfig _config;

    public ToolsController(ToolsConfigStore store, RepositoryRegistry registry, RepositoryResolver repos, Logger logger, AppConfig config)
    {
        _store = store;
        _registry = registry;
        _repos = repos;
        _logger = logger;
        _config = config;
    }''', p)
s = rep(s, '''    private object BuildView(string repoId)
    {
        var cfg = _store.GetBirokrat(repoId);
        return new
        {
            repoId,''',
'''    /// <summary>The harness's OWN server as it reaches this repo's turns (openspec
    /// repo-agent-harness-tools): the catalogue is read from the server itself (tools/list), so
    /// the lane can never list something the agent does not get. Nothing to configure.</summary>
    private object HarnessView(string repoId) => new
    {
        server = new
        {
            name = RepoAgentMcpServer.ServerName,
            transport = "http",
            url = $"http://127.0.0.1:{_config.Port}/api/agents/mcp?repo={Uri.EscapeDataString(repoId)}",
            protocolVersion = RepoAgentMcpServer.ProtocolVersion,
            tokenSet = true,
            alwaysOn = true,
        },
        tools = RepoAgentMcpServer.ToolsList(),
    };

    private object BuildView(string repoId)
    {
        var cfg = _store.GetBirokrat(repoId);
        return new
        {
            repoId,
            harness = HarnessView(repoId),''', p)
write(p, s)

# ---- docs/agents.md: the bullet names all five tools -------------------------------------
p = 'docs/agents.md'; s = read(p)
i = s.index('- **Harness tools.**')
j = s.index('\n- ', i + 5) if '\n- ' in s[i + 5:] else s.index('\n\n', i)
old = s[i:j]
new = '''- **Harness tools.** Every turn carries the harness's own MCP server for repo agents
  (`claude-web`, `POST /api/agents/mcp?repo=<id>`, a per-process bearer; openspec
  cross-repo-effort-legs + repo-agent-harness-tools): `my_effort` — which board effort the agent
  is a leg of, its role, the legs it drives / the driver it answers to, every leg's PR and
  merge state; `report_leg` — record a leg's branch / PR so the verifier can check it (the
  driver reports for agentless legs); `harness_help` — what a harness feature is and how this
  repo uses it (the Understanding app, the Local tab, the loop markers…), read off the
  harness's own `docs/*.md` on every call, prefixed with the repo's concrete paths;
  `stash_prompt` — a prompt onto the agent's own dock stash (the queue a queue loop drains);
  `arm_my_loop` — arm / update / stop / read the agent's own loop with the Loop panel's
  parameters, through the same armer the arch uses, armed by `agent`, gated by the Operator's
  autopilot gate. The dock's Tools lane lists the server and its catalogue (read from
  `tools/list`) above the configurable Birokrat API tool.'''
s = s[:i] + new + s[j:]
write(p, s)

# ---- ToolsPanel.jsx: the harness block first ---------------------------------------------
p = 'client/src/components/dashboard/ToolsPanel.jsx'; s = read(p)
s = rep(s, "import './toolsPanel.css';", "import './toolsPanel.css';\nimport '../arch/archTools.css';", p)
s = rep(s, '''export default function ToolsPanel({ repoId }) {''',
'''// The harness's own server as it reaches this repo's turns (openspec repo-agent-harness-tools):
// listed FIRST, always on, nothing to save — the catalogue comes from the server's own
// tools/list, so this list cannot differ from what the agent sees.
function HarnessParams({ schema }) {
  const props = schema?.properties || {};
  const required = new Set(schema?.required || []);
  const names = Object.keys(props);
  if (names.length === 0) return <div className="arch-tools__noparams">no parameters</div>;
  return (
    <div className="arch-tools__params">
      {names.map((n) => (
        <div className="arch-tools__param" key={n}>
          <code className="arch-tools__pname">{n}</code>
          <span className="arch-tools__ptype">{props[n].type}{required.has(n) ? ' · required' : ''}</span>
          <span className="arch-tools__pdesc">{props[n].description}</span>
        </div>
      ))}
    </div>
  );
}

function HarnessTools({ harness, t }) {
  if (!harness) return null;
  const server = harness.server || {};
  const tools = harness.tools || [];
  return (
    <section className="toolsp__tool toolsp__harness" data-tools-harness data-tools-harness-count={tools.length}>
      <div className="toolsp__toolhead arch-tools__toolhead">
        <b>{t('tools.harness.title', { name: server.name || 'claude-web' })}</b>
        <span className="arch-tools__usage">{t('tools.harness.count', { n: tools.length })}</span>
      </div>
      <p className="toolsp__intro">{t('tools.harness.intro')} <code>{server.url}</code></p>
      {tools.map((tool) => (
        <div className="arch-tools__tool toolsp__harness-tool" key={tool.name} data-tools-harness-tool={tool.name}>
          <div className="arch-tools__toolhead"><b className="arch-tools__name">{tool.name}</b></div>
          <p className="arch-tools__desc">{tool.description}</p>
          <HarnessParams schema={tool.inputSchema} />
        </div>
      ))}
    </section>
  );
}

export default function ToolsPanel({ repoId }) {''', p)
s = rep(s, '''      <p className="toolsp__intro">{t('tools.intro')}</p>

      <section className="toolsp__tool">''',
'''      <p className="toolsp__intro">{t('tools.intro')}</p>

      <HarnessTools harness={view.harness} t={t} />

      <section className="toolsp__tool" data-tools-birokrat>''', p)
write(p, s)

# ---- i18n --------------------------------------------------------------------------------
p = 'client/src/i18n/en.json'; s = read(p)
s = rep(s, '''  "tools.birokrat": "Birokrat API (MCP server)",''',
'''  "tools.harness.title": "Harness tools — the {name} MCP server (always on)",
  "tools.harness.count": "{n} tools",
  "tools.harness.intro": "The harness serves these to this agent on every turn through its own MCP server; nothing to configure, the token is minted per harness process, every result is data. Endpoint:",
  "tools.birokrat": "Birokrat API (MCP server)",''', p)
write(p, s)
p = 'client/src/i18n/tr.json'; s = read(p)
s = rep(s, '''  "tools.birokrat": "Birokrat API (MCP sunucusu)",''',
'''  "tools.harness.title": "Harness araclari — {name} MCP sunucusu (her zaman acik)",
  "tools.harness.count": "{n} arac",
  "tools.harness.intro": "Harness bunlari her turda kendi MCP sunucusu uzerinden bu ajana sunar; yapilandirilacak bir sey yok, jeton her harness surecinde uretilir, her sonuc veridir. Uc nokta:",
  "tools.birokrat": "Birokrat API (MCP sunucusu)",''', p)
write(p, s)
print('ALL PATCHED')
