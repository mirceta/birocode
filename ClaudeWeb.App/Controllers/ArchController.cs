using System.Text;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The Arch tab's API (openspec: add-arch-agent, D9) plus the MCP endpoint the
/// arch session calls (D7). Reads are session-auth only; actions (arm, send,
/// scope) are operator-gated like every autopilot action, because the arch loop
/// runs on the autopilot engine. The MCP route is exempt from the password
/// middleware and instead checks the per-process bearer token the harness
/// itself wrote into the run's <c>--mcp-config</c>.
/// </summary>
[ApiController]
[Route("api/arch")]
public class ArchController : ControllerBase
{
    private readonly ArchAgentService _arch;
    private readonly ArchMcpServer _mcp;
    private readonly LoopConfigStore _loops;
    private readonly AutopilotGate _gate;
    private readonly AutopilotConfigStore _config;
    private readonly AutopilotService _engine;
    private readonly AutopilotAuditLog _audit;
    private readonly RunSessionService _runs;
    private readonly SessionService _sessions;
    private readonly RepositoryRegistry _repos;
    private readonly Logger _logger;

    public ArchController(
        ArchAgentService arch, ArchMcpServer mcp, LoopConfigStore loops, AutopilotGate gate,
        AutopilotConfigStore config, AutopilotService engine, AutopilotAuditLog audit,
        RunSessionService runs, SessionService sessions, RepositoryRegistry repos, Logger logger)
    {
        _arch = arch;
        _mcp = mcp;
        _loops = loops;
        _gate = gate;
        _config = config;
        _engine = engine;
        _audit = audit;
        _runs = runs;
        _sessions = sessions;
        _repos = repos;
        _logger = logger;
    }

    private IActionResult? GateClosed() =>
        _gate.Enabled ? null
            : StatusCode(StatusCodes.Status403Forbidden,
                new { error = "Autopilot is disabled by the operator.", gate = "operator-off" });

    // ---- state ---------------------------------------------------------------

    [HttpGet("")]
    public IActionResult State()
    {
        _logger.CountRequest();
        return Ok(BuildState());
    }

    private object BuildState()
    {
        var loop = _loops.Get(ArchAgentService.ReservedId);
        var engine = _engine.States().FirstOrDefault(s => s.RepoId == ArchAgentService.ReservedId);
        var run = _runs.Get(ArchAgentService.ReservedId);
        var managed = _arch.ManagedRepoIds();
        var home = _arch.HomePath;
        return new
        {
            gateOpen = _gate.Enabled,
            killSwitch = _config.Get().Enabled,
            loop = loop is null ? null : new
            {
                kind = loop.Kind, mode = loop.Mode, active = loop.Active, status = loop.Status,
                iterationsDone = loop.IterationsDone, maxIterations = loop.MaxIterations,
                lastSentAt = loop.LastSentAt, armedAt = loop.ArmedAt, stopReason = loop.StopReason,
                stopDetail = loop.StopDetail, pendingPrompt = _gate.Enabled ? loop.PendingPrompt : null,
                sessionId = loop.SessionId,
            },
            engine = engine is null ? null : new { decision = engine.Decision, reason = engine.Reason, at = engine.UpdatedAt },
            managedRepoIds = managed,
            repos = _repos.GetAll().Select(r => new { id = r.Id, name = r.Name, exists = r.Exists, isSelf = r.IsSelf }),
            agents = _arch.ListAgents().Select(a => new
            {
                machine = a.Machine, repoId = a.RepoId, name = a.Name, remoteUrl = a.RemoteUrl, branch = a.Branch,
                defaultBranch = a.DefaultBranch, dirty = a.Dirty, availability = a.Availability, lastActor = a.LastActor,
                runningSince = a.RunningSince, tabId = a.TabId, exists = a.Exists,
            }),
            home = new
            {
                path = home, exists = _arch.HomeExists,
                commits = _arch.RecentHomeCommits().Select(c => new { sha = c.Sha, subject = c.Subject, at = c.At }),
            },
            session = new
            {
                sessionId = _arch.ResolveArchSessionId(),
                run = run is null ? null : new { status = run.Status, lastSeq = run.LastSeq, sessionId = run.SessionId },
            },
            watermark = _arch.Watermark,
            disallowedTools = ArchAgentService.DisallowedTools,
        };
    }

    // ---- conversation ------------------------------------------------------------

    /// <summary>The arch conversation transcript, annotated with each user
    /// message's actor (human | wake).</summary>
    [HttpGet("messages")]
    public IActionResult Messages([FromQuery] string? sessionId = null)
    {
        _logger.CountRequest();
        var sid = string.IsNullOrWhiteSpace(sessionId) ? _arch.ResolveArchSessionId() : sessionId;
        if (sid is null) return Ok(new { sessionId = (string?)null, messages = Array.Empty<object>() });
        var messages = _sessions.GetMessages(_arch.HomePath, sid);
        var annotated = MessageActors.Annotate(messages, _audit.Recent(5000), ArchAgentService.ReservedId, ArchAgentService.ActorHuman);
        return Ok(new { sessionId = sid, messages = annotated });
    }

    public sealed record SendRequest(string? Text);

    [HttpPost("send")]
    public IActionResult Send([FromBody] SendRequest? req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (req is null || string.IsNullOrWhiteSpace(req.Text)) return BadRequest(new { error = "text is required" });
        var (ok, error, session) = _arch.SendToArch(req.Text);
        if (!ok) return StatusCode(StatusCodes.Status409Conflict, new { error });
        return Ok(new { sent = true, lastSeq = session!.LastSeq });
    }

    /// <summary>Reattach to the arch run's event stream (same contract as
    /// <c>GET /api/chat/stream</c>): replay after <paramref name="after"/>, then live.</summary>
    [HttpGet("stream")]
    public async Task Stream([FromQuery] int after = 0)
    {
        _logger.CountRequest();
        var session = _runs.Get(ArchAgentService.ReservedId);
        if (session is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { error = "No arch run yet." });
            return;
        }
        Response.StatusCode = StatusCodes.Status200OK;
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";
        try
        {
            await foreach (var json in session.StreamAsync(after, HttpContext.RequestAborted))
            {
                var bytes = Encoding.UTF8.GetBytes($"data: {json}\n\n");
                await Response.Body.WriteAsync(bytes, HttpContext.RequestAborted);
                await Response.Body.FlushAsync(HttpContext.RequestAborted);
            }
        }
        catch (OperationCanceledException)
        {
            // Client detached; the arch turn keeps running.
        }
    }

    /// <summary>Stops the arch agent's CURRENT turn (kills its CLI). Distinct from
    /// disarm: this is the chat Stop button for the arch conversation.</summary>
    [HttpPost("stop-turn")]
    public IActionResult StopTurn()
    {
        _logger.CountRequest();
        var session = _runs.Get(ArchAgentService.ReservedId);
        if (session is null || session.Status != "running")
            return NotFound(new { error = "No running arch turn." });
        session.RequestStop();
        return Ok(new { stopped = true });
    }

    // ---- scope + loop ---------------------------------------------------------------

    public sealed record ScopeRequest(List<string>? RepoIds);

    [HttpPost("scope")]
    public IActionResult Scope([FromBody] ScopeRequest? req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        _arch.SetScope(req?.RepoIds ?? new List<string>());
        return Ok(BuildState());
    }

    public sealed record LoopRequest(string? Action, string? Mode, int? MaxIterations);

    /// <summary><c>action</c> = arm | disarm | stop | mode. Arm bootstraps the home,
    /// pins the conversation and resets the watermark (no replay); disarm is the
    /// kill switch for the arch agent — no further sends, running repo turns finish.</summary>
    [HttpPost("loop")]
    public IActionResult Loop([FromBody] LoopRequest? req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        switch ((req?.Action ?? "").ToLowerInvariant())
        {
            case "arm":
            case "start":
                if (_arch.ManagedRepoIds().Count == 0)
                    return BadRequest(new { error = "pick at least one managed repo before arming" });
                _arch.Arm(req?.Mode, req?.MaxIterations);
                break;
            case "disarm":
            case "stop":
                _loops.Stop(ArchAgentService.ReservedId);
                break;
            case "mode":
                if (string.IsNullOrWhiteSpace(req?.Mode))
                    return BadRequest(new { error = "the mode action needs a mode (suggest | drive)" });
                if (_loops.SetMode(ArchAgentService.ReservedId, req.Mode) is null)
                    return NotFound(new { error = "the arch loop has never been armed" });
                break;
            default:
                return BadRequest(new { error = $"unknown action \"{req?.Action}\"" });
        }
        return Ok(BuildState());
    }

    // ---- MCP ----------------------------------------------------------------------------

    /// <summary>Streamable-HTTP MCP endpoint for the arch session. Exempt from
    /// the password middleware; the bearer token is the credential.</summary>
    [HttpPost("mcp")]
    public async Task<IActionResult> Mcp()
    {
        if (!Authorized()) return Unauthorized(new { error = "bad or missing arch MCP token" });
        JsonNode? body;
        try
        {
            using var reader = new StreamReader(Request.Body, Encoding.UTF8);
            var text = await reader.ReadToEndAsync();
            body = string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text);
        }
        catch (Exception ex)
        {
            return BadRequest(new { jsonrpc = "2.0", id = (object?)null, error = new { code = -32700, message = $"parse error: {ex.Message}" } });
        }
        var reply = _mcp.Handle(body);
        Response.Headers["Mcp-Session-Id"] = "arch";
        if (reply.Body is null) return StatusCode(reply.Status);
        return new ContentResult { StatusCode = reply.Status, ContentType = "application/json", Content = reply.Body.ToJsonString() };
    }

    [HttpGet("mcp")]
    public IActionResult McpGet() => StatusCode(StatusCodes.Status405MethodNotAllowed);

    [HttpDelete("mcp")]
    public IActionResult McpDelete() => Authorized() ? Ok() : Unauthorized();

    private bool Authorized()
    {
        var auth = Request.Headers.Authorization.FirstOrDefault() ?? "";
        const string prefix = "Bearer ";
        return auth.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && _arch.ValidateMcpToken(auth[prefix.Length..].Trim());
    }
}
