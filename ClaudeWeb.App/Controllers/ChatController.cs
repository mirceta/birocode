using System.Text;
using System.Text.Json;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Chat endpoints (M1). Auto-discovered by AddControllers() -- no Program.cs
/// changes needed. Password auth is applied globally by PasswordAuthMiddleware.
///
///   POST /api/chat     -- streams a Claude turn as Server-Sent Events.
///   GET  /api/sessions -- lists prior sessions for the working directory.
/// </summary>
[ApiController]
[Route("api")]
public class ChatController : ControllerBase
{
    private readonly CliRunnerService _cli;
    private readonly SessionService _sessions;
    private readonly Logger _logger;

    private static readonly JsonSerializerOptions SseJson = new()
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    public ChatController(CliRunnerService cli, SessionService sessions, Logger logger)
    {
        _cli = cli;
        _sessions = sessions;
        _logger = logger;
    }

    /// <summary>Request body for POST /api/chat.</summary>
    public record ChatRequest(string? Message, string? SessionId);

    /// <summary>
    /// Streams one chat turn. The CLI runner translates raw stream-json into
    /// the stable SSE contract; we just forward each event as
    /// <c>data: &lt;json&gt;\n\n</c> and flush. Only one turn runs at a time --
    /// concurrent requests get 409.
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

        if (!_cli.TryBeginRun())
        {
            _logger.Info("[CHAT] Rejected: a chat turn is already running.");
            Response.StatusCode = StatusCodes.Status409Conflict;
            await Response.WriteAsJsonAsync(new { error = "Another chat request is already in progress." });
            return;
        }

        // From here on the CLI slot is claimed; RunAsync always releases it.
        Response.StatusCode = StatusCodes.Status200OK;
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";

        _logger.Info(string.IsNullOrWhiteSpace(request?.SessionId)
            ? "[CHAT] New chat turn"
            : $"[CHAT] Resume chat turn (session {request!.SessionId})");

        await _cli.RunAsync(
            message,
            request?.SessionId,
            emit: evt => WriteSseAsync(evt),
            ct: HttpContext.RequestAborted);
    }

    /// <summary>Lists prior sessions for the current working directory, newest first.</summary>
    [HttpGet("sessions")]
    public IActionResult Sessions()
    {
        _logger.CountRequest();
        var sessions = _sessions.ListSessions();
        _logger.Info($"[CHAT] Listed {sessions.Count} session(s)");
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
        var messages = _sessions.GetMessages(id);
        _logger.Info($"[CHAT] Loaded {messages.Count} message(s) for session {id}");
        return Ok(messages);
    }

    private async Task WriteSseAsync(object evt)
    {
        var json = JsonSerializer.Serialize(evt, SseJson);
        var bytes = Encoding.UTF8.GetBytes($"data: {json}\n\n");
        await Response.Body.WriteAsync(bytes, HttpContext.RequestAborted);
        await Response.Body.FlushAsync(HttpContext.RequestAborted);
    }
}
