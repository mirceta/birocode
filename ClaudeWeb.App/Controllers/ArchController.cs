using System.Text;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The Arch tab's API (openspec: add-arch-agent, D9) plus the MCP endpoint the
/// arch session calls (D7). Reads are session-auth only; actions (arm, send,
/// scope) are operator-gated like every autopilot action, because the arch loop
/// runs on the autopilot engine. The MCP route is exempt from the password
/// middleware and instead checks the per-process bearer token the harness
/// itself wrote into the run's <c>--mcp-config</c>.
/// </summary>
[ApiController]
[Route("api/arch")]
public class ArchController : ControllerBase
{
    private readonly ArchAgentService _arch;
    private readonly ArchMcpServer _mcp;
    private readonly LoopConfigStore _loops;
    private readonly AutopilotGate _gate;
    private readonly AutopilotConfigStore _config;
    private readonly AutopilotService _engine;
    private readonly AutopilotAuditLog _audit;
    private readonly RunSessionService _runs;
    private readonly SessionService _sessions;
    private readonly RepositoryRegistry _repos;
    private readonly Services.Events.CollectorService _collector;
    private readonly FleetClient _fleet;
    private readonly Logger _logger;

    public ArchController(
        ArchAgentService arch, ArchMcpServer mcp, LoopConfigStore loops, AutopilotGate gate,
        AutopilotConfigStore config, AutopilotService engine, AutopilotAuditLog audit,
        RunSessionService runs, SessionService sessions, RepositoryRegistry repos,
        Services.Events.CollectorService collector, FleetClient fleet, Logger logger)
    {
        _collector = collector;
        _fleet = fleet;
        _arch = arch;
        _mcp = mcp;
        _loops = loops;
        _gate = gate;
        _config = config;
        _engine = engine;
        _audit = audit;
        _runs = runs;
        _sessions = sessions;
        _repos = repos;
        _logger = logger;
    }

    private IActionResult? GateClosed() =>
        _gate.Enabled ? null
            : StatusCode(StatusCodes.Status403Forbidden,
                new { error = "Autopilot is disabled by the operator.", gate = "operator-off" });

    // ---- state ---------------------------------------------------------------

    /// <summary><c>conv</c> (openspec arch-conversations) names the arch conversation;
    /// omitted = the default (<c>@arch</c>). Same for messages, tool-calls, send, stream,
    /// stop-turn and loop below.</summary>
    [HttpGet("")]
    public IActionResult State([FromQuery] string? conv = null)
    {
        _logger.CountRequest();
        if (UnknownConversation(conv, out var key) is { } missing) return missing;
        return Ok(BuildState(key));
    }

    // The conversation key for `conv`: the default when omitted, 404 when it names a
    // conversation this harness does not have.
    private IActionResult? UnknownConversation(string? conv, out string key)
    {
        key = ArchAgentService.KeyOrDefault(conv);
        if (string.IsNullOrWhiteSpace(conv) || _arch.HasConversation(key)) return null;
        return NotFound(new { error = $"no arch conversation \"{conv}\"" });
    }

    private static object ConversationView(ArchStateStore.Conversation c) =>
        new { id = c.Id, name = c.Name, isDefault = c.IsDefault, createdAt = c.CreatedAt, sessionId = c.SessionId };

    // ---- conversations (openspec arch-conversations) --------------------------------------

    [HttpGet("conversations")]
    public IActionResult Conversations()
    {
        _logger.CountRequest();
        var loops = _loops.All().Where(l => ArchAgentService.IsArchKey(l.RepoId)).ToDictionary(l => l.RepoId, StringComparer.Ordinal);
        return Ok(new
        {
            conversations = _arch.Conversations().Select(c => new
            {
                id = c.Id, name = c.Name, isDefault = c.IsDefault, createdAt = c.CreatedAt, sessionId = c.SessionId,
                loop = loops.TryGetValue(c.Id, out var l) ? new { kind = l.Kind, active = l.Active, status = l.Status } : null,
                running = _runs.Get(c.Id)?.Status == "running",
            }),
        });
    }

    public sealed record ConversationRequest(string? Name);

    [HttpPost("conversations")]
    public IActionResult CreateConversation([FromBody] ConversationRequest? req)
    {
        _logger.CountRequest();
        try
        {
            var c = _arch.CreateConversation(req?.Name);
            return Ok(new { conversation = ConversationView(c) });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPatch("conversations/{id}")]
    public IActionResult RenameConversation(string id, [FromBody] ConversationRequest? req)
    {
        _logger.CountRequest();
        if (!ArchAgentService.IsArchKey(id) || !_arch.HasConversation(id)) return NotFound(new { error = $"no arch conversation \"{id}\"" });
        if (req is null || string.IsNullOrWhiteSpace(req.Name)) return BadRequest(new { error = "name is required" });
        var c = _arch.RenameConversation(id, req.Name);
        return c is null ? NotFound(new { error = $"no arch conversation \"{id}\"" }) : Ok(new { conversation = ConversationView(c) });
    }

    [HttpDelete("conversations/{id}")]
    public IActionResult DeleteConversation(string id)
    {
        _logger.CountRequest();
        if (string.Equals(id, ArchAgentService.ReservedId, StringComparison.Ordinal))
            return BadRequest(new { error = "the default arch conversation cannot be removed" });
        if (!ArchAgentService.IsArchKey(id) || !_arch.HasConversation(id)) return NotFound(new { error = $"no arch conversation \"{id}\"" });
        return Ok(new { removed = _arch.DeleteConversation(id) });
    }

    private object BuildState(string? conv = null)
    {
        var key = ArchAgentService.KeyOrDefault(conv);
        // Segment timings: the Arch tab polls this every few seconds, so anything
        // slow here is felt as "the tab takes forever to load" — name the culprit.
        var sw = System.Diagnostics.Stopwatch.StartNew();
        long T() => sw.ElapsedMilliseconds;
        var loop = _loops.Get(key);
        var engine = _engine.States().FirstOrDefault(s => s.RepoId == key);
        var run = _runs.Get(key);
        var managed = _arch.ManagedRepoIds();
        var home = _arch.HomePath;
        var t0 = T();
        var agents = _arch.ListAgents(refreshPeers: false, nonBlocking: true);
        var tAgents = T() - t0;
        t0 = T();
        var fleet = BuildFleet();
        var tFleet = T() - t0;
        t0 = T();
        var commits = _arch.RecentHomeCommits().Select(c => new { sha = c.Sha, subject = c.Subject, at = c.At }).ToList();
        var tHome = T() - t0;
        t0 = T();
        var sid = _arch.ResolveArchSessionId(key);
        var tSid = T() - t0;
        if (T() > 1000)
            _logger.Info($"[ARCH] state took {T()} ms (agents {tAgents}, fleet {tFleet}, home commits {tHome}, session {tSid}; home={_arch.HomePath})");
        var conversation = _arch.GetConversation(key);
        return new
        {
            gateOpen = _gate.Enabled,
            killSwitch = _config.Get().Enabled,
            conversation = conversation is null ? null : ConversationView(conversation),
            conversations = _arch.Conversations().Select(ConversationView).ToList(),
            loop = loop is null ? null : new
            {
                kind = loop.Kind, mode = loop.Mode, active = loop.Active, status = loop.Status,
                iterationsDone = loop.IterationsDone, maxIterations = loop.MaxIterations,
                lastSentAt = loop.LastSentAt, armedAt = loop.ArmedAt, stopReason = loop.StopReason,
                stopDetail = loop.StopDetail, pendingPrompt = _gate.Enabled ? loop.PendingPrompt : null,
                sessionId = loop.SessionId,
            },
            engine = engine is null ? null : new { decision = engine.Decision, reason = engine.Reason, label = engine.Label, at = engine.UpdatedAt },
            managedRepoIds = managed,
            managedFleet = _arch.ManagedFleet(),
            repos = _repos.GetAll().Select(r => new { id = r.Id, name = r.Name, handle = r.Handle, exists = r.Exists, isSelf = r.IsSelf }),
            agents = agents.Select(a => new
            {
                handle = a.Label(_arch.SelfLabel), machine = a.Machine, sourceId = a.SourceId, key = a.Key, repoId = a.RepoId, name = a.Name, remoteUrl = a.RemoteUrl, branch = a.Branch,
                defaultBranch = a.DefaultBranch, dirty = a.Dirty, availability = a.Availability, lastActor = a.LastActor,
                claimedReason = a.ClaimedReason, pinned = a.Pinned, adopted = a.BranchAdopted,
                runningSince = a.RunningSince, tabId = a.TabId, exists = a.Exists, isLocal = a.IsLocal,
                managedThere = a.IsLocal || a.ManagedThere, sendable = a.Sendable, blocked = a.Blocked?.Reason,
            }),
            claimWindowMinutes = _arch.ClaimWindowMinutes,
            fleet,
            home = new
            {
                path = home, exists = _arch.HomeExists,
                commits,
            },
            session = new
            {
                sessionId = sid,
                // Where the arch conversation lives on disk (openspec arch-context-prompt):
                // lets the Arch tab hand a repo agent a copyable pointer it can read
                // without credentials.
                transcriptPath = sid is { Length: > 0 }
                    ? System.IO.Path.Combine(SessionService.ProjectsDirectoryFor(_arch.HomePath), sid + ".jsonl")
                    : null,
                run = run is null ? null : new { status = run.Status, lastSeq = run.LastSeq, sessionId = run.SessionId },
            },
            watermark = _arch.WatermarkOf(key),
            drivenQuietSeconds = _arch.DrivenQuietSeconds,
            disallowedTools = ArchAgentService.DisallowedTools,
        };
    }

    /// <summary>The fleet as this harness sees it (openspec add-fleet-arch-agent):
    /// its own label and receiving-side opt-in, and every subscribed remote source
    /// with the collector's status, the operator's allow-sends consent, and the
    /// peer describe (posture + repos) so the scope picker can offer them.</summary>
    private object BuildFleet()
    {
        var sources = _collector.ListSources().Where(s => s.Kind == "remote").Select(s =>
        {
            var peer = _fleet.SnapshotNonBlocking(s.Id); // the UI never waits on a peer
            return new
            {
                id = s.Id, label = s.Label, address = s.Address, active = s.Active, status = s.Status, alive = s.Alive,
                allowSends = s.AllowSends,
                peer = new
                {
                    status = peer.Status, detail = peer.Detail, at = peer.At,
                    protocol = peer.Info?.Protocol, version = peer.Info?.Version, machine = peer.Info?.Machine,
                    acceptsSends = peer.Info?.AcceptsSends ?? false, gateOpen = peer.Info?.GateOpen ?? false,
                    acceptsUpgrades = peer.Info?.AcceptsUpgrades ?? false,
                    behind = peer.Reachable && peer.Info?.Version is { } pv && pv != ArchAgentService.BuildVersion,
                },
                repos = peer.Repos.Select(r => new
                {
                    repoId = r.RepoId, name = r.Name, key = Services.Arch.ArchStateStore.FleetKey(s.Id, r.RepoId), remoteUrl = r.RemoteUrl,
                    branch = r.Branch, availability = r.Managed == true ? r.Availability : ArchAgentService.Unmanaged, exists = r.Exists, isSelf = r.IsSelf,
                    // The peer's OWN arch scope (D8): null = a build that predates scope reporting.
                    managed = r.Managed,
                }),
                managedThere = peer.Repos.Count(r => r.Managed == true),
            };
        }).ToList();
        return new
        {
            selfLabel = _arch.SelfLabel,
            acceptSends = _arch.AcceptFleetSends,
            acceptUpgrades = _arch.AcceptFleetUpgrades,
            upgradeJob = _arch.PeerUpgradeStatus(null),
            version = ArchAgentService.BuildVersion,
            protocol = Services.Arch.FleetClient.Protocol,
            sources,
        };
    }

    public sealed record FleetRequest(bool? AcceptSends, bool? AcceptUpgrades);

    /// <summary>Receiving-side opt-in: let fleet arch agents on other harnesses send
    /// tasks to this harness's repo agents. Operator-gated like every arch action.</summary>
    [HttpPost("fleet")]
    public IActionResult Fleet([FromBody] FleetRequest? req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (req?.AcceptSends is not bool && req?.AcceptUpgrades is not bool)
            return BadRequest(new { error = "acceptSends or acceptUpgrades (true|false) is required" });
        if (req.AcceptSends is bool accept) _arch.SetAcceptFleetSends(accept);
        if (req.AcceptUpgrades is bool up) _arch.SetAcceptFleetUpgrades(up);
        return Ok(BuildState());
    }

    public sealed record HandoverRequest(string? RepoId, string? Branch, string? Action, string? SourceId);

    /// <summary>Branch hand-over (openspec arch-branch-handover): the Operator hands a repo's
    /// current branch to the arch (`adopt`), takes it back (`revoke`), or pins the repo as
    /// theirs (`pin` / `unpin`) — from the dock or the Management App agent card. A
    /// `sourceId` targets a repo on a peer through the fleet client.</summary>
    [HttpPost("handover")]
    public IActionResult HandOver([FromBody] HandoverRequest? req)
    {
        _logger.CountRequest();
        if (string.IsNullOrWhiteSpace(req?.RepoId)) return BadRequest(new { error = "repoId is required" });
        var action = (req.Action ?? "adopt").Trim().ToLowerInvariant();
        Services.Arch.ArchAgentService.ToolOutcome o;
        if (!string.IsNullOrWhiteSpace(req.SourceId) && req.SourceId != Services.Events.CollectorService.SelfId)
        {
            var src = _collector.ListSources().FirstOrDefault(s => s.Id == req.SourceId);
            if (src is null) return NotFound(new { error = "unknown source" });
            if (action is not ("adopt" or "revoke")) return BadRequest(new { error = "only adopt | revoke reach a peer" });
            o = _fleet.HandOver(src.Id, req.RepoId, req.Branch, _arch.SelfLabel, adopt: action == "adopt");
        }
        else
        {
            o = action switch
            {
                "adopt" => _arch.HandOver(req.RepoId, req.Branch, adopt: true, by: "operator"),
                "revoke" => _arch.HandOver(req.RepoId, req.Branch, adopt: false, by: "operator"),
                "pin" => _arch.PinRepo(req.RepoId, true, "operator"),
                "unpin" => _arch.PinRepo(req.RepoId, false, "operator"),
                _ => new Services.Arch.ArchAgentService.ToolOutcome(false, "error", "action must be adopt | revoke | pin | unpin"),
            };
        }
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data, posture = _arch.ClaimPosture(req.RepoId) });
    }

    /// <summary>One local repo's claim posture for the dock control: availability, why,
    /// branch, adopted / pinned, the activity window.</summary>
    [HttpGet("claim")]
    public IActionResult Claim([FromQuery] string? repoId)
    {
        _logger.CountRequest();
        if (string.IsNullOrWhiteSpace(repoId)) return BadRequest(new { error = "repoId is required" });
        return Ok(_arch.ClaimPosture(repoId));
    }

    public sealed record ClaimWindowRequest(int? Minutes);

    /// <summary>The claimed rule's activity window, operator-set (0 = default 2 h).</summary>
    [HttpPost("claim-window")]
    public IActionResult ClaimWindow([FromBody] ClaimWindowRequest? req)
    {
        _logger.CountRequest();
        if (req?.Minutes is not int m || m < 0) return BadRequest(new { error = "minutes (>= 0) is required" });
        _arch.SetClaimWindowMinutes(m);
        return Ok(new { claimWindowMinutes = _arch.ClaimWindowMinutes });
    }

    /// <summary>Fleet status (openspec fleet-status-tab): every repo agent on every
    /// machine with branch / on-default / running / last actor / arch scope — the
    /// Management App's Status tab. Never waits on a peer (cached describes).</summary>
    [HttpGet("fleet/status")]
    public IActionResult FleetStatus()
    {
        _logger.CountRequest();
        return Ok(_arch.FleetStatus());
    }

    /// <summary>On-demand scoreboard for one fleet machine (openspec fleet-status-panels):
    /// self when <c>sourceId</c> is omitted/self, else a peer relayed over the fleet client.
    /// NOT part of the periodic fleet poll — the Scoreboard tab calls this only when opened
    /// (and on its Refresh button); answers are cached a few minutes.</summary>
    [HttpGet("fleet/scoreboard")]
    public IActionResult FleetScoreboard([FromQuery] string? sourceId, [FromQuery] string? window)
    {
        _logger.CountRequest();
        return Ok(_arch.FleetScoreboard(sourceId, window));
    }

    public sealed record FleetUpgradeRequest(string? SourceId, string? Ref);

    /// <summary>Operator-triggered peer upgrade from the Fleet card (openspec
    /// arch-peer-upgrades): same posture as the arch tool minus the armed-loop rule.</summary>
    [HttpPost("fleet/upgrade")]
    public IActionResult FleetUpgrade([FromBody] FleetUpgradeRequest? req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        var src = _collector.ListSources().FirstOrDefault(s => s.Id == req?.SourceId);
        if (src is null) return NotFound(new { error = "unknown source" });
        var o = _arch.UpgradePeer(src.Label, req?.Ref, requireArmed: false);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    // ---- conversation ------------------------------------------------------------

    /// <summary>The arch conversation transcript, annotated with each user
    /// message's actor (human | wake).</summary>
    [HttpGet("messages")]
    public IActionResult Messages([FromQuery] string? sessionId = null, [FromQuery] string? conv = null)
    {
        _logger.CountRequest();
        if (UnknownConversation(conv, out var key) is { } missing) return missing;
        var sid = string.IsNullOrWhiteSpace(sessionId) ? _arch.ResolveArchSessionId(key) : sessionId;
        if (sid is null) return Ok(new { sessionId = (string?)null, messages = Array.Empty<object>() });
        var messages = _sessions.GetMessages(_arch.HomePath, sid);
        var annotated = MessageActors.Annotate(messages, _audit.Recent(5000), key, ArchAgentService.ActorHuman);
        return Ok(new { sessionId = sid, messages = annotated });
    }

    /// <summary>The Arch tab's History lane (openspec: add-arch-tool-history):
    /// every tool call of the arch conversation at full fidelity — the complete
    /// arguments, the result text (clipped past a budget, and said so), both
    /// timestamps, the elapsed time — grouped under the user turn that caused it,
    /// with that turn's actor (human | wake) restored from the audit exactly like
    /// the transcript's. Reconstructed from the session transcript on disk, so it
    /// is complete after a reload; the page overlays the running turn live. A
    /// harness tool (<c>mcp__arch__x</c>) is reported as server <c>arch</c> with
    /// its short name; anything else as <c>builtin</c>.</summary>
    [HttpGet("tool-calls")]
    public IActionResult ToolCalls([FromQuery] string? sessionId = null, [FromQuery] string? conv = null)
    {
        _logger.CountRequest();
        if (UnknownConversation(conv, out var key) is { } missing) return missing;
        var sid = string.IsNullOrWhiteSpace(sessionId) ? _arch.ResolveArchSessionId(key) : sessionId;
        if (sid is null) return Ok(new { sessionId = (string?)null, calls = Array.Empty<object>(), turns = Array.Empty<object>() });
        var records = _sessions.GetToolCallHistory(_arch.HomePath, sid);

        const string prefix = "mcp__arch__";
        var turnRows = records.GroupBy(r => r.Turn).OrderBy(g => g.Key)
            .Select(g => (Index: g.Key, Prompt: g.First().TurnPrompt, At: g.First().TurnAt, Calls: g.Count()))
            .ToList();
        // Actor per turn: the same audit match the transcript uses (a wake prompt is
        // an audit row keyed by its exact text; anything else is the human).
        var prompts = turnRows.Select(t => new ChatMessage("user", t.Prompt)).ToList();
        var annotated = MessageActors.Annotate(prompts, _audit.Recent(5000), key, ArchAgentService.ActorHuman);
        var turns = turnRows.Select((t, i) => new
        {
            index = t.Index,
            prompt = t.Prompt.Length > 280 ? t.Prompt[..280] + "…" : t.Prompt,
            at = t.At,
            actor = t.Index == 0 ? "none" : annotated[i].Actor ?? ArchAgentService.ActorHuman,
            calls = t.Calls,
        }).ToList();

        var calls = records.Select(r =>
        {
            var isArch = r.Name.StartsWith(prefix, StringComparison.Ordinal);
            return new
            {
                id = r.Id,
                name = r.Name,
                tool = isArch ? r.Name[prefix.Length..] : r.Name,
                server = isArch ? "arch" : "builtin",
                summary = r.Summary,
                input = r.Input,
                ok = r.Ok,
                result = r.Result,
                resultClipped = r.ResultClipped,
                resultChars = r.ResultChars,
                at = r.At,
                resultAt = r.ResultAt,
                durationMs = r.At is { } a && r.ResultAt is { } b ? (long?)Math.Max(0, (long)(b - a).TotalMilliseconds) : null,
                turn = r.Turn,
            };
        }).ToList();
        return Ok(new { sessionId = sid, calls, turns });
    }

    public sealed record SendRequest(string? Text);

    [HttpPost("send")]
    public IActionResult Send([FromBody] SendRequest? req, [FromQuery] string? conv = null)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (UnknownConversation(conv, out var key) is { } missing) return missing;
        if (req is null || string.IsNullOrWhiteSpace(req.Text)) return BadRequest(new { error = "text is required" });
        var (ok, error, session) = _arch.SendToArch(key, req.Text);
        if (!ok) return StatusCode(StatusCodes.Status409Conflict, new { error });
        return Ok(new { sent = true, lastSeq = session!.LastSeq });
    }

    /// <summary>Reattach to the arch run's event stream (same contract as
    /// <c>GET /api/chat/stream</c>): replay after <paramref name="after"/>, then live.</summary>
    [HttpGet("stream")]
    public async Task Stream([FromQuery] int after = 0, [FromQuery] string? conv = null)
    {
        _logger.CountRequest();
        var session = _runs.Get(ArchAgentService.KeyOrDefault(conv));
        if (session is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { error = "No arch run yet." });
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
        catch (OperationCanceledException)
        {
            // Client detached; the arch turn keeps running.
        }
    }

    /// <summary>Stops the arch agent's CURRENT turn (kills its CLI). Distinct from
    /// disarm: this is the chat Stop button for the arch conversation.</summary>
    [HttpPost("stop-turn")]
    public IActionResult StopTurn([FromQuery] string? conv = null)
    {
        _logger.CountRequest();
        var session = _runs.Get(ArchAgentService.KeyOrDefault(conv));
        if (session is null || session.Status != "running")
            return NotFound(new { error = "No running arch turn." });
        session.RequestStop();
        return Ok(new { stopped = true });
    }

    // ---- scope + loop ---------------------------------------------------------------

    /// <summary><c>fleet</c> = managed agents on subscribed harnesses as keys
    /// <c>sourceId/repoId</c>; omitted = leave the fleet scope as it is (older
    /// callers), empty list = clear it.</summary>
    public sealed record ScopeRequest(List<string>? RepoIds, List<string>? Fleet);

    [HttpPost("scope")]
    public IActionResult Scope([FromBody] ScopeRequest? req)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        _arch.SetScope(req?.RepoIds ?? new List<string>(), req?.Fleet);
        return Ok(BuildState());
    }

    public sealed record LoopRequest(string? Action, string? Mode, int? MaxIterations, int? QuietSeconds = null);

    /// <summary><c>action</c> = arm | disarm | stop | mode. Arm bootstraps the home,
    /// pins the conversation and resets the watermark (no replay); disarm is the
    /// kill switch for the arch agent — no further sends, running repo turns finish.</summary>
    [HttpPost("loop")]
    public IActionResult Loop([FromBody] LoopRequest? req, [FromQuery] string? conv = null)
    {
        _logger.CountRequest();
        if (GateClosed() is { } closed) return closed;
        if (UnknownConversation(conv, out var key) is { } missing) return missing;
        switch ((req?.Action ?? "").ToLowerInvariant())
        {
            case "arm":
            case "start":
                // Local repos or agents on subscribed harnesses — either makes a scope (fleet D3).
                if (_arch.ManagedRepoIds().Count + _arch.ManagedFleet().Count == 0)
                    return BadRequest(new { error = "pick at least one managed repo (on this or another machine) before arming" });
                _arch.Arm(key, req?.Mode, req?.MaxIterations);
                break;
            case "disarm":
            case "stop":
                _arch.Disarm(key);
                break;
            case "quiet":
                // The driven loops' quiet floor (openspec arch-driven-loops): how long a
                // repeat waits for a wake before the arch agent is nudged anyway.
                if (req?.QuietSeconds is not { } qs || qs < 30)
                    return BadRequest(new { error = "quietSeconds must be at least 30" });
                _arch.SetDrivenQuietSeconds(qs);
                break;
            case "mode":
                if (string.IsNullOrWhiteSpace(req?.Mode))
                    return BadRequest(new { error = "the mode action needs a mode (suggest | drive)" });
                if (_loops.SetMode(key, req.Mode) is null)
                    return NotFound(new { error = "the arch loop has never been armed" });
                break;
            default:
                return BadRequest(new { error = $"unknown action \"{req?.Action}\"" });
        }
        return Ok(BuildState(key));
    }

    // ---- tools lane ---------------------------------------------------------------------

    /// <summary>The Arch tab's Tools lane (openspec: add-arch-agent, D7/D9): the
    /// catalogue the arch session sees on <c>tools/list</c> — the same objects the
    /// MCP server serves, so the lane can never drift from the real surface — plus
    /// per-tool usage read back from the action audit (kind <c>arch</c>, outcome
    /// <c>arch-tool</c>, phase = tool name) and the built-in tools the session is
    /// denied. Nothing here is configurable: the set is fixed by the harness.</summary>
    [HttpGet("tools")]
    public IActionResult Tools()
    {
        _logger.CountRequest();
        var calls = _audit.Recent(5000)
            .Where(e => e.Kind == ArchAgentService.AuditKind && e.Outcome == ArchAgentService.AuditOutcomeTool)
            .ToList(); // newest first
        var tools = ArchMcpServer.ToolsList().Select(t =>
        {
            var name = t?["name"]?.GetValue<string>() ?? "";
            var mine = calls.Where(e => e.Phase == name).ToList();
            var last = mine.FirstOrDefault();
            return new
            {
                name,
                callName = $"mcp__arch__{name}",
                description = t?["description"]?.GetValue<string>() ?? "",
                inputSchema = t?["inputSchema"],
                calls = mine.Count,
                lastAt = last?.At,
                lastOutcome = last?.AnsweredMessage,
                lastRepo = last is null || ArchAgentService.IsArchKey(last.RepoId) ? null : last.RepoName,
            };
        }).ToList();
        return Ok(new
        {
            server = new
            {
                name = "arch",
                transport = "http",
                url = "/api/arch/mcp",
                protocolVersion = ArchMcpServer.ProtocolVersion,
                tokenSet = !string.IsNullOrEmpty(_arch.McpToken),
            },
            tools,
            disallowedTools = ArchAgentService.DisallowedTools,
            totalCalls = calls.Count,
            managedCount = _arch.ManagedRepoIds().Count + _arch.ManagedFleet().Count,
            home = new { path = _arch.HomePath, exists = _arch.HomeExists },
        });
    }

    /// <summary>Readiness of the arch tool surface, in the shape of the repo
    /// dock's Birokrat preflight: pass/fail rows plus <c>ready</c>. Checks the
    /// live objects, not a saved config — there is none.</summary>
    [HttpGet("tools/preflight")]
    public IActionResult ToolsPreflight()
    {
        _logger.CountRequest();
        var checks = new List<PreflightCheck>();
        void Add(string id, bool ok, string detail, bool skipped = false) =>
            checks.Add(new PreflightCheck(id, ok, skipped, detail));

        // 1. The MCP server answers tools/list with the full catalogue (in-process,
        //    same handler the HTTP route calls).
        int listed = 0;
        try
        {
            var reply = _mcp.Handle(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = 1, ["method"] = "tools/list" });
            listed = (reply.Body?["result"]?["tools"] as JsonArray)?.Count ?? 0;
        }
        catch { listed = 0; }
        var expected = ArchMcpServer.ToolsList().Count;
        Add("mcp", listed == expected && listed > 0, $"{listed}/{expected} tools at POST /api/arch/mcp");

        // 2. The per-process bearer token the run's --mcp-config carries validates.
        var token = _arch.McpToken;
        Add("token", !string.IsNullOrEmpty(token) && _arch.ValidateMcpToken(token),
            string.IsNullOrEmpty(token) ? "no token" : $"per-process bearer, {token.Length} hex chars, minted at startup");

        // 3. Home repo (memory tools write there). Missing before the first arm is
        //    not a fault — arming creates it — so it is reported as skipped.
        var homeExists = _arch.HomeExists;
        Add("home", homeExists, homeExists ? _arch.HomePath : $"{_arch.HomePath} — created on first arm", skipped: !homeExists);

        // 4. At least one managed repo, or list_agents/send_task have nothing to act on.
        var managedLocal = _arch.ManagedRepoIds().Count;
        var managedFleet = _arch.ManagedFleet().Count;
        var managed = managedLocal + managedFleet;
        Add("scope", managed > 0, managed > 0
            ? $"{managedLocal} managed repo(s) here{(managedFleet > 0 ? $" + {managedFleet} on other machines" : "")}"
            : "no managed repos — pick some in the scope picker");

        // 5. The autopilot gate and kill switch, which every arch action is behind.
        var gate = _gate.Enabled;
        var kill = _config.Get().Enabled;
        Add("gate", gate && kill, !gate ? "operator gate closed (host GUI)" : !kill ? "autopilot kill switch off" : "gate open, kill switch on");

        // 6. Fleet (openspec add-fleet-arch-agent): one row per subscribed harness
        //    that is in scope — its peer API must answer for sends to work. A
        //    subscribed harness NOT in scope is informational (skipped).
        var inScope = _arch.ManagedFleet().Select(k => Services.Arch.ArchStateStore.ParseFleetKey(k)!.Value.SourceId).ToHashSet(StringComparer.Ordinal);
        foreach (var s in _collector.ListSources().Where(s => s.Kind == "remote"))
        {
            var peer = _fleet.Snapshot(s.Id);
            var used = inScope.Contains(s.Id);
            var ok = peer.Reachable && (!used || s.AllowSends);
            var detail = peer.Reachable
                ? $"{s.Label}: peer API ok (build {peer.Info?.Version}, accepts sends: {(peer.Info?.AcceptsSends == true ? "yes" : "no")}){(s.AllowSends ? ", sends allowed" : ", sends not allowed here")}"
                : $"{s.Label}: {peer.Status}{(peer.Detail is null ? "" : " — " + peer.Detail)}";
            Add("fleet:" + s.Id, ok, detail, skipped: !used && !ok);
        }

        var ready = checks.All(c => c.Ok || c.Skipped);
        return Ok(new { ready, checks = checks.Select(c => new { id = c.Id, ok = c.Ok, skipped = c.Skipped, detail = c.Detail }) });
    }

    private sealed record PreflightCheck(string Id, bool Ok, bool Skipped, string Detail);

    // ---- MCP ----------------------------------------------------------------------------

    /// <summary>Streamable-HTTP MCP endpoint for the arch session. Exempt from
    /// the password middleware; the bearer token is the credential.</summary>
    [HttpPost("mcp")]
    public async Task<IActionResult> Mcp()
    {
        if (!Authorized()) return Unauthorized(new { error = "bad or missing arch MCP token" });
        JsonNode? body;
        try
        {
            using var reader = new StreamReader(Request.Body, Encoding.UTF8);
            var text = await reader.ReadToEndAsync();
            body = string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text);
        }
        catch (Exception ex)
        {
            return BadRequest(new { jsonrpc = "2.0", id = (object?)null, error = new { code = -32700, message = $"parse error: {ex.Message}" } });
        }
        var reply = _mcp.Handle(body);
        Response.Headers["Mcp-Session-Id"] = "arch";
        if (reply.Body is null) return StatusCode(reply.Status);
        return new ContentResult { StatusCode = reply.Status, ContentType = "application/json", Content = reply.Body.ToJsonString() };
    }

    [HttpGet("mcp")]
    public IActionResult McpGet() => StatusCode(StatusCodes.Status405MethodNotAllowed);

    [HttpDelete("mcp")]
    public IActionResult McpDelete() => Authorized() ? Ok() : Unauthorized();

    private bool Authorized()
    {
        var auth = Request.Headers.Authorization.FirstOrDefault() ?? "";
        const string prefix = "Bearer ";
        return auth.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && _arch.ValidateMcpToken(auth[prefix.Length..].Trim());
    }
}
