using ClaudeWeb.Services.AgenticAudit;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.StructuredAsk;
using ClaudeWeb.Services.Understanding;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Read-only agentic-call audit trail (openspec change add-agent-audit-trail).
/// Lists every recorded invocation of an agentic feature — discover-local-apps
/// and ask-for-understanding — merged from the append-only store's started +
/// terminal entry pairs into one call row each, newest first.
///
///   GET /api/agentic-audit?feature=&repo=&outcome=&limit=
///
/// Returns { calls: [ { callId, feature, repoId, repoName, actor, ip, startedAt,
/// outcome, durationMs?, error? } ] } where outcome is done | error | canceled |
/// running | interrupted. A started entry with no terminal is "running" only when
/// the matching job registry still holds a LIVE job for that callId; otherwise the
/// process died mid-run and it reports "interrupted" — never a phantom "running".
///
/// Deliberately NO mutating verbs on this controller: the store is append-only
/// and the spec forbids web mutation, so nothing to lock down exists. Sits behind
/// the normal auth gates like every other /api route.
/// </summary>
[ApiController]
[Route("api/agentic-audit")]
public class AgenticAuditController : ControllerBase
{
    private readonly AgenticAuditLog _log;
    private readonly LocalAppDiscoveryJobs _discoveryJobs;
    private readonly UnderstandingJobs _understandingJobs;
    private readonly Logger _logger;

    public AgenticAuditController(AgenticAuditLog log, LocalAppDiscoveryJobs discoveryJobs,
        UnderstandingJobs understandingJobs, Logger logger)
    {
        _log = log;
        _discoveryJobs = discoveryJobs;
        _understandingJobs = understandingJobs;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult List([FromQuery] string? feature = null, [FromQuery] string? repo = null,
        [FromQuery] string? outcome = null, [FromQuery] int limit = 100)
    {
        _logger.CountRequest();
        limit = Math.Clamp(limit, 1, 500);

        // Merge the raw entry stream (chronological) into one row per callId:
        // the started entry carries the call metadata, the terminal entry (if
        // any) supplies outcome + duration + error.
        var calls = new Dictionary<string, Call>();
        var order = new List<Call>();
        foreach (var e in _log.Recent())
        {
            if (e.Kind == "started")
            {
                var call = new Call(e.CallId, e.Feature, e.RepoId, e.RepoName, e.Actor, e.Ip, e.Ts);
                calls[e.CallId] = call;
                order.Add(call);
            }
            else if (calls.TryGetValue(e.CallId, out var call))
            {
                call.Outcome = e.Kind;
                call.DurationMs = e.DurationMs;
                call.Error = e.Error;
            }
        }

        foreach (var call in order)
            call.Outcome ??= IsLive(call) ? "running" : "interrupted";

        IEnumerable<Call> result = Enumerable.Reverse(order); // newest first
        if (!string.IsNullOrWhiteSpace(feature))
            result = result.Where(c => string.Equals(c.Feature, feature, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(repo))
            result = result.Where(c =>
                string.Equals(c.RepoId, repo, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(c.RepoName, repo, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(outcome))
            result = result.Where(c => string.Equals(c.Outcome, outcome, StringComparison.OrdinalIgnoreCase));

        return Ok(new
        {
            calls = result.Take(limit).Select(c => new
            {
                callId = c.CallId,
                feature = c.Feature,
                repoId = c.RepoId,
                repoName = c.RepoName,
                actor = c.Actor,
                ip = c.Ip,
                startedAt = c.StartedAt,
                outcome = c.Outcome,
                durationMs = c.DurationMs,
                error = c.Error,
            }),
        });
    }

    // A started-without-terminal call is genuinely running only if the feature's
    // job registry still holds THIS call's job (matched by callId) and it hasn't
    // reached a terminal status. After a restart the registries are empty, so
    // every orphaned start correctly reports interrupted.
    private bool IsLive(Call call) => call.Feature switch
    {
        "discover-local-apps" => _discoveryJobs.Get(call.RepoId) is { } j
            && j.AuditCallId == call.CallId && j.Status == DiscoveryStatus.Running,
        "ask-for-understanding" => _understandingJobs.Get(call.RepoId) is { } j
            && j.AuditCallId == call.CallId && j.Status == UnderstandingStatus.Running,
        _ => false,
    };

    private sealed class Call
    {
        public Call(string callId, string feature, string repoId, string repoName,
            string actor, string ip, DateTime startedAt)
        {
            CallId = callId;
            Feature = feature;
            RepoId = repoId;
            RepoName = repoName;
            Actor = actor;
            Ip = ip;
            StartedAt = startedAt;
        }

        public string CallId { get; }
        public string Feature { get; }
        public string RepoId { get; }
        public string RepoName { get; }
        public string Actor { get; }
        public string Ip { get; }
        public DateTime StartedAt { get; }
        public string? Outcome { get; set; }
        public long? DurationMs { get; set; }
        public string? Error { get; set; }
    }
}
