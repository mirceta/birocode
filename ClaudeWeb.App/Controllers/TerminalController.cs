using System.Text;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Terminal;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Terminal endpoints (plans/terminal-tab.md, multi-session + resume since
/// plans/terminal-sessions.md): backend-owned PowerShells per repo on ConPTY
/// pseudo-consoles, several per repo, keyed by termId. Shells are owned by
/// TerminalSessionService, never by an HTTP connection — disconnects drop
/// only the SSE attachment. Auth is the global PasswordAuthMiddleware.
/// </summary>
[ApiController]
[Route("api/terminal")]
public partial class TerminalController : ControllerBase
{
    private const short MinDim = 10, MaxCols = 400, MaxRows = 200;

    // resumeSessionId lands on a PowerShell command line — allow only claude
    // session-id characters so it cannot smuggle shell syntax.
    [GeneratedRegex("^[A-Za-z0-9_-]{1,128}$")]
    private static partial Regex SafeSessionId();

    private readonly TerminalSessionService _terminals;
    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public TerminalController(TerminalSessionService terminals, RepositoryResolver repos, Logger logger)
    {
        _terminals = terminals;
        _repos = repos;
        _logger = logger;
    }

    public record StartRequest(string? TermId, string? Label, short? Cols, short? Rows, string? ResumeSessionId);
    public record InputRequest(string? TermId, string? Data);
    public record ResizeRequest(string? TermId, short Cols, short Rows);
    public record KillRequest(string? TermId);

    private static object Describe(TerminalSession s) => new
    {
        termId = s.TermId,
        label = s.Label,
        running = s.IsRunning,
        cols = s.Cols,
        rows = s.Rows,
        resumeSessionId = s.ResumeSessionId,
    };

    /// <summary>
    /// Starts a new shell for the repo (or returns the live one when TermId
    /// matches). With ResumeSessionId, the new shell auto-runs
    /// `claude --resume &lt;id&gt;` — decision (a): you land mid-conversation.
    /// </summary>
    [HttpPost("start")]
    public IActionResult Start([FromBody] StartRequest? request)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        var resume = request?.ResumeSessionId;
        if (resume is not null && !SafeSessionId().IsMatch(resume))
            return BadRequest(new { error = "Invalid resume session id." });

        var cols = Clamp(request?.Cols ?? 100, MinDim, MaxCols);
        var rows = Clamp(request?.Rows ?? 30, MinDim, MaxRows);
        try
        {
            var session = _terminals.Ensure(repo.Id, request?.TermId, request?.Label, repo.Path, cols, rows, resume);
            return Ok(Describe(session));
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    /// <summary>Live shells for the repo, oldest first.</summary>
    [HttpGet("list")]
    public IActionResult ListSessions()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        return Ok(_terminals.List(repo.Id).Select(Describe));
    }

    /// <summary>
    /// One SSE attachment to one shell: replays the whole output buffer (the
    /// client resets its xterm first), then streams live. RequestAborted ends
    /// only this attachment; the shell keeps running.
    /// </summary>
    [HttpGet("stream")]
    public async Task Stream([FromQuery] string? termId)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        var session = repo is null || termId is null ? null : _terminals.Get(repo.Id, termId);
        if (session is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { error = "No such terminal for this repository." });
            return;
        }

        Response.StatusCode = StatusCodes.Status200OK;
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";

        try
        {
            await foreach (var json in session.StreamAsync(HttpContext.RequestAborted))
            {
                var bytes = Encoding.UTF8.GetBytes($"data: {json}\n\n");
                await Response.Body.WriteAsync(bytes, HttpContext.RequestAborted);
                await Response.Body.FlushAsync(HttpContext.RequestAborted);
            }
        }
        catch (OperationCanceledException)
        {
            // Client detached (screen lock, tab close) — the shell continues.
        }
    }

    /// <summary>Writes raw input to one shell's PTY. The client maps composer
    /// text and special keys to bytes; the server just writes.</summary>
    [HttpPost("input")]
    public async Task<IActionResult> Input([FromBody] InputRequest? request)
    {
        _logger.CountRequest();
        if (string.IsNullOrEmpty(request?.Data)) return BadRequest(new { error = "data is required" });
        if (string.IsNullOrEmpty(request.TermId)) return BadRequest(new { error = "termId is required" });

        var repo = _repos.Current();
        var session = repo is null ? null : _terminals.Get(repo.Id, request.TermId);
        if (session is null || !session.IsRunning)
            return NotFound(new { error = "No such running terminal for this repository." });

        await session.WriteAsync(request.Data);
        return Ok(new { sent = true });
    }

    [HttpPost("resize")]
    public IActionResult Resize([FromBody] ResizeRequest? request)
    {
        _logger.CountRequest();
        if (string.IsNullOrEmpty(request?.TermId)) return BadRequest(new { error = "termId is required" });

        var repo = _repos.Current();
        var session = repo is null ? null : _terminals.Get(repo.Id, request.TermId);
        if (session is null || !session.IsRunning)
            return NotFound(new { error = "No such running terminal for this repository." });

        session.Resize(Clamp(request.Cols, MinDim, MaxCols), Clamp(request.Rows, MinDim, MaxRows));
        return Ok(new { cols = session.Cols, rows = session.Rows });
    }

    /// <summary>Kills one shell and its pseudo-console.</summary>
    [HttpPost("kill")]
    public IActionResult Kill([FromBody] KillRequest? request)
    {
        _logger.CountRequest();
        if (string.IsNullOrEmpty(request?.TermId)) return BadRequest(new { error = "termId is required" });

        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        return _terminals.Kill(repo.Id, request.TermId)
            ? Ok(new { killed = true })
            : NotFound(new { error = "No such terminal for this repository." });
    }

    private static short Clamp(short value, short min, short max) =>
        value < min ? min : value > max ? max : value;
}
