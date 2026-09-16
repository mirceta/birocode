# One-shot backend patch for openspec cross-repo-effort-legs (board task 68d33734).
# Exact-string / anchored replacements; every anchor asserted unique so drift fails loudly.
import re

def edit(path, pairs, regex=()):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, f"{path}: anchor not unique/found ({s.count(old)}):\n{old[:200]}"
        s = s.replace(old, new)
    for pat, fn in regex:
        m = list(re.finditer(pat, s, re.S))
        assert len(m) == 1, f"{path}: regex not unique/found: {pat[:80]} ({len(m)})"
        s = s[:m[0].start()] + fn(m[0]) + s[m[0].end():]
    open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', path)

# ---- TaskGraphService: the leg fields + AddLeg / SetLegRole -------------------------------
edit('ClaudeWeb.App/Services/TaskGraph/TaskGraphService.cs', [
("""        string? VerifiedStatus = null, long? VerifiedAt = null, string? Warning = null, long UpdatedAt = 0)
    {
        /// <summary>"sourceId|repoId" ("" for this harness): the key the tools and the UI use.</summary>""",
"""        string? VerifiedStatus = null, long? VerifiedAt = null, string? Warning = null, long UpdatedAt = 0,
        // A typed LEG of a cross-repo effort (openspec cross-repo-effort-legs): Role = driver |
        // driven | null; Path = an AGENTLESS checkout on the machine (its RepoId is then the
        // synthetic "path:<path>", see Effort) — never attributed to a managed agent.
        string? Role = null, string? Path = null)
    {
        /// <summary>"sourceId|repoId" ("" for this harness): the key the tools and the UI use.</summary>"""),
("""    /// <summary>Set ONE assignee's status (openspec task-multi-assignee): that agent's card""",
"""    /// <summary>Add a typed LEG to a card (openspec cross-repo-effort-legs): a repo agent
    /// (<paramref name="repoId"/> on <paramref name="sourceId"/>) or an AGENTLESS checkout
    /// (<paramref name="path"/>, on this machine when <paramref name="sourceId"/> is null),
    /// with a role (driver | driven | null) and optional branch / PR. A leg already present is
    /// updated (role, path, branch, PR) rather than duplicated; a new one starts at the card's
    /// status like any assignee. Null for an unknown card or no repo/path.</summary>
    public Node? AddLeg(string id, string? sourceId, string? repoId, string? path, string? role, string? branch, string? prUrl, string? by, long now)
    {
        var p = Effort.CleanPath(path);
        var repo = p is not null ? Effort.AgentlessRepoId(p) : CleanRepo(repoId);
        if (repo is null) return null;
        var r = Effort.CleanRole(role);
        Node? updated;
        lock (_gate)
        {
            var i = _board.Nodes.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var cur = _board.Nodes[i];
            var list = AssigneesOf(cur).ToList();
            var key = AssigneeKey(CleanRepo(sourceId), repo);
            var j = list.FindIndex(a => a.Key == key);
            if (j >= 0)
            {
                var a = list[j];
                var b = a with { Role = r ?? a.Role, Path = p ?? a.Path, Branch = Clean(branch, 400) ?? a.Branch, PrUrl = Clean(prUrl, 400) ?? a.PrUrl };
                if (b == a) return cur;
                list[j] = b with { UpdatedAt = now };
            }
            else
            {
                list.Add(new Assignee(CleanRepo(sourceId), repo, cur.Status, Clean(by, 200), now, null, 0,
                    Branch: Clean(branch, 400), PrUrl: Clean(prUrl, 400), Warning: TaskLifecycle.WarningFor(cur.Status, null, null), UpdatedAt: now, Role: r, Path: p));
            }
            updated = WithAssignees(cur with { UpdatedAt = now }, list);
            _board.Nodes[i] = updated;
            Save();
        }
        _logger.Info($"[TASKGRAPH] node {id} leg {repo}{(r is null ? "" : " " + r)}{(p is null ? "" : " (agentless)")} by {by ?? "?"}");
        RaiseChanged();
        return updated;
    }

    /// <summary>Set (or clear with null) one leg's role. Null for an unknown card or leg.</summary>
    public Node? SetLegRole(string id, string assigneeKey, string? role, long now)
    {
        var r = Effort.CleanRole(role);
        Node? updated;
        lock (_gate)
        {
            var i = _board.Nodes.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var cur = _board.Nodes[i];
            var list = AssigneesOf(cur).ToList();
            var j = list.FindIndex(a => a.Key == assigneeKey);
            if (j < 0) return null;
            if (list[j].Role == r) return cur;
            list[j] = list[j] with { Role = r, UpdatedAt = now };
            updated = WithAssignees(cur with { UpdatedAt = now }, list);
            _board.Nodes[i] = updated;
            Save();
        }
        RaiseChanged();
        return updated;
    }

    /// <summary>Set ONE assignee's status (openspec task-multi-assignee): that agent's card"""),
])

# ---- BoardVerifier: agentless legs are probed at their path, PRs resolved from its origin -
edit('ClaudeWeb.App/Services/TaskGraph/BoardVerifier.cs', [
("""                foreach (var (_, path) in localRepoPaths)
                {
                    var or = PrRef.OwnerRepoOf(_pr.OriginUrl(path));
                    if (or is not null && !clones.ContainsKey(or)) clones[or] = path;
                }""",
"""                foreach (var path in localRepoPaths.Values.Concat(AgentlessLocalPaths()))
                {
                    var or = PrRef.OwnerRepoOf(_pr.OriginUrl(path));
                    if (or is not null && !clones.ContainsKey(or)) clones[or] = path;
                }"""),
("""                var label = multi ? $"{start.Title} [{a0.RepoId}]" : start.Title;""",
 """                var label = multi ? $"{start.Title} [{Effort.LegLabel(a0)}]" : start.Title;"""),
("""                // 1. Local facts: this machine's repo, recorded branch.
                if (a.SourceId is null && a.RepoId.Length > 0 && a.Branch is not null
                    && localRepoPaths.TryGetValue(a.RepoId, out var repoPath) && Directory.Exists(repoPath))
                {
                    probed++;
                    var facts = _local.Probe(repoPath, a.Branch);
                    a = Current(_graph.ApplyVerification(start.Id, key, facts, now), key) ?? a;
                }""",
"""                // 1. Local facts: this machine's repo — or an AGENTLESS leg's checkout path
                //    (openspec cross-repo-effort-legs) — and the recorded branch.
                string? repoPath = null;
                if (a.SourceId is null && a.Branch is not null)
                {
                    if (Effort.PathOf(a) is { } legPath) { if (Directory.Exists(legPath)) repoPath = legPath; }
                    else if (a.RepoId.Length > 0 && localRepoPaths.TryGetValue(a.RepoId, out var rp) && Directory.Exists(rp)) repoPath = rp;
                }
                if (repoPath is not null)
                {
                    probed++;
                    var facts = _local.Probe(repoPath, a.Branch!);
                    a = Current(_graph.ApplyVerification(start.Id, key, facts, now), key) ?? a;
                }"""),
("""                    if (prFacts is null) { notes.Add($"{Short(start.Id)}{(multi ? "[" + a.RepoId + "]" : "")}: no PR found for {Describe(pr)}");""",
 """                    if (prFacts is null) { notes.Add($"{Short(start.Id)}{(multi ? "[" + Effort.LegLabel(a) + "]" : "")}: no PR found for {Describe(pr)}");"""),
("""    /// <summary>An unassigned card as a verification target: its own fields, no repo.</summary>""",
"""    /// <summary>The checkouts of this machine's AGENTLESS legs (openspec cross-repo-effort-legs)
    /// that exist on disk: probed like registered repos, and candidates for "is the merge live".</summary>
    private IEnumerable<string> AgentlessLocalPaths() =>
        _graph.Get().Nodes.SelectMany(TaskGraphService.AssigneesOf)
            .Where(a => a.SourceId is null && Effort.PathOf(a) is { } p && Directory.Exists(p))
            .Select(a => Effort.PathOf(a)!)
            .Distinct(StringComparer.OrdinalIgnoreCase);

    /// <summary>An unassigned card as a verification target: its own fields, no repo.</summary>"""),
("""        if (a.RepoId.Length == 0) return null; // an unassigned card: only its PR URL can name a PR
        string? remote = null;
        if (a.SourceId is not null) remote = _fleet?.Assignee(a.SourceId, a.RepoId).RemoteUrl;
        else if (localRepoPaths.TryGetValue(a.RepoId, out var path)) remote = _pr.OriginUrl(path);""",
"""        if (a.RepoId.Length == 0) return null; // an unassigned card: only its PR URL can name a PR
        string? remote = null;
        if (Effort.PathOf(a) is { } legPath)
        {
            // An agentless leg (openspec cross-repo-effort-legs): its own checkout's origin
            // when it is on this machine; a peer's agentless leg can only name a PR by URL.
            if (a.SourceId is null && Directory.Exists(legPath)) remote = _pr.OriginUrl(legPath);
        }
        else if (a.SourceId is not null) remote = _fleet?.Assignee(a.SourceId, a.RepoId).RemoteUrl;
        else if (localRepoPaths.TryGetValue(a.RepoId, out var path)) remote = _pr.OriginUrl(path);"""),
])

# ---- BoardIntegrity: a cross-repo mismatch is dishonest with the legs named ---------------
edit('ClaudeWeb.App/Services/TaskGraph/BoardIntegrity.cs', [
("""        var set = TaskGraphService.AssigneesOf(n);

        // Dishonest: the column claims more than the harness has verified.""",
"""        var set = TaskGraphService.AssigneesOf(n);

        // A cross-repo effort (openspec cross-repo-effort-legs) whose column claims merged
        // while a leg is not verified merged on GitHub: dishonest, with EVERY leg named —
        // the rule that would have caught the Knjiga-pošte card.
        if (Effort.MismatchReason(n) is { } mismatch)
            return new CardIntegrity(n.Id, n.Title, Dishonest, "column ahead of reality — " + mismatch);

        // Dishonest: the column claims more than the harness has verified."""),
])

# ---- Controller: legs endpoints ------------------------------------------------------------
edit('ClaudeWeb.App/Controllers/TaskGraphController.cs', [
("""    public record OwnerRequest(string? Name);""",
"""    public record OwnerRequest(string? Name);
    /// <summary>A typed leg (openspec cross-repo-effort-legs): a repo agent (sourceId + repoId)
    /// OR an agentless checkout (path), its role (driver | driven), optional branch / PR.</summary>
    public record LegRequest(string? SourceId, string? RepoId, string? Path, string? Role, string? Branch, string? PrUrl, string? By);
    public record LegRoleRequest(string? Key, string? Role);"""),
("""    /// <summary>The Operator dismisses the policeman's observation on a card (openspec""",
"""    /// <summary>Add (or update) a typed leg on a card (openspec cross-repo-effort-legs): a repo
    /// agent by sourceId + repoId, or an AGENTLESS checkout by path; role driver | driven.</summary>
    [HttpPost("nodes/{id}/legs")]
    public IActionResult AddLeg(string id, [FromBody] LegRequest? request)
    {
        _logger.CountRequest();
        if (string.IsNullOrWhiteSpace(request?.RepoId) && Effort.CleanPath(request?.Path) is null)
            return BadRequest(new { error = "A leg needs a repoId (a repo agent) or a path (an agentless checkout)." });
        if (!string.IsNullOrWhiteSpace(request!.Role) && !Effort.IsRole(request.Role))
            return BadRequest(new { error = "role must be driver or driven (or empty)." });
        id = _graph.ResolveTaskRef(id).Id ?? id;
        var node = _graph.AddLeg(id, request.SourceId, request.RepoId, request.Path, request.Role, request.Branch, request.PrUrl, request.By ?? "human", Now());
        if (node is null) return NotFound(new { error = "Unknown node id." });
        return Ok(node);
    }

    /// <summary>Set or clear one leg's role; the leg by its key ("sourceId|repoId").</summary>
    [HttpPost("nodes/{id}/legs/role")]
    public IActionResult SetLegRole(string id, [FromBody] LegRoleRequest? request)
    {
        _logger.CountRequest();
        if (string.IsNullOrWhiteSpace(request?.Key)) return BadRequest(new { error = "key is required." });
        if (!string.IsNullOrWhiteSpace(request.Role) && !Effort.IsRole(request.Role))
            return BadRequest(new { error = "role must be driver or driven (or empty)." });
        id = _graph.ResolveTaskRef(id).Id ?? id;
        var node = _graph.SetLegRole(id, request.Key, request.Role, Now());
        if (node is null) return NotFound(new { error = "Unknown node id or leg." });
        return Ok(node);
    }

    /// <summary>The Operator dismisses the policeman's observation on a card (openspec"""),
])

# ---- ArchAgentService: list_tasks, update_task by path, dispatch skips agentless, tools, prompt
edit('ClaudeWeb.App/Services/Arch/ArchAgentService.cs', [
("""                        handle = AgentLabelOf(a.SourceId, a.RepoId), machine = a.SourceId is null ? Machine : srcLabel.GetValueOrDefault(a.SourceId, a.SourceId),
                        repoId = a.RepoId, repoName = repoName.GetValueOrDefault(a.RepoId, a.RepoId), status = a.Status,""",
"""                        handle = LegLabelOf(a), machine = a.SourceId is null ? Machine : srcLabel.GetValueOrDefault(a.SourceId, a.SourceId),
                        repoId = a.RepoId, repoName = TaskGraph.Effort.IsAgentless(a) ? TaskGraph.Effort.LegLabel(a) : repoName.GetValueOrDefault(a.RepoId, a.RepoId), status = a.Status,
                        // A typed LEG (openspec cross-repo-effort-legs): its role, its checkout
                        // when it has no agent, and whether GitHub verified its merge.
                        role = a.Role, agentless = TaskGraph.Effort.IsAgentless(a), path = TaskGraph.Effort.PathOf(a), merged = TaskGraph.Effort.IsMerged(a), mergeState = TaskGraph.Effort.MergeWord(a),"""),
("""                    externalOwner = n.ExternalOwner, externalOwnerAt = n.ExternalOwnerAt,""",
"""                    externalOwner = n.ExternalOwner, externalOwnerAt = n.ExternalOwnerAt,
                    // The effort as a whole (openspec cross-repo-effort-legs): legs merged / total,
                    // PARTIALLY merged (not done), drivers, driven, the unmerged legs.
                    effort = EffortJson(n),"""),
("""    private string AgentLabelOf(string? sourceId, string repoId)
    {""",
"""    /// <summary>A leg's label: the agent's handle, or the path tail + "(no agent)" for an
    /// agentless leg (openspec cross-repo-effort-legs).</summary>
    private string LegLabelOf(TaskGraph.TaskGraphService.Assignee a) =>
        TaskGraph.Effort.IsAgentless(a) ? $"{TaskGraph.Effort.LegLabel(a)} (no agent)" : AgentLabelOf(a.SourceId, a.RepoId);

    private object EffortJson(TaskGraph.TaskGraphService.Node n)
    {
        var s = TaskGraph.Effort.Summarize(n);
        return new
        {
            crossRepo = s.CrossRepo, legs = s.Legs, merged = s.Merged, allMerged = s.AllMerged, partiallyMerged = s.PartiallyMerged,
            drivers = s.Drivers.Select(LegLabelOf).ToList(), driven = s.Driven.Select(LegLabelOf).ToList(),
            unmerged = s.Unmerged.Select(a => $"{LegLabelOf(a)} — {TaskGraph.Effort.MergeWord(a)}").ToList(),
            mismatch = TaskGraph.Effort.MismatchReason(n, LegLabelOf),
        };
    }

    /// <summary>The leg lines a dispatch brief carries (openspec cross-repo-effort-legs), or null
    /// for a plain card (one agent, no roles, no agentless leg).</summary>
    private List<string>? LegLines(TaskGraph.TaskGraphService.Node node, TaskGraph.TaskGraphService.Assignee me)
    {
        var legs = TaskGraph.TaskGraphService.AssigneesOf(node);
        if (legs.Count <= 1 && legs.All(l => l.Role is null && !TaskGraph.Effort.IsAgentless(l))) return null;
        return legs.Select(l =>
            $"{LegLabelOf(l)}{(l.Key == me.Key ? " (YOU)" : "")}: {l.Role ?? "untyped"}" +
            (TaskGraph.Effort.IsAgentless(l) ? $", no agent — checkout {TaskGraph.Effort.PathOf(l)}" : "") +
            (l.Branch is null ? "" : $", branch {l.Branch}") + (l.PrUrl is null ? "" : $", PR {l.PrUrl}") + $", {TaskGraph.Effort.MergeWord(l)}").ToList();
    }

    private string AgentLabelOf(string? sourceId, string repoId)
    {"""),
("""        if (!string.IsNullOrWhiteSpace(assignee))
        {
            var agent = ResolveAgentRef(machine, assignee);
            if (agent.Error is not null || agent.RepoId is null) return new ToolOutcome(false, "error", agent.Error ?? $"could not resolve assignee \\"{assignee}\\"");
            key = TaskGraph.TaskGraphService.AssigneeKey(agent.Target.IsSelf ? null : agent.Target.Source!.Id, agent.RepoId);
            if (set.All(a => a.Key != key))
                return new ToolOutcome(false, "error", $"{assignee.Trim()} is not an assignee of task {id}; its assignees: {string.Join(", ", set.Select(a => AgentLabelOf(a.SourceId, a.RepoId)))}");
            who = AgentLabelOf(agent.Target.IsSelf ? null : agent.Target.Source!.Id, agent.RepoId);
        }""",
"""        if (!string.IsNullOrWhiteSpace(assignee))
        {
            // An AGENTLESS leg (openspec cross-repo-effort-legs) is named by its checkout path
            // or path tail — it has no handle to resolve.
            var legByName = set.FirstOrDefault(a => TaskGraph.Effort.IsAgentless(a) && TaskGraph.Effort.Matches(a, assignee));
            if (legByName is not null) { key = legByName.Key; who = LegLabelOf(legByName); }
            else
            {
                var agent = ResolveAgentRef(machine, assignee);
                if (agent.Error is not null || agent.RepoId is null) return new ToolOutcome(false, "error", agent.Error ?? $"could not resolve assignee \\"{assignee}\\"");
                key = TaskGraph.TaskGraphService.AssigneeKey(agent.Target.IsSelf ? null : agent.Target.Source!.Id, agent.RepoId);
                if (set.All(a => a.Key != key))
                    return new ToolOutcome(false, "error", $"{assignee.Trim()} is not an assignee of task {id}; its assignees: {string.Join(", ", set.Select(LegLabelOf))}");
                who = AgentLabelOf(agent.Target.IsSelf ? null : agent.Target.Source!.Id, agent.RepoId);
            }
        }"""),
("""            targets = set.Where(a => assigneeKeys.Contains(a.Key)).ToList();
        }""",
"""            targets = set.Where(a => assigneeKeys.Contains(a.Key)).ToList();
            var noAgent = targets.Where(a => !TaskGraph.Effort.HasAgent(a)).ToList();
            if (noAgent.Count > 0)
                return new ToolOutcome(false, "agentless", $"cannot ping {string.Join(", ", noAgent.Select(LegLabelOf))}: an agentless leg has no agent — the driver works that checkout and reports it with report_leg");
        }"""),
("""            targets = set.Where(a => a.DispatchedAt is null && !TaskGraph.TaskLifecycle.IsDelivered(a.Status)).ToList();
            if (targets.Count == 0)
                return new ToolOutcome(false, "already-dispatched",""",
"""            targets = set.Where(a => a.DispatchedAt is null && !TaskGraph.TaskLifecycle.IsDelivered(a.Status) && TaskGraph.Effort.HasAgent(a)).ToList();
            // Agentless legs (openspec cross-repo-effort-legs) are never pinged: the driver
            // works those checkouts and reports them.
            if (targets.Count == 0 && set.Any(a => TaskGraph.Effort.IsAgentless(a) && !TaskGraph.TaskLifecycle.IsDelivered(a.Status)) && set.Where(TaskGraph.Effort.HasAgent).All(a => a.DispatchedAt is not null || TaskGraph.TaskLifecycle.IsDelivered(a.Status)))
                return new ToolOutcome(false, "agentless", $"nothing to ping on task {id}: every agent leg has been pinged and the remaining leg(s) have no agent ({string.Join(", ", set.Where(TaskGraph.Effort.IsAgentless).Select(LegLabelOf))}) — the driver works those checkouts and reports them with report_leg");
            if (targets.Count == 0)
                return new ToolOutcome(false, "already-dispatched","""),
("""        var coLabels = set.Select(a => AgentLabelOf(a.SourceId, a.RepoId)).ToList();""",
 """        var coLabels = set.Select(LegLabelOf).ToList();"""),
("""            var text = DispatchMessage(node, prereqs, by, machineLabel, repoName, b, set.Count > 1 ? coLabels.Where(l => l != mine).ToList() : null, set.Count > 1 ? mine : null);""",
 """            var text = DispatchMessage(node, prereqs, by, machineLabel, repoName, b, set.Count > 1 ? coLabels.Where(l => l != mine).ToList() : null, set.Count > 1 ? mine : null, LegLines(node, a));"""),
("""        if (!string.IsNullOrWhiteSpace(branch)) sb.Append($"Branch: work on `{branch.Trim()}` (create it off the default branch if it does not exist).\\n");""",
"""        // A cross-repo EFFORT with typed legs (openspec cross-repo-effort-legs): every leg is
        // listed with its state; the driver learns what it drives and how to report it.
        if (legLines is { Count: > 0 })
        {
            sb.Append("This card is a CROSS-REPO EFFORT with typed legs (driver = the orchestrator, driven = a product repo it drives):\\n");
            foreach (var l in legLines) sb.Append("  - ").Append(l).Append('\\n');
            sb.Append("The card is done only when EVERY leg's pull request is verified merged on GitHub — a merged driver PR alone never finishes it. ")
              .Append("If you are the DRIVER, the driven legs without an agent are yours to work (commit on their branch, open their PR) and to report with the harness tool report_leg(task, leg, branch, pr); ")
              .Append("call my_effort at any time for the effort's state, and answer from it when asked what you are doing.\\n\\n");
        }
        if (!string.IsNullOrWhiteSpace(branch)) sb.Append($"Branch: work on `{branch.Trim()}` (create it off the default branch if it does not exist).\\n");"""),
("""    public ToolOutcome ToolAssignTask(string? id, string? machine, string? repoId, string? assignees = null, string? mode = null)
    {""",
"""    public ToolOutcome ToolAssignTask(string? id, string? machine, string? repoId, string? assignees = null, string? mode = null, string? role = null)
    {
        if (!string.IsNullOrWhiteSpace(role) && !TaskGraph.Effort.IsRole(role)) return new ToolOutcome(false, "error", "role must be driver | driven");"""),
("""        if (node is null) return new ToolOutcome(false, "error", $"no task {id}");
        var set = TaskGraph.TaskGraphService.AssigneesOf(node);
        AuditTool("assign_task", node.RepoId, node.RepoId is null ? "unassigned" : "assigned");""",
"""        if (node is null) return new ToolOutcome(false, "error", $"no task {id}");
        // A role given with the assignment types the legs just named (openspec cross-repo-effort-legs).
        if (TaskGraph.Effort.CleanRole(role) is { } r && m != "remove")
            foreach (var a in agents) node = _graph.SetLegRole(id, a.Key, r, Now()) ?? node;
        var set = TaskGraph.TaskGraphService.AssigneesOf(node);
        AuditTool("assign_task", node.RepoId, node.RepoId is null ? "unassigned" : "assigned");"""),
("""            set.Count == 0 ? $"task {id} unassigned" : $"task {id} assigned to {labels}; dispatch_task pings {(set.Count > 1 ? "each of them" : "the agent")}", node);
    }""",
"""            set.Count == 0 ? $"task {id} unassigned" : $"task {id} assigned to {labels}; dispatch_task pings {(set.Count > 1 ? "each of them" : "the agent")}", node);
    }

    // ---- typed legs of a cross-repo effort (openspec cross-repo-effort-legs) -----------------

    /// <summary>Add a typed leg: a repo agent (machine + repoId / handle) or an AGENTLESS
    /// checkout (path on machine, default this one) with role driver | driven and optional
    /// branch / PR. The card is done only when every leg's PR is verified merged.</summary>
    public ToolOutcome ToolAddLeg(string? id, string? role, string? machine, string? repoId, string? path, string? branch, string? pr)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        if (!string.IsNullOrWhiteSpace(role) && !TaskGraph.Effort.IsRole(role)) return new ToolOutcome(false, "error", "role must be driver | driven");
        if (!string.IsNullOrWhiteSpace(pr) && TaskGraph.PrRef.FromUrl(pr) is null) return new ToolOutcome(false, "error", "pr must be a GitHub pull request URL (https://github.com/<owner>/<repo>/pull/<n>)");
        var (resolvedId, idErr) = _graph.ResolveTaskRef(id);
        if (resolvedId is null) return new ToolOutcome(false, "error", idErr ?? $"no task {id}");
        id = resolvedId;
        var cur = _graph.Find(id)!;
        if (TaskGraph.CardDomain.Refusal(cur, "the card was not changed") is { } handsOff) return new ToolOutcome(false, handsOff.Status, handsOff.Message);
        string? sourceId = null;
        string? repo = null;
        var p = TaskGraph.Effort.CleanPath(path);
        if (p is null)
        {
            if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", "give repoId (a repo agent: handle, id or unique name) or path (an agentless checkout)");
            var agent = ResolveAgentRef(machine, repoId);
            if (agent.Error is not null || agent.RepoId is null) return new ToolOutcome(false, "error", agent.Error ?? $"could not resolve \\"{repoId}\\"");
            sourceId = agent.Target.IsSelf ? null : agent.Target.Source!.Id;
            repo = agent.RepoId;
        }
        else if (!string.IsNullOrWhiteSpace(machine) && !machine.Trim().Equals("self", StringComparison.OrdinalIgnoreCase))
        {
            var target = ResolveAgentRef(machine, null);
            if (target.Error is not null) return new ToolOutcome(false, "error", target.Error);
            sourceId = target.Target.IsSelf ? null : target.Target.Source!.Id;
        }
        var node = _graph.AddLeg(id, sourceId, repo, p, role, branch, pr, ActorArch, Now());
        if (node is null) return new ToolOutcome(false, "error", $"no task {id}");
        var legs = TaskGraph.TaskGraphService.AssigneesOf(node);
        var s = TaskGraph.Effort.Summarize(node);
        AuditTool("add_leg", node.RepoId, p is null ? "agent leg" : "agentless leg");
        return new ToolOutcome(true, "added",
            $"task {TaskGraph.TaskGraphService.CardRef(id)} now has {legs.Count} leg(s): {string.Join(", ", legs.Select(l => $"{LegLabelOf(l)} ({l.Role ?? "untyped"}, {TaskGraph.Effort.MergeWord(l)})"))}; {s.Merged}/{s.Legs} merged{(s.PartiallyMerged ? " — PARTIALLY merged, not done" : "")}{(p is null ? "; dispatch_task pings agent legs" : "; an agentless leg is never pinged — its driver works and reports it")}",
            new { node, effort = EffortJson(node) });
    }

    /// <summary>Remove a leg by handle, path or path tail.</summary>
    public ToolOutcome ToolRemoveLeg(string? id, string? leg)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        if (string.IsNullOrWhiteSpace(leg)) return new ToolOutcome(false, "error", "leg is required (handle, checkout path or path tail)");
        var (resolvedId, idErr) = _graph.ResolveTaskRef(id);
        if (resolvedId is null) return new ToolOutcome(false, "error", idErr ?? $"no task {id}");
        id = resolvedId;
        var cur = _graph.Find(id)!;
        if (TaskGraph.CardDomain.Refusal(cur, "the card was not changed") is { } handsOff) return new ToolOutcome(false, handsOff.Status, handsOff.Message);
        var found = FindLeg(cur, leg);
        if (found.Error is not null) return new ToolOutcome(false, "error", found.Error);
        var node = _graph.RemoveAssignee(id, found.Leg!.SourceId, found.Leg.RepoId, ActorArch, Now());
        if (node is null) return new ToolOutcome(false, "error", $"no task {id}");
        AuditTool("remove_leg", node.RepoId, "removed");
        return new ToolOutcome(true, "removed", $"leg {LegLabelOf(found.Leg)} removed from task {TaskGraph.TaskGraphService.CardRef(id)}; {TaskGraph.TaskGraphService.AssigneesOf(node).Count} leg(s) remain", new { node, effort = EffortJson(node) });
    }

    /// <summary>Type (or untype) one leg: driver | driven | none.</summary>
    public ToolOutcome ToolSetLegRole(string? id, string? leg, string? role)
    {
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required");
        if (string.IsNullOrWhiteSpace(leg)) return new ToolOutcome(false, "error", "leg is required (handle, checkout path or path tail)");
        var clear = string.IsNullOrWhiteSpace(role) || role.Trim().Equals("none", StringComparison.OrdinalIgnoreCase);
        if (!clear && !TaskGraph.Effort.IsRole(role)) return new ToolOutcome(false, "error", "role must be driver | driven | none");
        var (resolvedId, idErr) = _graph.ResolveTaskRef(id);
        if (resolvedId is null) return new ToolOutcome(false, "error", idErr ?? $"no task {id}");
        id = resolvedId;
        var cur = _graph.Find(id)!;
        if (TaskGraph.CardDomain.Refusal(cur, "the card was not changed") is { } handsOff) return new ToolOutcome(false, handsOff.Status, handsOff.Message);
        var found = FindLeg(cur, leg);
        if (found.Error is not null) return new ToolOutcome(false, "error", found.Error);
        var node = _graph.SetLegRole(id, found.Leg!.Key, clear ? null : role, Now());
        if (node is null) return new ToolOutcome(false, "error", $"no task {id}");
        AuditTool("set_leg_role", node.RepoId, clear ? "untyped" : role!.Trim().ToLowerInvariant());
        return new ToolOutcome(true, "typed", $"leg {LegLabelOf(found.Leg)} of task {TaskGraph.TaskGraphService.CardRef(id)} is now {(clear ? "untyped" : "the " + role!.Trim().ToLowerInvariant())}", new { node, effort = EffortJson(node) });
    }

    /// <summary>A leg of a card by handle (any machine), checkout path or path tail.</summary>
    private (TaskGraph.TaskGraphService.Assignee? Leg, string? Error) FindLeg(TaskGraph.TaskGraphService.Node node, string leg)
    {
        var legs = TaskGraph.TaskGraphService.AssigneesOf(node);
        var q = leg.Trim();
        var hits = legs.Where(a => TaskGraph.Effort.Matches(a, q) || string.Equals(LegLabelOf(a), q, StringComparison.OrdinalIgnoreCase) || (!TaskGraph.Effort.IsAgentless(a) && string.Equals(AgentLabelOf(a.SourceId, a.RepoId), q, StringComparison.OrdinalIgnoreCase))).ToList();
        if (hits.Count == 0)
        {
            var agent = ResolveAgentRef(null, q);
            if (agent.Error is null && agent.RepoId is not null)
            {
                var key = TaskGraph.TaskGraphService.AssigneeKey(agent.Target.IsSelf ? null : agent.Target.Source!.Id, agent.RepoId);
                hits = legs.Where(a => a.Key == key).ToList();
            }
        }
        if (hits.Count == 1) return (hits[0], null);
        return (null, hits.Count == 0
            ? $"\\"{q}\\" is not a leg of task {TaskGraph.TaskGraphService.CardRef(node.Id)}; its legs: {string.Join(", ", legs.Select(LegLabelOf))}"
            : $"\\"{q}\\" matches {hits.Count} legs of task {TaskGraph.TaskGraphService.CardRef(node.Id)}; name it by full path or handle");
    }"""),
("""        card, `delete_task` (by #ref, full id or a unique prefix) hard-deletes it from the
        board — the card and its edges vanish from the Kanban and the Task graph.
""",
"""        card, `delete_task` (by #ref, full id or a unique prefix) hard-deletes it from the
        board — the card and its edges vanish from the Kanban and the Task graph.

        **Cross-repo efforts with typed legs** (cross-repo-effort-legs): one logical effort
        that spans repos — an orchestrator (e.g. web-flow-autodev) DRIVING product repos (prg,
        skratek, a prgcopies checkout) — is ONE card whose assignees are typed LEGS: each has
        `role` driver | driven, its own branch, PR and independently verified merge state
        (`merged`, `mergeState`), and a leg can be AGENTLESS (`agentless: true`, `path` = the
        checkout, e.g. prgcopies\\copy1\\prg) when no managed agent owns that repo — never
        attribute such work to a managed agent. `add_leg(id, role, machine/repoId | path,
        branch, pr)` adds one; `set_leg_role` / `remove_leg` type or drop one; `assign_task`
        takes `role` too. `list_tasks` returns `effort` per card: legs, merged/total,
        `partiallyMerged` (some legs merged, not all — the card is NOT done), drivers, driven,
        the unmerged legs and `mismatch` when the column claims merged while a leg is not.
        THE RULE: a card is done only when EVERY leg's PR is verified merged on GitHub — a
        merged driver PR alone never finishes it; report a partially merged card as exactly
        that, and never move a cross-repo card to pr-merged/done off one leg's PR. Agentless
        legs are never pinged: the driver works those checkouts and reports them through its
        harness tool `report_leg`; every repo agent can ask `my_effort` for its role and the
        siblings' states, so ask the agent before calling it idle.
"""),
], regex=[
(r'(public static string DispatchMessage\([^\)]*)\)', lambda m: m.group(1) + ', IReadOnlyList<string>? legLines = null)'),
])

# ---- ArchMcpServer: the tools -------------------------------------------------------------
edit('ClaudeWeb.App/Services/Arch/ArchMcpServer.cs', [
("""            "assign_task" => _arch.ToolAssignTask(S("id"), S("machine"), S("repoId"), S("assignees"), S("mode")),""",
"""            "assign_task" => _arch.ToolAssignTask(S("id"), S("machine"), S("repoId"), S("assignees"), S("mode"), S("role")),
            "add_leg" => _arch.ToolAddLeg(S("id"), S("role"), S("machine"), S("repoId"), S("path"), S("branch"), S("pr")),
            "remove_leg" => _arch.ToolRemoveLeg(S("id"), S("leg")),
            "set_leg_role" => _arch.ToolSetLegRole(S("id"), S("leg"), S("role")),"""),
("""                ("assignees", "string", "several assignees: comma-separated handles", false), ("mode", "string", "replace (default) | add | remove", false))),""",
"""                ("assignees", "string", "several assignees: comma-separated handles", false), ("mode", "string", "replace (default) | add | remove", false),
                ("role", "string", "type the assignee(s) named in this call as a leg of a cross-repo effort: driver | driven", false))),
        Tool("add_leg",
            "Add a typed LEG to a card (a cross-repo effort): role driver (the orchestrator, e.g. web-flow-autodev) or driven (a product repo it drives). The leg is a repo agent (machine + repoId / handle) OR an AGENTLESS checkout (path, e.g. C:\\\\prgcopies\\\\copy1\\\\prg on machine, default this one) that no managed agent owns — never attribute such work to a managed agent. Optional branch / pr record where its work lives so the verifier checks that leg on GitHub. The card is done only when EVERY leg's PR is verified merged; an agentless leg is never pinged — its driver works and reports it (report_leg).",
            Schema(("id", "string", "the task id, #ref or unique prefix", true), ("role", "string", "driver | driven", false),
                ("machine", "string", "the leg's machine: \\"self\\" (default) or a machine label", false), ("repoId", "string", "a repo agent: handle (spacex/prg#2), repoId or unique name (omit for an agentless leg)", false),
                ("path", "string", "an agentless checkout path on that machine (omit for an agent leg)", false),
                ("branch", "string", "the branch the leg's work is on", false), ("pr", "string", "the leg's pull request URL", false))),
        Tool("remove_leg",
            "Remove one leg from a card: by handle, checkout path or path tail (copy1/prg). The last leg leaving unassigns the card.",
            Schema(("id", "string", "the task id, #ref or unique prefix", true), ("leg", "string", "the leg: handle, checkout path or path tail", true))),
        Tool("set_leg_role",
            "Type one leg of a card as driver | driven, or none to untype it. The card records \\"A drives B\\".",
            Schema(("id", "string", "the task id, #ref or unique prefix", true), ("leg", "string", "the leg: handle, checkout path or path tail", true), ("role", "string", "driver | driven | none", true))),"""),
], regex=[
(r'(Tool\("list_tasks",\s*\n\s*")(.*?)(",\n\s*Schema\()', lambda m: m.group(1) + m.group(2) + ' Cross-repo efforts (cross-repo-effort-legs): assignees[] are typed LEGS (role driver | driven, agentless + path for a checkout no agent owns, merged = verified merged on GitHub, mergeState), and effort = {crossRepo, legs, merged, partiallyMerged, allMerged, drivers, driven, unmerged, mismatch} — a card is done only when EVERY leg is merged; partiallyMerged is a distinct state, never done.' + m.group(3)),
])

# ---- PolicemanSweep: agentless legs are not read or traced; a leg mismatch is flagged at once
edit('ClaudeWeb.App/Services/Policeman/PolicemanSweep.cs', [
("""                if (!TaskLifecycle.IsDelivered(a.Status) && a.PrUrl is null && a.PrNumber is null && a.RepoId.Length > 0)
                    wanted[a.Key] = (a.SourceId, a.RepoId);""",
"""                // An agentless leg (openspec cross-repo-effort-legs) has no agent to trace through;
                // the verifier resolves its PR from its own checkout's origin + recorded branch.
                if (!TaskLifecycle.IsDelivered(a.Status) && a.PrUrl is null && a.PrNumber is null && Effort.HasAgent(a))
                    wanted[a.Key] = (a.SourceId, a.RepoId);"""),
("""            var set = TaskGraphService.AssigneesOf(n).Where(a => !TaskLifecycle.IsDelivered(a.Status) && a.RepoId.Length > 0).ToList();""",
 """            var set = TaskGraphService.AssigneesOf(n).Where(a => !TaskLifecycle.IsDelivered(a.Status) && Effort.HasAgent(a)).ToList();"""),
("""        if (reason is null && against >= AgainstSweeps)
            reason = $"the column says {Word(n.Status)} but the facts show only {Word(n.VerifiedStatus)}, for {against} sweeps";""",
"""        // A cross-repo effort whose column claims merged while a leg is not (openspec
        // cross-repo-effort-legs) is flagged at once, EVERY leg named — never silently done.
        if (reason is null && Effort.MismatchReason(n, a => Effort.IsAgentless(a) ? Effort.LegLabel(a) + " (no agent)" : _agents.AgentLabel(a.SourceId, a.RepoId)) is { } mismatch)
            reason = mismatch;
        if (reason is null && against >= AgainstSweeps)
            reason = $"the column says {Word(n.Status)} but the facts show only {Word(n.VerifiedStatus)}, for {against} sweeps";"""),
])

# ---- Middleware, tools store, module registration ----------------------------------------
edit('ClaudeWeb.App/Services/Hosting/PasswordAuthMiddleware.cs', [
("""        if (path.Equals("/api/tasks/mcp", StringComparison.OrdinalIgnoreCase))
            return false;
""",
"""        if (path.Equals("/api/tasks/mcp", StringComparison.OrdinalIgnoreCase))
            return false;
        // The repo-agent tool server (openspec cross-repo-effort-legs): same contract, its
        // own per-process bearer token (checked constant-time in AgentToolsController).
        if (path.Equals("/api/agents/mcp", StringComparison.OrdinalIgnoreCase))
            return false;
"""),
])

edit('ClaudeWeb.App/Services/Tools/ToolsConfigStore.cs', [
("""    public string? BuildMcpConfigJson(string repoId, IEnumerable<string>? repoPaths = null)
    {
        var cfg = GetBirokrat(repoId);
        if (!cfg.Enabled) return null;

        var entry = ResolveServerEntry(repoPaths);
        if (string.IsNullOrEmpty(entry) || !File.Exists(entry))
        {
            _logger.Error($"[TOOLS] Birokrat enabled for repo {repoId} but server entry \\"{entry}\\" is missing — run gets no MCP config");
            return null;
        }

        var env = BuildEnv(cfg);
        var config = new Dictionary<string, object>
        {
            ["mcpServers"] = new Dictionary<string, object>
            {
                ["birokrat"] = new Dictionary<string, object>
                {
                    // Forward slashes like the reference chatbot — node accepts both.
                    ["command"] = "node",
                    ["args"] = new[] { entry.Replace('\\\\', '/') },
                    ["env"] = env,
                },
            },
        };
        return JsonSerializer.Serialize(config);
    }""",
"""    /// <summary>The harness's OWN servers for a repo agent's turn (openspec
    /// cross-repo-effort-legs): repoId → mcpServers entries, registered by the repo-agent tool
    /// service at startup. Null = none.</summary>
    public Func<string, IReadOnlyDictionary<string, object>?>? HarnessServers { get; set; }

    public string? BuildMcpConfigJson(string repoId, IEnumerable<string>? repoPaths = null)
    {
        var servers = new Dictionary<string, object>();
        // The harness's own tool server first (my_effort / report_leg …): every repo agent gets it.
        if (HarnessServers?.Invoke(repoId) is { } harness)
            foreach (var (name, entry) in harness) servers[name] = entry;

        var cfg = GetBirokrat(repoId);
        if (cfg.Enabled)
        {
            var entry = ResolveServerEntry(repoPaths);
            if (string.IsNullOrEmpty(entry) || !File.Exists(entry))
                _logger.Error($"[TOOLS] Birokrat enabled for repo {repoId} but server entry \\"{entry}\\" is missing — run gets no Birokrat MCP config");
            else
                servers["birokrat"] = new Dictionary<string, object>
                {
                    // Forward slashes like the reference chatbot — node accepts both.
                    ["command"] = "node",
                    ["args"] = new[] { entry.Replace('\\\\', '/') },
                    ["env"] = BuildEnv(cfg),
                };
        }
        if (servers.Count == 0) return null;
        return JsonSerializer.Serialize(new Dictionary<string, object> { ["mcpServers"] = servers });
    }"""),
])

edit('ClaudeWeb.App/Services/Hosting/EmbeddedApi.cs', [
("""            builder.Services.AddTasksModule(); // the Tasks agent: MCP tools over the ideas board + task graph (openspec tasks-agent)""",
"""            builder.Services.AddTasksModule(); // the Tasks agent: MCP tools over the ideas board + task graph (openspec tasks-agent)
            builder.Services.AddAgentsModule(); // the repo-agent tool server: my_effort / report_leg for every repo agent's turn (openspec cross-repo-effort-legs)"""),
])
print('all backend patches applied')
