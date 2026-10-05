using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Claude-in-Chrome integration status (openspec claude-in-chrome). Behind the
/// global session+IP gate like everything under /api.
///   GET /api/chrome/status -- can browser mode work on this host, and is the
///                             single-holder pipe currently taken by a run
/// </summary>
[ApiController]
[Route("api/chrome")]
public class ChromeController : ControllerBase
{
    private readonly ChromeGateService _chrome;
    private readonly ChromePreflightService _preflight;
    private readonly Logger _logger;

    public ChromeController(ChromeGateService chrome, ChromePreflightService preflight, Logger logger)
    {
        _chrome = chrome;
        _preflight = preflight;
        _logger = logger;
    }

    /// <summary>The Claude-for-Chrome readiness section of the status strip (openspec
    /// chrome-readiness-preflight): one overall state and the individual checks, from a cached
    /// snapshot — polled like the other strip sections, and it never starts a process.</summary>
    [HttpGet("preflight")]
    public IActionResult Preflight()
    {
        _logger.CountRequest();
        return Ok(View(_preflight.Current(), null, null));
    }

    /// <summary>Re-run: re-read the static facts now and start the live probe — one short real
    /// agent turn with <c>--chrome</c>. Answers at once; the probe's result arrives through
    /// the polled GET. Refused (and said so) while a real browser turn holds the browser.</summary>
    [HttpPost("preflight/run")]
    public IActionResult PreflightRun()
    {
        _logger.CountRequest();
        var (snap, started, why) = _preflight.Rerun();
        return Ok(View(snap, started, why));
    }

    private static object View(ChromePreflightService.Snapshot s, bool? probeStarted, string? notStartedWhy) => new
    {
        overall = s.Overall,
        at = s.At,
        staticAt = s.StaticAt,
        probeRunning = s.ProbeRunning,
        probeStarted,
        probeNotStartedWhy = notStartedWhy,
        probe = s.Probe is null ? null : new { at = s.Probe.At, tookMs = s.Probe.TookMs, outcome = s.Probe.Outcome, detail = s.Probe.Detail },
        checks = s.Checks.Select(c => new { id = c.Id, label = c.Label, state = c.State, detail = c.Detail, fix = c.Fix }),
        counts = new
        {
            pass = s.Checks.Count(c => c.State == ChromePreflightRules.Pass), fail = s.Checks.Count(c => c.State == ChromePreflightRules.Fail),
            warn = s.Checks.Count(c => c.State == ChromePreflightRules.Warn), unknown = s.Checks.Count(c => c.State == ChromePreflightRules.Unknown),
            info = s.Checks.Count(c => c.State == ChromePreflightRules.Info),
        },
    };

    [HttpGet("status")]
    public IActionResult Status()
    {
        _logger.CountRequest();
        var hostRegistered = _chrome.HostRegistered();
        var cliSupported = _chrome.CliSupported();
        var (busy, repo, repoId) = _chrome.HolderState();
        return Ok(new
        {
            available = hostRegistered && cliSupported,
            hostRegistered,
            cliSupported,
            busy,
            busyRepo = repo,
            busyRepoId = repoId,
        });
    }
}
