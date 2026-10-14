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
    private readonly Logger _logger;

    public SubagentsController(RepoSubagentService subagents, RepositoryRegistry repos, RunSessionService runs, SessionService sessions, AutopilotAuditLog audit, AutopilotGate gate, Logger logger)
    {
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
