using System.Text;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Repo-agent subagents for the dock's Subagents lane and the hub (openspec
/// repo-agent-subagents). The same shapes the arch's goal routes answer with, so the
/// Subagents panel renders either owner:
///
///   GET    /api/goal-conversations?repo=                 -> { subagents: [view…] }
///   POST   /api/goal-conversations                       { repoId, goal, steps?, maxIterations?, name?, readOnly?, tabId? } (the Operator)
///   GET    /api/goal-conversations/{id}                  -> view
///   GET    /api/goal-conversations/{id}/messages?tail=   -> { sessionId, messages, total }   (its own transcript)
///   GET    /api/goal-conversations/{id}/stream?after=    -> SSE of its running turn (same contract as /api/chat/stream)
///   POST   /api/goal-conversations/{id}/stop | message | answer | continue | steps/{n} | plan ; DELETE /api/goal-conversations/{id}
///
/// and the three lanes a goal conversation shows beside its chat (the arch's goal conversations have
/// the same four: Chat · Tools · History · Loops):
///   GET    /api/goal-conversations/{id}/tools                -> the tool surface its turns get
///   GET    /api/goal-conversations/{id}/tool-calls?limit=&sessionId= -> its tool-call history (the arch History lane's shape)
///   GET    /api/goal-conversations/{id}/loop                 -> its goal loop and what the engine last decided
/// </summary>
[ApiController]
[Route("api/goal-conversations")]
public class SubagentsController : ControllerBase
{
    private readonly RepoSubagentService _subagents;
    private readonly RepositoryRegistry _repos;
    private readonly RunSessionService _runs;
    private readonly SessionService _sessions;
    private readonly AutopilotAuditLog _audit;
    private readonly AutopilotGate _gate;
    private readonly LoopConfigStore _loops;
    private readonly AutopilotService _engine;
    private readonly Logger _logger;

    public SubagentsController(RepoSubagentService subagents, RepositoryRegistry repos, RunSessionService runs, SessionService sessions, AutopilotAuditLog audit, AutopilotGate gate,
        LoopConfigStore loops, AutopilotService engine, Logger logger)
    {
        _loops = loops;
        _engine = engine;
        _subagents = subagents;
        _repos = repos;
        _runs = runs;
        _sessions = sessions;
        _audit = audit;
        _gate = gate;
        _logger = logger;
    }

    private static object Envelope(RepoAgentToolbox.ToolOutcome o) => new { ok = o.Ok, status = o.Status, detail = o.Detail, subagent = o.Data };

    [HttpGet]
    public IActionResult List([FromQuery] string? repo)
    {
        _logger.CountRequest();
        if (string.IsNullOrWhiteSpace(repo)) return BadRequest(new { error = "repo is required" });
        return Ok(new { repoId = repo, subagents = _subagents.Views(repo), counts = _subagents.CountsJson(repo) });
    }

    public sealed record StartRequest(string? RepoId, string? Goal, JsonNode? Steps, int? MaxIterations, string? Name, bool? ReadOnly, string? Model, string? TabId, bool? Concurrent = null);

    /// <summary>The Operator starts a subagent from the dock lane: the parent is the dock tab given
    /// (its session is the summary's destination).</summary>
    [HttpPost]
    public IActionResult Start([FromBody] StartRequest? req)
    {
        _logger.CountRequest();
        if (!_gate.Enabled) return StatusCode(StatusCodes.Status403Forbidden, new { error = "Autopilot is disabled by the operator.", gate = "operator-off" });
        var steps = ArchGoalPlans.ParseSteps(req?.Steps, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        var o = _subagents.Start(req?.RepoId, req?.Goal, steps, req?.MaxIterations, req?.Name, req?.ReadOnly == true, req?.Model,
            LoopConfigStore.ArmedByOperator, req?.TabId, null, null, req?.Concurrent == true);
        return Ok(Envelope(o));
    }

    [HttpGet("{id}")]
    public IActionResult Get(string id)
    {
        _logger.CountRequest();
        var s = _subagents.Find(id);
        return s is null ? NotFound(new { error = $"no goal conversation {id}" }) : Ok(_subagents.View(s));
    }

    [HttpGet("{id}/messages")]
    public IActionResult Messages(string id, [FromQuery] int? tail = null)
    {
        _logger.CountRequest();
        var s = _subagents.Find(id);
        if (s is null) return NotFound(new { error = $"no goal conversation {id}" });
        var repo = _repos.GetAll().FirstOrDefault(r => r.Id == s.RepoId);
        var sid = _subagents.ResolveSessionId(s.Key);
        if (repo is null || sid is null) return Ok(new { sessionId = (string?)null, messages = Array.Empty<object>(), total = 0 });
        var messages = _sessions.GetMessages(repo.Path, sid);
        var annotated = MessageActors.Annotate(messages, _audit.Recent(5000), s.Key, ArchAgentService.ActorHuman);
        var withCalls = ArchTranscriptViews.AttachToolCalls(annotated, _sessions.GetToolCallHistory(repo.Path, sid));
        var (items, total) = TranscriptWindow.Tail(withCalls, tail);
        return Ok(new { sessionId = sid, messages = items, total });
    }

    /// <summary>The Tools lane: the harness tools a goal conversation's turns get (its own MCP identity,
    /// <c>?repo=&amp;sub=</c> — the same catalogue the repo agent has; starting another goal conversation is
    /// refused from inside one), how often its sessions called each, and the permission scope its CLI
    /// runs with (a read-only helper runs in plan mode: every mutation is blocked).</summary>
    [HttpGet("{id}/tools")]
    public IActionResult Tools(string id)
    {
        _logger.CountRequest();
        var s = _subagents.Find(id);
        if (s is null) return NotFound(new { error = $"no goal conversation {id}" });
        var repo = _repos.GetAll().FirstOrDefault(r => r.Id == s.RepoId);
        var history = repo is null ? new List<ToolCallRecord>() : SessionsOf(s).SelectMany(sid => _sessions.GetToolCallHistory(repo.Path, sid)).ToList();
        var prefix = $"mcp__{RepoAgentMcpServer.ServerName}__";
        var builtin = history.Where(c => !c.Name.StartsWith(prefix, StringComparison.Ordinal))
            .GroupBy(c => c.Name).Select(g => new { name = g.Key, calls = g.Count(), lastAt = g.Max(c => c.At) })
            .OrderByDescending(x => x.calls).ToList();
        var tools = RepoAgentMcpServer.ToolsList().Select(t =>
        {
            var name = t?["name"]?.GetValue<string>() ?? "";
            var mine = history.Where(c => c.Name == prefix + name).ToList();
            var last = mine.OrderByDescending(c => c.At).FirstOrDefault();
            return new
            {
                name,
                callName = prefix + name,
                description = t?["description"]?.GetValue<string>() ?? "",
                inputSchema = t?["inputSchema"],
                calls = mine.Count,
                lastAt = last?.At,
                lastOutcome = last is null ? null : (last.Ok == false ? "error" : "ok"),
                refusedHere = name == "start_goal_conversation",
            };
        }).ToList();
        string? url = null;
        try { url = JsonNode.Parse(_subagents.McpConfigJson(s.Key) ?? "{}")?["mcpServers"]?[RepoAgentMcpServer.ServerName]?["url"]?.GetValue<string>(); } catch { /* shown as unknown */ }
        var bare = url is null ? null : url.Split('?')[0];
        return Ok(new
        {
            server = new { name = RepoAgentMcpServer.ServerName, transport = "http", url = bare, identity = $"repo={s.RepoId}&sub={s.Id}" },
            conversation = s.Key,
            policy = s.ReadOnly ? "read-only" : s.Concurrent ? "concurrent" : "writer",
            permissionMode = s.ReadOnly ? "plan" : "skip-permissions",
            tools,
            builtin,
            totalCalls = history.Count,
            sessions = SessionsOf(s).Count,
        });
    }

    /// <summary>The History lane: every tool call of the goal conversation's session (the current one by
    /// default, or <c>sessionId</c> — one of its own), in the arch History lane's shape.</summary>
    [HttpGet("{id}/tool-calls")]
    public IActionResult ToolCalls(string id, [FromQuery] int? limit = null, [FromQuery] string? sessionId = null)
    {
        _logger.CountRequest();
        var s = _subagents.Find(id);
        if (s is null) return NotFound(new { error = $"no goal conversation {id}" });
        var repo = _repos.GetAll().FirstOrDefault(r => r.Id == s.RepoId);
        var own = SessionsOf(s);
        // Only its own sessions: the lane never reads the parent's (or another agent's) transcript.
        var sid = string.IsNullOrWhiteSpace(sessionId) ? _subagents.ResolveSessionId(s.Key) : own.Contains(sessionId.Trim()) ? sessionId.Trim() : null;
        if (repo is null || sid is null)
            return Ok(new { sessionId = (string?)null, calls = Array.Empty<object>(), turns = Array.Empty<object>(), total = 0, truncated = false, limit = limit ?? ArchTranscriptViews.DefaultHistoryLimit, sessions = own });
        var payload = ArchTranscriptViews.ToolCallsPayload(sid, _sessions.GetToolCallHistory(repo.Path, sid), limit,
            $"mcp__{RepoAgentMcpServer.ServerName}__", "harness", _audit.Recent(5000), s.Key, ArchAgentService.ActorHuman);
        return Ok(payload);
    }

    /// <summary>The Loops lane: the goal loop the engine drives this goal conversation with (key
    /// <c>&lt;repo&gt;~goal~&lt;id&gt;</c>) — kind, mode, turns, status and stop reason — plus the engine's last
    /// decision for it and its recent log lines. Stop / Continue stay on the existing routes.</summary>
    [HttpGet("{id}/loop")]
    public IActionResult Loop(string id)
    {
        _logger.CountRequest();
        var s = _subagents.Find(id);
        if (s is null) return NotFound(new { error = $"no goal conversation {id}" });
        var loop = _loops.Get(s.Key);
        var engine = _engine.DebugSnapshot(s.Key, null);
        return Ok(new
        {
            key = s.Key,
            state = s.State,
            loop = loop is null ? null : new
            {
                kind = loop.Kind, mode = loop.Mode, active = loop.Active, status = loop.Status, phase = loop.Phase,
                iterationsDone = loop.IterationsDone, maxIterations = loop.MaxIterations,
                stopReason = loop.StopReason, stopDetail = loop.StopDetail,
                armedAt = loop.ArmedAt, lastSentAt = loop.LastSentAt, armedBy = loop.ArmedBy,
                sessionId = loop.SessionId, sentinel = loop.Sentinel,
                goal = loop.Goal,
            },
            engine = new
            {
                busy = engine.Busy,
                tickSeconds = engine.TickSeconds,
                decision = engine.State?.Decision,
                reason = engine.State?.Reason,
                updatedAt = engine.State?.UpdatedAt,
                lastSent = engine.LastDriveSentSnippet,
            },
            writerBlock = _subagents.WriterBlock(s.Key),
        });
    }

    private List<string> SessionsOf(RepoSubagentStore.Subagent s)
    {
        var list = (s.Sessions ?? Array.Empty<string>()).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        if (!string.IsNullOrWhiteSpace(s.SessionId) && !list.Contains(s.SessionId)) list.Add(s.SessionId);
        return list;
    }

    [HttpGet("{id}/stream")]
    public async Task Stream(string id, [FromQuery] int after = 0)
    {
        _logger.CountRequest();
        var s = _subagents.Find(id);
        var session = s is null ? null : _runs.Get(s.Key);
        if (session is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { error = "No goal conversation run yet." });
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
        catch (OperationCanceledException) { /* client detached; the turn keeps running */ }
    }

    [HttpPost("{id}/stop")]
    public IActionResult Stop(string id)
    {
        _logger.CountRequest();
        var o = _subagents.Stop(id, LoopConfigStore.ArmedByOperator);
        return o.Ok || o.Status != "error" ? Ok(Envelope(o)) : NotFound(Envelope(o));
    }

    public sealed record TextRequest(string? Text);

    [HttpPost("{id}/message")]
    public IActionResult Message(string id, [FromBody] TextRequest? req)
    {
        _logger.CountRequest();
        return Ok(Envelope(_subagents.Message(id, req?.Text, LoopConfigStore.ArmedByOperator)));
    }

    /// <summary>The answer box of a held subagent (the same path as message; named for the panel).</summary>
    [HttpPost("{id}/answer")]
    public IActionResult Answer(string id, [FromBody] TextRequest? req)
    {
        _logger.CountRequest();
        return Ok(Envelope(_subagents.Message(id, req?.Text, LoopConfigStore.ArmedByOperator)));
    }

    public sealed record ContinueRequest(int? MaxIterations);

    [HttpPost("{id}/continue")]
    public IActionResult Continue(string id, [FromBody] ContinueRequest? req)
    {
        _logger.CountRequest();
        if (!_gate.Enabled) return StatusCode(StatusCodes.Status403Forbidden, new { error = "Autopilot is disabled by the operator.", gate = "operator-off" });
        return Ok(Envelope(_subagents.Continue(id, req?.MaxIterations, LoopConfigStore.ArmedByOperator)));
    }

    public sealed record StepRequest(string? State, string? Note, JsonNode? Evidence, int? Counter);

    [HttpPost("{id}/steps/{step}")]
    public IActionResult MarkStep(string id, string step, [FromBody] StepRequest? req)
    {
        _logger.CountRequest();
        return Ok(Envelope(_subagents.MarkStep(id, step, req?.State, req?.Note, ArchGoalPlans.ParseEvidence(req?.Evidence), req?.Counter, LoopConfigStore.ArmedByOperator, null)));
    }

    public sealed record PlanRequest(string? Action, string? Step, string? Title, string? Done, string? Kind, int? To, JsonNode? Steps);

    [HttpPost("{id}/plan")]
    public IActionResult EditPlan(string id, [FromBody] PlanRequest? req)
    {
        _logger.CountRequest();
        var steps = ArchGoalPlans.ParseSteps(req?.Steps, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        return Ok(Envelope(_subagents.EditPlan(id, req?.Action, req?.Step, req?.Title, req?.Done, req?.Kind, req?.To, steps.Count > 0 ? steps : null, LoopConfigStore.ArmedByOperator, null)));
    }

    [HttpDelete("{id}")]
    public IActionResult Remove(string id)
    {
        _logger.CountRequest();
        return _subagents.Remove(id) ? Ok(new { removed = true }) : NotFound(new { error = $"no ended goal conversation {id}" });
    }
}
