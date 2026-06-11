using System.Text;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Terminal;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Terminal tab endpoints (plans/terminal-tab.md): a backend-owned PowerShell
/// per repo on a ConPTY pseudo-console. The shell is owned by
/// TerminalSessionService, never by an HTTP connection — disconnects drop
/// only the SSE attachment. Auth is the global PasswordAuthMiddleware.
/// </summary>
[ApiController]
[Route("api/terminal")]
public class TerminalController : ControllerBase
{
    private const short MinDim = 10, MaxCols = 400, MaxRows = 200;

    private readonly TerminalSessionService _terminals;
    private readonly RepositoryResolver _repos;
    private readonly Logger _logger;

    public TerminalController(TerminalSessionService terminals, RepositoryResolver repos, Logger logger)
    {
        _terminals = terminals;
        _repos = repos;
        _logger = logger;
    }

    public record StartRequest(short? Cols, short? Rows);
    public record InputRequest(string? Data);
    public record ResizeRequest(short Cols, short Rows);

    /// <summary>Ensures a live PowerShell for the repo (idempotent; restarts a
    /// dead one). cwd is the repo root.</summary>
    [HttpPost("start")]
    public IActionResult Start([FromBody] StartRequest? request)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        var cols = Clamp(request?.Cols ?? 100, MinDim, MaxCols);
        var rows = Clamp(request?.Rows ?? 30, MinDim, MaxRows);
        var session = _terminals.Ensure(repo.Id, repo.Path, cols, rows);
        return Ok(new { running = session.IsRunning, cols = session.Cols, rows = session.Rows });
    }

    /// <summary>Session status for reconcile on mount.</summary>
    [HttpGet]
    public IActionResult Status()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        var session = _terminals.Get(repo.Id);
        return Ok(new
        {
            running = session?.IsRunning ?? false,
            cols = session?.Cols,
            rows = session?.Rows,
        });
    }

    /// <summary>
    /// One SSE attachment: replays the whole output buffer (the client resets
    /// its xterm first), then streams live output. RequestAborted ends only
    /// this attachment; the shell keeps running.
    /// </summary>
    [HttpGet("stream")]
    public async Task Stream()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        var session = repo is null ? null : _terminals.Get(repo.Id);
        if (session is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { error = "No terminal for this repository." });
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

    /// <summary>Writes raw input to the PTY. The client maps composer text and
    /// special keys to bytes (e.g. "\r", "\x1b[A"); the server just writes.</summary>
    [HttpPost("input")]
    public async Task<IActionResult> Input([FromBody] InputRequest? request)
    {
        _logger.CountRequest();
        if (string.IsNullOrEmpty(request?.Data)) return BadRequest(new { error = "data is required" });

        var repo = _repos.Current();
        var session = repo is null ? null : _terminals.Get(repo.Id);
        if (session is null || !session.IsRunning)
            return NotFound(new { error = "No running terminal for this repository." });

        await session.WriteAsync(request.Data);
        return Ok(new { sent = true });
    }

    [HttpPost("resize")]
    public IActionResult Resize([FromBody] ResizeRequest request)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        var session = repo is null ? null : _terminals.Get(repo.Id);
        if (session is null || !session.IsRunning)
            return NotFound(new { error = "No running terminal for this repository." });

        session.Resize(Clamp(request.Cols, MinDim, MaxCols), Clamp(request.Rows, MinDim, MaxRows));
        return Ok(new { cols = session.Cols, rows = session.Rows });
    }

    /// <summary>Kills the shell and its pseudo-console.</summary>
    [HttpPost("kill")]
    public IActionResult Kill()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });

        return _terminals.Kill(repo.Id)
            ? Ok(new { killed = true })
            : NotFound(new { error = "No terminal for this repository." });
    }

    private static short Clamp(short value, short min, short max) =>
        value < min ? min : value > max ? max : value;
}
