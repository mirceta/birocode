using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Recurring;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>Recurring tasks (openspec recurring-tasks): the Management App's Recurring tab.
/// Reading is open to the signed-in Operator (instructions are withheld while the autopilot
/// gate is closed, the loop console's rule). Every mutation goes through
/// <see cref="RecurringCommands"/> — the same service the arch agent's tools use (fleet task
/// 933709ea), so the tab and the arch share one store and one rule book: on a prompt-driven
/// card create / edit / resume / run now answer 403 while the gate is closed; pause, stop
/// and delete only ever REDUCE automation, so they work with the gate closed; a
/// tracking-only card never sends anything, so the gate does not apply to it.</summary>
[ApiController]
[Route("api/recurring")]
public sealed class RecurringController : ControllerBase
{
    private readonly RecurringTaskStore _store;
    private readonly RecurringRunLog _log;
    private readonly RecurringEngine _engine;
    private readonly RecurringCommands _commands;
    private readonly Logger _logger;

    public RecurringController(RecurringTaskStore store, RecurringRunLog log, RecurringEngine engine, RecurringCommands commands, AutopilotGate gate, Logger logger)
    {
        _store = store; _log = log; _engine = engine; _commands = commands; _logger = logger;
    }

    private const string Operator = "operator";

    private IActionResult Answer(RecurringCommands.Result r) =>
        r.Ok ? Ok(_engine.Board())
        : StatusCode(r.Http, new { error = r.Error, gate = r.Http == 403 ? "operator-off" : null });

    [HttpGet]
    public IActionResult Board()
    {
        _logger.CountRequest();
        return Ok(_engine.Board());
    }

    [HttpGet("{id}/runs")]
    public IActionResult Runs(string id, [FromQuery] int limit = 50, [FromQuery] long? before = null)
    {
        _logger.CountRequest();
        if (_store.Get(id) is null) return NotFound(new { error = "no such recurring task" });
        return Ok(new { runs = _log.Runs(id, limit, before).Select(RecurringEngine.RunView), total = _log.Count(id) });
    }

    [HttpPost]
    public IActionResult Create([FromBody] RecurringCommands.TaskRequest? req)
    {
        _logger.CountRequest();
        if (req is null) return BadRequest(new { error = "a body is required" });
        return Answer(_commands.Create(req, Operator));
    }

    [HttpPatch("{id}")]
    public IActionResult Edit(string id, [FromBody] RecurringCommands.TaskRequest? req)
    {
        _logger.CountRequest();
        if (req is null) return BadRequest(new { error = "a body is required" });
        return Answer(_commands.Edit(id, req, Operator));
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id)
    {
        _logger.CountRequest();
        return Answer(_commands.Delete(id, Operator));
    }

    [HttpPost("{id}/pause")]
    public IActionResult Pause(string id)
    {
        _logger.CountRequest();
        return Answer(_commands.Pause(id, Operator));
    }

    [HttpPost("{id}/resume")]
    public IActionResult Resume(string id)
    {
        _logger.CountRequest();
        return Answer(_commands.Resume(id, Operator));
    }

    [HttpPost("{id}/run")]
    public IActionResult RunNow(string id)
    {
        _logger.CountRequest();
        var r = _engine.RunNow(id);
        return r.Ok ? Ok(_engine.Board()) : StatusCode(r.Http, new { error = r.Detail, gate = r.Http == 403 ? "operator-off" : null });
    }

    [HttpPost("{id}/stop")]
    public IActionResult Stop(string id)
    {
        _logger.CountRequest();
        var r = _engine.StopRun(id);
        if (!r.Ok) return StatusCode(r.Http, new { error = r.Detail });
        _engine.Tick();   // close the run now rather than on the next 10 s tick
        return Ok(_engine.Board());
    }
}
