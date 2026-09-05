using System.Text;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The Tasks agent's API (openspec: tasks-agent, D6) plus the MCP endpoint its
/// session calls (D4). Everything but the MCP route is session-auth; the MCP route
/// is exempt from the password middleware and checks the per-process bearer token
/// the harness itself wrote into the run's <c>--mcp-config</c>.
/// </summary>
[ApiController]
[Route("api/tasks")]
public class TasksController : ControllerBase
{
    private readonly TasksAgentService _tasks;
    private readonly TasksMcpServer _mcp;
    private readonly AutopilotAuditLog _audit;
    private readonly RunSessionService _runs;
    private readonly SessionService _sessions;
    private readonly Logger _logger;

    public TasksController(TasksAgentService tasks, TasksMcpServer mcp, AutopilotAuditLog audit,
        RunSessionService runs, SessionService sessions, Logger logger)
    {
        _tasks = tasks;
        _mcp = mcp;
        _audit = audit;
        _runs = runs;
        _sessions = sessions;
        _logger = logger;
    }

    // ---- state ---------------------------------------------------------------------

    [HttpGet("")]
    public IActionResult State()
    {
        _logger.CountRequest();
        var run = _runs.Get(TasksAgentService.ReservedId);
        var sid = _tasks.ResolveSessionId();
        var home = _tasks.HomePath;
        return Ok(new
        {
            home = new { path = home, exists = _tasks.HomeExists },
            session = new
            {
                sessionId = sid,
                transcriptPath = sid is { Length: > 0 }
                    ? System.IO.Path.Combine(SessionService.ProjectsDirectoryFor(home), sid + ".jsonl")
                    : null,
                run = run is null ? null : new { status = run.Status, lastSeq = run.LastSeq, sessionId = run.SessionId },
            },
            tools = TasksMcpServer.ToolNames,
            disallowedTools = TasksAgentService.DisallowedTools,
        });
    }

    [HttpGet("messages")]
    public IActionResult Messages([FromQuery] string? sessionId = null)
    {
        _logger.CountRequest();
        var sid = string.IsNullOrWhiteSpace(sessionId) ? _tasks.ResolveSessionId() : sessionId;
        if (sid is null) return Ok(new { sessionId = (string?)null, messages = Array.Empty<object>() });
        var messages = _sessions.GetMessages(_tasks.HomePath, sid);
        var annotated = MessageActors.Annotate(messages, _audit.Recent(5000), TasksAgentService.ReservedId, TasksAgentService.ActorHuman);
        return Ok(new { sessionId = sid, messages = annotated });
    }

    /// <summary>The Tools lane: the eight tools with their audit-derived call counts.</summary>
    [HttpGet("tools")]
    public IActionResult Tools()
    {
        _logger.CountRequest();
        var calls = _audit.Recent(5000)
            .Where(e => e.Kind == TasksToolbox.AuditKind && e.Outcome == TasksToolbox.AuditOutcomeTool)
            .ToList(); // newest first
        var tools = TasksMcpServer.ToolsList().Select(t =>
        {
            var name = t?["name"]?.GetValue<string>() ?? "";
            var mine = calls.Where(e => e.Phase == name).ToList();
            var last = mine.FirstOrDefault();
            return new
            {
                name,
                callName = $"mcp__{TasksMcpServer.ServerName}__{name}",
                description = t?["description"]?.GetValue<string>() ?? "",
                inputSchema = t?["inputSchema"],
                calls = mine.Count,
                lastAt = last?.At,
                lastOutcome = last?.AnsweredMessage,
            };
        }).ToList();
        return Ok(new
        {
            server = new
            {
                name = TasksMcpServer.ServerName,
                transport = "http",
                url = "/api/tasks/mcp",
                protocolVersion = TasksMcpServer.ProtocolVersion,
                tokenSet = _tasks.McpTokenSet,
            },
            tools,
            disallowedTools = TasksAgentService.DisallowedTools,
            totalCalls = calls.Count,
            home = new { path = _tasks.HomePath, exists = _tasks.HomeExists },
        });
    }

    // ---- conversation -----------------------------------------------------------------

    public sealed record SendRequest(string? Text);

    [HttpPost("send")]
    public IActionResult Send([FromBody] SendRequest? req)
    {
        _logger.CountRequest();
        if (req is null || string.IsNullOrWhiteSpace(req.Text)) return BadRequest(new { error = "text is required" });
        var (ok, error, session) = _tasks.Send(req.Text);
        if (!ok) return StatusCode(StatusCodes.Status409Conflict, new { error });
        return Ok(new { sent = true, lastSeq = session!.LastSeq });
    }

    /// <summary>Reattach to the Tasks run's event stream (same contract as
    /// <c>GET /api/arch/stream</c>): replay after <paramref name="after"/>, then live.</summary>
    [HttpGet("stream")]
    public async Task Stream([FromQuery] int after = 0)
    {
        _logger.CountRequest();
        var session = _runs.Get(TasksAgentService.ReservedId);
        if (session is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { error = "No Tasks run yet." });
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
            // Client detached; the turn keeps running.
        }
    }

    [HttpPost("stop-turn")]
    public IActionResult StopTurn()
    {
        _logger.CountRequest();
        return Ok(new { stopped = _tasks.StopTurn() });
    }

    // ---- MCP ----------------------------------------------------------------------------

    /// <summary>Streamable-HTTP MCP endpoint for the Tasks session. Exempt from the
    /// password middleware; the bearer token is the credential.</summary>
    [HttpPost("mcp")]
    public async Task<IActionResult> Mcp()
    {
        if (!Authorized()) return Unauthorized(new { error = "bad or missing tasks MCP token" });
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
        Response.Headers["Mcp-Session-Id"] = TasksMcpServer.ServerName;
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
        return auth.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && _tasks.ValidateMcpToken(auth[prefix.Length..].Trim());
    }
}
