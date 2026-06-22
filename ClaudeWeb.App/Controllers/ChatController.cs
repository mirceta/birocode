using System.Text;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Chat endpoints (M1). Auto-discovered by AddControllers() -- no Program.cs
/// changes needed. Password auth is applied globally by PasswordAuthMiddleware.
///
///   POST /api/chat        -- starts a detached Run, streams it as SSE.
///   GET  /api/chat/stream  -- reattaches to the repo's Run (replay + live).
///   POST /api/chat/stop    -- cancels the repo's Run (kills the CLI).
///   GET  /api/runs         -- per-repo run status for reconciliation.
///   GET  /api/sessions     -- lists prior sessions for the working directory.
///
/// The Run is owned by RunSessionService, not by the HTTP connection: a client
/// disconnect (phone lock, tab close) drops only the SSE attachment while the
/// CLI keeps working. See plans/detached-runs.md.
/// </summary>
[ApiController]
[Route("api")]
public class ChatController : ControllerBase
{
    private readonly CliRunnerService _cli;
    private readonly RunSessionService _runs;
    private readonly SessionService _sessions;
    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public ChatController(CliRunnerService cli, RunSessionService runs, SessionService sessions, RepositoryResolver repos, Logger logger)
    {
        _cli = cli;
        _runs = runs;
        _sessions = sessions;
        _repos = repos;
        _logger = logger;
    }

    /// <summary>Request body for POST /api/chat. <c>Lane</c> selects the run lane:
    /// <c>builder</c> (default, full capability) or <c>ask</c> (read-only side
    /// conversation that can run concurrently with the builder — see
    /// plans/repo-ask-chat.md).</summary>
    public record ChatRequest(string? Message, string? SessionId, string? Model, string? Lane);

    /// <summary>Only two lanes exist; anything unrecognized falls back to the
    /// builder so a stray value can never spawn an unexpected run mode.</summary>
    private static string NormalizeLane(string? lane) => lane == "ask" ? "ask" : "builder";

    /// <summary>
    /// Starts one detached chat turn and attaches this response to it as SSE.
    /// The Run executes on a background task with the Run Session's own token,
    /// so dropping this connection leaves the CLI working; reattach via
    /// GET /api/chat/stream. Only one turn runs at a time per repo -- 409.
    /// </summary>
    [HttpPost("chat")]
    public async Task Chat([FromBody] ChatRequest? request)
    {
        _logger.CountRequest();

        var message = request?.Message;
        if (string.IsNullOrWhiteSpace(message))
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsJsonAsync(new { error = "message is required" });
            return;
        }

        var repo = _repos.Current();
        if (repo is null)
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsJsonAsync(new { error = "No repository selected or configured." });
            return;
        }

        // Per-(repo, lane) single-flight: a turn already running on THIS repo's
        // lane is rejected, but other repos -- and the repo's OTHER lane (builder
        // vs read-only ask) -- can run concurrently (plans/repo-ask-chat.md).
        var lane = NormalizeLane(request?.Lane);
        if (!_runs.TryBeginRun(repo.Id, lane, out var session))
        {
            _logger.Info($"[CHAT] Rejected: a {lane} turn is already running for \"{repo.Name}\".");
            Response.StatusCode = StatusCodes.Status409Conflict;
            await Response.WriteAsJsonAsync(new { error = "Another chat request is already in progress for this project." });
            return;
        }

        _logger.Info(string.IsNullOrWhiteSpace(request?.SessionId)
            ? "[CHAT] New chat turn (detached)"
            : $"[CHAT] Resume chat turn (session {request!.SessionId}, detached)");

        // The Run itself: background task, Run Session token (NOT RequestAborted).
        var sessionId = request?.SessionId;
        var model = request?.Model;
        var path = repo.Path;
        var readOnly = lane == "ask"; // the ask lane runs claude in read-only plan mode
        _ = Task.Run(async () =>
        {
            try
            {
                await _cli.RunAsync(
                    message,
                    sessionId,
                    workingDirectory: path,
                    model: model,
                    emit: session.EmitAsync,
                    ct: session.Cts.Token,
                    readOnly: readOnly);
            }
            catch (Exception ex)
            {
                _logger.Error($"[CHAT] Detached run crashed: {ex.Message}");
            }
            finally
            {
                session.Complete();
            }
        });

        // This response is just the first attachment.
        await AttachAsync(session, after: 0);
    }

    /// <summary>
    /// Reattaches to the repo's Run: replays buffered events with
    /// seq &gt; <paramref name="after"/>, then streams live ones. Also works
    /// after the Run finished (replay only), so a reopened tab can catch up.
    /// </summary>
    [HttpGet("chat/stream")]
    public async Task ChatStream([FromQuery] int after = 0, [FromQuery] string? lane = null)
    {
        _logger.CountRequest();

        var laneName = NormalizeLane(lane);
        var repo = _repos.Current();
        var session = repo is null ? null : _runs.Get(repo.Id, laneName);
        if (session is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { error = "No run found for this repository." });
            return;
        }

        _logger.Info($"[CHAT] Reattach to {laneName} run in \"{repo!.Name}\" (after seq {after}, status {session.Status})");
        await AttachAsync(session, after);
    }

    /// <summary>Explicitly stops the repo's running turn (kills the CLI process
    /// tree). The only way a Run dies early -- disconnects no longer stop it.</summary>
    [HttpPost("chat/stop")]
    public IActionResult ChatStop([FromQuery] string? lane = null)
    {
        _logger.CountRequest();

        var laneName = NormalizeLane(lane);
        var repo = _repos.Current();
        var session = repo is null ? null : _runs.Get(repo.Id, laneName);
        if (session is null || session.Status != "running")
            return NotFound(new { error = "No running turn for this repository." });

        _logger.Info($"[CHAT] Stop requested for {laneName} run in \"{repo!.Name}\"");
        session.Cts.Cancel();
        return Ok(new { stopped = true });
    }

    /// <summary>Per-repo run state so the frontend can reconcile tab status on
    /// load/unlock and decide whether to reattach.</summary>
    [HttpGet("runs")]
    public IActionResult Runs()
    {
        _logger.CountRequest();
        return Ok(_runs.Snapshot());
    }

    /// <summary>One SSE attachment to a Run Session. RequestAborted ends only
    /// this attachment; the Run keeps going.</summary>
    private async Task AttachAsync(RunSession session, int after)
    {
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
            // Client detached (screen lock, tab close) -- the Run continues.
            _logger.Info("[CHAT] Client detached from stream; run continues.");
        }
    }

    /// <summary>Lists prior sessions for the selected repository, newest first.</summary>
    [HttpGet("sessions")]
    public IActionResult Sessions()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        var sessions = _sessions.ListSessions(repo.Path);
        _logger.Info($"[CHAT] Listed {sessions.Count} session(s) for \"{repo.Name}\"");
        return Ok(sessions);
    }

    /// <summary>
    /// Returns the human-visible transcript (user + assistant text, in order) for
    /// one session, so the UI can show a past conversation when it is reopened.
    /// </summary>
    [HttpGet("sessions/{id}/messages")]
    public IActionResult SessionMessages(string id)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        var messages = _sessions.GetMessages(repo.Path, id);
        _logger.Info($"[CHAT] Loaded {messages.Count} message(s) for session {id}");
        return Ok(messages);
    }

    /// <summary>
    /// Returns the tool-call history (tool_use paired with tool_result, in order)
    /// for one session, reconstructed from the JSONL transcript. Unlike the
    /// message transcript above, this keeps the tool blocks — it's the durable
    /// source for the Tool calls panel after a reload (plans: add-tool-call-history).
    /// </summary>
    [HttpGet("sessions/{id}/tools")]
    public IActionResult SessionTools(string id)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        var tools = _sessions.GetToolCalls(repo.Path, id);
        _logger.Info($"[CHAT] Loaded {tools.Count} tool call(s) for session {id}");
        return Ok(tools);
    }

}
