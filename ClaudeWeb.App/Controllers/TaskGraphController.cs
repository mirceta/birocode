using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The task dependency graph (plans/task-dependency-graph.md): ONE global board of
/// step nodes + "depends-on" edges, shared across the whole app.
///   GET    /api/taskgraph                -- { nodes, edges, machines }
///   POST   /api/taskgraph/nodes          -- { title, note?, repoId?, machineId?, x?, y? } -> node
///   PATCH  /api/taskgraph/nodes/{id}     -- { title?, note?, repoId?, machineId?, status?, x?, y? } -> node
///   DELETE /api/taskgraph/nodes/{id}     -- remove node (+ its edges)
///   PATCH  /api/taskgraph/scratch        -- { text } free-text scratchpad -> { scratch }
///   POST   /api/taskgraph/edges          -- { source, target } -> edge  (Source depends on Target)
///   DELETE /api/taskgraph/edges/{id}     -- remove one edge
///   POST   /api/taskgraph/machines       -- { name?, x?, y?, w?, h? } -> machine (grouping box = one host)
///   PATCH  /api/taskgraph/machines/{id}  -- { name?, x?, y?, w?, h? } -> machine
///   DELETE /api/taskgraph/machines/{id}  -- remove box, DETACHING its member nodes
///   POST   /api/taskgraph/verify         -- run one verifier pass now (openspec board-verify-remote) -> { checked, probed, changes, notes, at }
/// An edge Source->Target means Source must wait on Target (Target is the prerequisite).
/// </summary>
[ApiController]
[Route("api/taskgraph")]
public class TaskGraphController : ControllerBase
{
    private readonly TaskGraphService _graph;
    private readonly Services.Arch.ArchAgentService _arch;
    private readonly TaskVerificationPoller _verifier;
    private readonly Services.Arch.IAgentDirectory _agents;
    private readonly Services.Policeman.PolicemanSettings _policeSettings;
    private readonly Logger _logger;

    public TaskGraphController(TaskGraphService graph, Services.Arch.ArchAgentService arch, TaskVerificationPoller verifier, Services.Arch.IAgentDirectory agents, Services.Policeman.PolicemanSettings policeSettings, Logger logger)
    {
        _graph = graph;
        _arch = arch;
        _verifier = verifier;
        _agents = agents;
        _policeSettings = policeSettings;
        _logger = logger;
    }

    /// <summary>Run one verification pass right now (openspec board-verify-remote): this
    /// machine's assignees from their clones, every card with a PR against GitHub. The
    /// operator's "Re-verify board" button; also how stuck cards are backfilled without
    /// waiting for the next minute tick. Serialised with the background pass.</summary>
    [HttpPost("verify")]
    public IActionResult Verify()
    {
        _logger.CountRequest();
        var r = _verifier.VerifyOnce(TaskVerificationPoller.TriggerOperator);
        return Ok(new
        {
            r.Checked, r.Probed, r.At,
            changes = r.Changes.Select(c => new { c.Id, c.Title, c.From, c.To }),
            notes = r.Notes,
        });
    }

    public record NodeRequest(string? Title, string? Note, string? RepoId, string? MachineId, string? Status, double? X, double? Y,
        string? SourceId = null, string? CreatedBy = null, string? IdeaId = null,
        // "Go manual" (openspec kanban-board-integrity): flip the card's manual flag.
        bool? Manual = null);
    public record GoalRequest(string? Text);
    public record HumanRequestBody(string? Reason);
    /// <summary>The external human developer who owns a card (openspec kanban-external-owner).</summary>
    public record OwnerRequest(string? Name);
    /// <summary>Legacy single assignee (sourceId + repoId, blank = unassign), or several
    /// (openspec task-multi-assignee): <c>assignees</c> with <c>mode</c> replace | add | remove.</summary>
    public record AssignRequest(string? SourceId, string? RepoId, string? By, List<AssigneeRequest>? Assignees = null, string? Mode = null);
    public record AssigneeRequest(string? SourceId, string? RepoId);
    /// <summary>Optional subset to ping (openspec task-multi-assignee); empty = every assignee not yet pinged.</summary>
    public record DispatchRequest(List<AssigneeRequest>? Assignees = null);
    public record EdgeRequest(string? Source, string? Target);
    public record ScratchRequest(string? Text);
    public record MachineRequest(string? Name, double? X, double? Y, double? W, double? H);

    [HttpGet]
    public IActionResult Get()
    {
        _logger.CountRequest();
        var b = _graph.Get();
        // staleHours rides along so the client draws the same stale badge the
        // harness computes (openspec kanban-lifecycle-columns).
        // goal + integrity (openspec kanban-board-integrity): the board's goal and the
        // policeman's last verdict ride the same poll the Kanban already makes.
        return Ok(new
        {
            nodes = b.Nodes, edges = b.Edges, machines = b.Machines, scratch = b.Scratch, staleHours = _graph.StaleAfterMs / 3600_000.0,
            goal = b.Goal, goalUpdatedAt = b.GoalUpdatedAt, integrity = _verifier.LastIntegrity,
        });
    }

    /// <summary>Set the board goal (openspec kanban-board-integrity).</summary>
    [HttpPatch("goal")]
    public IActionResult UpdateGoal([FromBody] GoalRequest? request)
    {
        _logger.CountRequest();
        return Ok(new { goal = _graph.SetGoal(request?.Text, Now()), goalUpdatedAt = _graph.Get().GoalUpdatedAt });
    }

    /// <summary>The Board check's last verdict (openspec kanban-board-integrity); null before the first pass.</summary>
    [HttpGet("integrity")]
    public IActionResult Integrity()
    {
        _logger.CountRequest();
        return Ok(new { integrity = _verifier.LastIntegrity, staleHours = _graph.StaleAfterMs / 3600_000.0 });
    }

    /// <summary>The Policeman tab (openspec one-policeman): the loop's status (interval, last / next
    /// pass, running, passes since start, settings), the judge's verdict, one row per in-flight
    /// card (column · facts · what the agent last said · the model's reading · this pass · 🆘),
    /// the journal of passes (newest first; quiet runs coalesced) — or, with <c>?card=</c>, only
    /// the entries that touched that card — and every card the journal knows.</summary>
    [HttpGet("policeman")]
    public IActionResult Policeman([FromQuery] string? card = null, [FromQuery] int take = 200)
    {
        _logger.CountRequest();
        var j = _verifier.Journal;
        var sweep = _verifier.Sweep;
        var now = Now();
        string? cardId = null;
        if (!string.IsNullOrWhiteSpace(card)) cardId = _graph.ResolveTaskRef(card.Trim()).Id ?? card.Trim();
        var last = j.Last;
        var said = sweep?.LastSaid ?? new Dictionary<string, Services.Policeman.PolicemanSweep.Said>();
        var rows = _graph.Get().Nodes.Where(Services.Policeman.PolicemanSweep.InFlight).Select(n =>
        {
            var set = TaskGraphService.AssigneesOf(n);
            var ahead = set.Count > 0 ? set.Any(a => TaskLifecycle.IsUnverified(a.Status, a.VerifiedStatus)) : TaskLifecycle.IsUnverified(n.Status, n.VerifiedStatus);
            var pr = set.FirstOrDefault(a => a.PrUrl is not null || a.PrNumber is not null);
            said.TryGetValue(n.Id, out var s);
            return new
            {
                id = n.Id, @ref = TaskGraphService.CardRef(n.Id), title = n.Title, status = n.Status, verifiedStatus = n.VerifiedStatus,
                ahead, againstSweeps = sweep?.AgainstFor(n.Id) ?? 0,
                prUrl = pr?.PrUrl ?? n.PrUrl, prNumber = pr?.PrNumber ?? n.PrNumber,
                assignees = set.Select(a => new { key = a.Key, label = _agents.AgentLabel(a.SourceId, a.RepoId), status = a.Status, verifiedStatus = a.VerifiedStatus, dispatchedAt = a.DispatchedAt }).ToList(),
                pinged = set.Any(a => a.DispatchedAt is not null) || n.DispatchedAt is not null,
                said = s is null ? null : new { agent = s.Agent, text = s.Text, at = s.At, messages = s.Tail.Select(m => new { role = m.Role, text = m.Text, at = m.At }).ToList() },
                observation = n.Observation is null ? null : new { at = n.Observation.At, by = n.Observation.By, state = n.Observation.State, summary = n.Observation.Summary },
                needsHuman = n.NeedsHuman is null ? null : new { at = n.NeedsHuman.At, by = n.NeedsHuman.By, reason = n.NeedsHuman.Reason, answer = n.NeedsHuman.Answer, answeredAt = n.NeedsHuman.AnsweredAt },
                warning = n.Warning,
                thisPass = last is null ? null : new
                {
                    moved = last.Changes.Where(c => c.Id == n.Id).Select(c => new { c.From, c.To, c.Assignee }).ToList(),
                    traced = last.Traced.Where(t => t.Id == n.Id).Select(t => new { t.Pr, t.How }).ToList(),
                    asked = last.Questions.Where(q => q.Id == n.Id).Select(q => new { q.State, q.Summary, q.Tokens, q.Error }).ToList(),
                    raised = last.Raised.Any(f => f.Id == n.Id), cleared = last.Cleared.Any(f => f.Id == n.Id),
                },
            };
        }).ToList();
        return Ok(new
        {
            intervalSeconds = (int)TaskVerificationPoller.Interval.TotalSeconds,
            startedAt = j.StartedAt,
            lastAt = _verifier.LastAt,
            nextDueAt = _verifier.NextDueAt,
            running = _verifier.Running,
            passes = j.Passes,
            now,
            settings = _policeSettings.Current,
            staleHours = _graph.StaleAfterMs / 3600_000.0,
            integrity = _verifier.LastIntegrity,
            last,
            cards = rows,
            card = cardId,
            history = cardId is null ? j.Recent(Math.Clamp(take, 1, Services.Policeman.PolicemanJournal.MaxEntries)) : j.ForCard(cardId),
            cardsSeen = j.CardsSeen().Select(c => new { id = c.Id, title = c.Title }),
        });
    }

    public record PolicemanSettingsRequest(bool? Enabled, string? Model, int? Tail, int? MaxQuestionsPerPass);

    /// <summary>The policeman's knobs (openspec one-policeman): reading on / off, the model, the tail, the per-pass budget.</summary>
    [HttpPost("policeman/settings")]
    public IActionResult PolicemanSettings([FromBody] PolicemanSettingsRequest? req)
    {
        _logger.CountRequest();
        return Ok(new { settings = _policeSettings.Update(req?.Enabled, req?.Model, req?.Tail, req?.MaxQuestionsPerPass) });
    }

    public record AnswerRequest(string? Text);

    /// <summary>The Operator answers a 🆘 on the card (openspec one-policeman): the words go into
    /// the assignee's conversation as the Operator's own message, and the answer is kept on the
    /// flag; the flag clears on a later pass, once the agent has continued. Returns the send
    /// outcome per assignee — a busy or claimed agent is reported, not silently skipped.</summary>
    [HttpPost("nodes/{id}/answer")]
    public IActionResult Answer(string id, [FromBody] AnswerRequest? request)
    {
        _logger.CountRequest();
        var text = request?.Text?.Trim();
        if (string.IsNullOrWhiteSpace(text)) return BadRequest(new { error = "text is required" });
        id = _graph.ResolveTaskRef(id).Id ?? id;
        var node = _graph.Find(id);
        if (node is null) return NotFound(new { error = "Unknown node id." });
        var targets = TaskGraphService.AssigneesOf(node).Where(a => !TaskLifecycle.IsDelivered(a.Status) && a.RepoId.Length > 0).ToList();
        if (targets.Count == 0) return BadRequest(new { error = "the card has no assignee to answer" });
        var sent = targets.Select(a =>
        {
            var o = _agents.SendToAgent(a.SourceId, a.RepoId, $"[the Operator, answering the flag on task {TaskGraphService.CardRef(id)} \"{node.Title}\"]\n{text}");
            return new { assignee = _agents.AgentLabel(a.SourceId, a.RepoId), ok = o.Ok, status = o.Status, detail = o.Detail };
        }).ToList();
        var any = sent.Any(s => s.ok);
        var updated = any && node.NeedsHuman is not null ? _graph.AnswerNeedsHuman(id, text, Now()) : node;
        return any ? Ok(new { node = updated, sent }) : StatusCode(409, new { error = "no assignee could be reached: " + string.Join("; ", sent.Select(s => $"{s.assignee}: {s.detail}")), sent });
    }

    /// <summary>The Operator raises "human assistance requested" on a card by hand.</summary>
    [HttpPost("nodes/{id}/human")]
    public IActionResult RequestHuman(string id, [FromBody] HumanRequestBody? request = null)
    {
        _logger.CountRequest();
        id = _graph.ResolveTaskRef(id).Id ?? id;
        var node = _graph.SetNeedsHuman(id, new TaskGraphService.HumanRequest(Now(), BoardIntegrity.Operator, string.IsNullOrWhiteSpace(request?.Reason) ? "raised by the Operator" : request!.Reason!.Trim()), Now());
        if (node is null) return NotFound(new { error = "Unknown node id." });
        return Ok(node);
    }

    /// <summary>Hand a card to a DIFFERENT human developer (openspec kanban-external-owner):
    /// it leaves our domain — the verifier, the policeman and the arch leave it alone until
    /// the owner is cleared. A blank name is a bad request; clear with DELETE.</summary>
    [HttpPost("nodes/{id}/owner")]
    public IActionResult SetExternalOwner(string id, [FromBody] OwnerRequest? request)
    {
        _logger.CountRequest();
        if (CardDomain.CleanOwner(request?.Name) is null) return BadRequest(new { error = "An owner name is required (DELETE to hand the card back)." });
        id = _graph.ResolveTaskRef(id).Id ?? id;
        var node = _graph.SetExternalOwner(id, request!.Name, Now());
        if (node is null) return NotFound(new { error = "Unknown node id." });
        return Ok(node);
    }

    /// <summary>The card is ours again: clear its external owner.</summary>
    [HttpDelete("nodes/{id}/owner")]
    public IActionResult ClearExternalOwner(string id)
    {
        _logger.CountRequest();
        id = _graph.ResolveTaskRef(id).Id ?? id;
        var node = _graph.SetExternalOwner(id, null, Now());
        if (node is null) return NotFound(new { error = "Unknown node id." });
        return Ok(node);
    }

    /// <summary>The Operator dismisses the policeman's observation on a card (openspec
    /// policeman-observes-agents); the next pass may record a fresh one.</summary>
    [HttpDelete("nodes/{id}/observation")]
    public IActionResult DismissObservation(string id)
    {
        _logger.CountRequest();
        id = _graph.ResolveTaskRef(id).Id ?? id;
        var node = _graph.SetObservation(id, null, Now());
        if (node is null) return NotFound(new { error = "Unknown node id." });
        return Ok(node);
    }

    /// <summary>The Operator resolves it: clears the request whoever raised it.</summary>
    [HttpDelete("nodes/{id}/human")]
    public IActionResult ResolveHuman(string id)
    {
        _logger.CountRequest();
        id = _graph.ResolveTaskRef(id).Id ?? id;
        var node = _graph.SetNeedsHuman(id, null, Now());
        if (node is null) return NotFound(new { error = "Unknown node id." });
        return Ok(node);
    }

    [HttpPost("nodes")]
    public IActionResult CreateNode([FromBody] NodeRequest? request)
    {
        _logger.CountRequest();
        var node = _graph.AddNode(request?.Title, request?.Note, request?.RepoId, request?.MachineId, request?.X ?? 0, request?.Y ?? 0, Now(),
            request?.SourceId, request?.CreatedBy ?? "human", request?.IdeaId);
        if (node is null) return BadRequest(new { error = "Node title is required." });
        return Ok(node);
    }

    [HttpPatch("nodes/{id}")]
    public IActionResult UpdateNode(string id, [FromBody] NodeRequest? request)
    {
        _logger.CountRequest();
        // The card reference works here too (openspec kanban-card-ref): "#5cc3e900" / a unique prefix.
        id = _graph.ResolveTaskRef(id).Id ?? id;
        // "Go manual" (openspec kanban-board-integrity) rides the same PATCH.
        if (request?.Manual is { } manual && _graph.SetManual(id, manual, Now()) is null)
            return NotFound(new { error = "Unknown node id." });
        var node = _graph.UpdateNode(id, request?.Title, request?.Note, request?.RepoId, request?.MachineId, request?.Status, request?.X, request?.Y, Now());
        if (node is null) return NotFound(new { error = "Unknown node id, blank title, or invalid status." });
        return Ok(node);
    }

    /// <summary>Assign a task to a repo agent on this or another harness (openspec
    /// task-board-kanban); blank repoId unassigns.</summary>
    [HttpPost("nodes/{id}/assign")]
    public IActionResult Assign(string id, [FromBody] AssignRequest? request)
    {
        _logger.CountRequest();
        id = _graph.ResolveTaskRef(id).Id ?? id;
        TaskGraphService.Node? node;
        if (request?.Assignees is { } many)
        {
            var wanted = many.Where(a => !string.IsNullOrWhiteSpace(a.RepoId)).Select(a => (string.IsNullOrWhiteSpace(a.SourceId) ? null : a.SourceId, a.RepoId!.Trim())).ToList();
            var by = request.By ?? "human";
            switch ((request.Mode ?? "replace").Trim().ToLowerInvariant())
            {
                case "add": node = _graph.Find(id); foreach (var (src, repo) in wanted) node = _graph.AddAssignee(id, src, repo, by, Now()); break;
                case "remove": node = _graph.Find(id); foreach (var (src, repo) in wanted) node = _graph.RemoveAssignee(id, src, repo, by, Now()); break;
                default: node = _graph.SetAssignees(id, wanted, by, Now()); break;
            }
        }
        else node = _graph.Assign(id, request?.SourceId, request?.RepoId, request?.By ?? "human", Now());
        if (node is null) return NotFound(new { error = "Unknown node id." });
        return Ok(node);
    }

    /// <summary>Ping the assignee with the task (the operator's button): the task
    /// text goes to that repo agent's conversation through the arch send path, and
    /// the card moves to doing when the send lands.</summary>
    [HttpPost("nodes/{id}/dispatch")]
    public IActionResult Dispatch(string id, [FromBody] DispatchRequest? request = null)
    {
        _logger.CountRequest();
        id = _graph.ResolveTaskRef(id).Id ?? id;
        var keys = request?.Assignees?.Where(a => !string.IsNullOrWhiteSpace(a.RepoId))
            .Select(a => TaskGraphService.AssigneeKey(string.IsNullOrWhiteSpace(a.SourceId) ? null : a.SourceId, a.RepoId!.Trim())).ToList();
        var o = _arch.DispatchTask(id, requireArmed: false, by: "operator", assigneeKeys: keys is { Count: > 0 } ? keys : null);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    [HttpDelete("nodes/{id}")]
    public IActionResult DeleteNode(string id)
    {
        _logger.CountRequest();
        var dropped = _graph.DeleteNode(id, Now());
        if (dropped < 0) return NotFound(new { error = "Unknown node id." });
        return Ok(new { id, removedEdges = dropped });
    }

    [HttpPatch("scratch")]
    public IActionResult UpdateScratch([FromBody] ScratchRequest? request)
    {
        _logger.CountRequest();
        return Ok(new { scratch = _graph.SetScratch(request?.Text, Now()) });
    }

    [HttpPost("edges")]
    public IActionResult CreateEdge([FromBody] EdgeRequest? request)
    {
        _logger.CountRequest();
        var (edge, error) = _graph.AddEdge(request?.Source, request?.Target, Now());
        if (edge is not null) return Ok(edge);
        var message = error switch
        {
            TaskGraphService.EdgeError.MissingNode => "Both source and target nodes must exist.",
            TaskGraphService.EdgeError.SelfLoop => "A step can't depend on itself.",
            TaskGraphService.EdgeError.Duplicate => "That dependency already exists.",
            TaskGraphService.EdgeError.Cycle => "That would create a dependency cycle.",
            _ => "Could not add the dependency.",
        };
        return BadRequest(new { error = message });
    }

    [HttpDelete("edges/{id}")]
    public IActionResult DeleteEdge(string id)
    {
        _logger.CountRequest();
        if (!_graph.DeleteEdge(id, Now())) return NotFound(new { error = "Unknown edge id." });
        return Ok(new { id });
    }

    [HttpPost("machines")]
    public IActionResult CreateMachine([FromBody] MachineRequest? request)
    {
        _logger.CountRequest();
        var machine = _graph.AddMachine(request?.Name, request?.X, request?.Y, request?.W, request?.H, Now());
        return Ok(machine);
    }

    [HttpPatch("machines/{id}")]
    public IActionResult UpdateMachine(string id, [FromBody] MachineRequest? request)
    {
        _logger.CountRequest();
        var machine = _graph.UpdateMachine(id, request?.Name, request?.X, request?.Y, request?.W, request?.H, Now());
        if (machine is null) return NotFound(new { error = "Unknown machine id, or blank name." });
        return Ok(machine);
    }

    [HttpDelete("machines/{id}")]
    public IActionResult DeleteMachine(string id)
    {
        _logger.CountRequest();
        var detached = _graph.DeleteMachine(id, Now());
        if (detached < 0) return NotFound(new { error = "Unknown machine id." });
        return Ok(new { id, detachedNodes = detached });
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
