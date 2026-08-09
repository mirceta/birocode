using System.Text;
using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.LoopEval;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Start/watch/stop live-mode loop-eval runs from the Tests tab (openspec:
/// add-loop-eval-ui-runner).
///
///   GET    /api/loopeval/preflight      — read-only precondition report + scenario catalog
///   POST   /api/loopeval/runs           — start a scenario ({scenario}); 409 while one is active
///   GET    /api/loopeval/runs/current   — current (or last) run snapshot
///   DELETE /api/loopeval/runs/current   — stop: kill the run's whole process tree
///   GET    /api/loopeval/runs/stream    — SSE: fresh snapshot on every state/tail/verdict change
///   POST   /api/loopeval/fixture/finish — FINISH AGENT: deferred teardown of the kept fixture
///
/// Behind the normal session auth like every /api route, and deliberately NOT
/// fenced by the autopilot operator gate: the preflight must be readable while
/// the gate is off to tell the operator where to enable it (design D4), and
/// starting is harmless then — the suite's own live preflight fails fast
/// without spending agent turns. Neither layer can enable anything.
/// </summary>
[ApiController]
[Route("api/loopeval")]
public class LoopEvalController : ControllerBase
{
    private readonly LoopEvalRunnerService _runner;
    private readonly Logger _logger;

    public LoopEvalController(LoopEvalRunnerService runner, Logger logger)
    {
        _runner = runner;
        _logger = logger;
    }

    [HttpGet("preflight")]
    public IActionResult Preflight()
    {
        _logger.CountRequest();
        return Ok(_runner.Preflight());
    }

    public sealed record StartRequest(string? Scenario);

    [HttpPost("runs")]
    public IActionResult Start([FromBody] StartRequest? req)
    {
        _logger.CountRequest();
        var (status, body) = _runner.Start(req?.Scenario);
        return StatusCode(status, body);
    }

    [HttpGet("runs/current")]
    public IActionResult Current()
    {
        _logger.CountRequest();
        return Ok(_runner.Current());
    }

    [HttpDelete("runs/current")]
    public IActionResult Stop()
    {
        _logger.CountRequest();
        var (status, body) = _runner.Stop();
        return StatusCode(status, body);
    }

    /// <summary>FINISH AGENT: tear down the kept fixture (stop loop, close dock
    /// tab, unregister repo card, delete the scratch copy) once the operator is
    /// done watching. The dock stays visible after a run's verdict until this
    /// is called (openspec: loop-eval-watchable-dock).</summary>
    [HttpPost("fixture/finish")]
    public IActionResult FinishFixture()
    {
        _logger.CountRequest();
        var (status, body) = _runner.FinishFixture();
        return StatusCode(status, body);
    }

    /// <summary>One SSE attachment for the Tests tab: sends a full run snapshot
    /// whenever it changes (same proxy-safe headers as the chat stream), plus a
    /// comment heartbeat so idle proxies don't drop the connection.</summary>
    [HttpGet("runs/stream")]
    public async Task Stream()
    {
        _logger.CountRequest();
        Response.StatusCode = StatusCodes.Status200OK;
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";

        var lastKey = "";
        var lastWrite = DateTime.UtcNow;
        try
        {
            while (!HttpContext.RequestAborted.IsCancellationRequested)
            {
                var (key, snapshot) = _runner.StreamState();
                if (key != lastKey)
                {
                    await WriteAsync($"data: {JsonSerializer.Serialize(snapshot)}\n\n");
                    lastKey = key;
                    lastWrite = DateTime.UtcNow;
                }
                else if (DateTime.UtcNow - lastWrite > TimeSpan.FromSeconds(15))
                {
                    await WriteAsync(": keep-alive\n\n");
                    lastWrite = DateTime.UtcNow;
                }
                await Task.Delay(500, HttpContext.RequestAborted);
            }
        }
        catch (OperationCanceledException)
        {
            // Client detached (tab close, screen lock) — the run continues.
        }
    }

    private async Task WriteAsync(string chunk)
    {
        var bytes = Encoding.UTF8.GetBytes(chunk);
        await Response.Body.WriteAsync(bytes, HttpContext.RequestAborted);
        await Response.Body.FlushAsync(HttpContext.RequestAborted);
    }
}
