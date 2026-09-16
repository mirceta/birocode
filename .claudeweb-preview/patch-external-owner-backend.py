# One-shot backend patch for openspec kanban-external-owner (board task 34707224).
# Exact-string / anchored replacements; every anchor is asserted unique so a drift fails loudly.
import re, sys, io

def edit(path, pairs, regex=()):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, f"{path}: anchor not unique/found:\n{old[:120]}"
        s = s.replace(old, new)
    for pat, fn in regex:
        m = list(re.finditer(pat, s, re.S))
        assert len(m) == 1, f"{path}: regex not unique/found: {pat[:80]} ({len(m)})"
        s = s[:m[0].start()] + fn(m[0]) + s[m[0].end():]
    open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', path)

# ---- TaskGraphService: the node field + setter ---------------------------------------------
edit('ClaudeWeb.App/Services/TaskGraph/TaskGraphService.cs', [
("""        CardObservation? Observation = null)
    {""",
"""        CardObservation? Observation = null,
        // Whose card (openspec kanban-external-owner): a DIFFERENT human developer's, outside
        // our authority — the verifier, the policeman and the arch leave it entirely alone
        // (see CardDomain). Distinct from Manual (the Operator's own, still our domain).
        string? ExternalOwner = null, long? ExternalOwnerAt = null)
    {"""),
("&& Manual == o.Manual && ManualAt == o.ManualAt && Equals(NeedsHuman, o.NeedsHuman) && Equals(Observation, o.Observation)",
 "&& Manual == o.Manual && ManualAt == o.ManualAt && Equals(NeedsHuman, o.NeedsHuman) && Equals(Observation, o.Observation)\n            && ExternalOwner == o.ExternalOwner && ExternalOwnerAt == o.ExternalOwnerAt"),
("""    /// <summary>Set (or clear with null) a card's "human assistance requested" state.""",
"""    /// <summary>Name the EXTERNAL human developer who owns a card, or clear it with a blank
    /// name (openspec kanban-external-owner). While set the card is out of our domain:
    /// nothing automatic touches it. Handing it over withdraws the policeman's OWN marks —
    /// its "needs human" stamp and its observation — since it is no longer ours to judge;
    /// an agent's or the Operator's stamp stays. Null for an unknown id.</summary>
    public Node? SetExternalOwner(string id, string? owner, long now)
    {
        var name = CardDomain.CleanOwner(owner);
        Node? updated;
        lock (_gate)
        {
            var i = _board.Nodes.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var cur = _board.Nodes[i];
            if (string.Equals(cur.ExternalOwner, name, StringComparison.Ordinal)) return cur;
            var needs = name is not null && cur.NeedsHuman?.By == BoardIntegrity.Policeman ? null : cur.NeedsHuman;
            var obs = name is not null && cur.Observation?.By == BoardIntegrity.Policeman ? null : cur.Observation;
            updated = cur with { ExternalOwner = name, ExternalOwnerAt = name is null ? null : now, NeedsHuman = needs, Observation = obs, UpdatedAt = now };
            _board.Nodes[i] = updated;
            Save();
        }
        _logger.Info($"[TASKGRAPH] node {id} externalOwner={(name is null ? "cleared" : name)}");
        RaiseChanged();
        return updated;
    }

    /// <summary>Set (or clear with null) a card's "human assistance requested" state."""),
])

# ---- BoardIntegrity: the external verdict -------------------------------------------------
edit('ClaudeWeb.App/Services/TaskGraph/BoardIntegrity.cs', [
("""///   manual    — the Operator handles the card by hand: not policed at all;
///   honest    — everything else.""",
"""///   manual    — the Operator handles the card by hand: not policed at all;
///   external  — a DIFFERENT human developer owns the card (openspec kanban-external-owner):
///               out of our domain, not ours to judge — never stuck, dishonest or flagged;
///   honest    — everything else."""),
("""    public const string ManualState = "manual";
""",
"""    public const string ManualState = CardDomain.ManualState;
    public const string ExternalState = CardDomain.ExternalState;
"""),
("""    /// <summary>One pass's verdict: counts per state and the flagged cards (dishonest + stuck).</summary>
    public sealed record Summary(long CheckedAt, int Cards, int Honest, int Dishonest, int Stuck, int Manual, IReadOnlyList<CardIntegrity> Flagged);""",
"""    /// <summary>One pass's verdict: counts per state and the flagged cards (dishonest + stuck).
    /// <c>External</c> (openspec kanban-external-owner) trails with a default so older callers
    /// still construct it.</summary>
    public sealed record Summary(long CheckedAt, int Cards, int Honest, int Dishonest, int Stuck, int Manual, IReadOnlyList<CardIntegrity> Flagged, int External = 0);"""),
("""        if (n.Manual) return new CardIntegrity(n.Id, n.Title, ManualState, "manual — the Operator handles it directly; not policed");
""",
"""        // Out of our domain first (openspec kanban-external-owner): another human's card is
        // theirs whatever its facts say — not judged at all, so never stuck or dishonest.
        if (CardDomain.IsExternal(n)) return new CardIntegrity(n.Id, n.Title, ExternalState, CardDomain.HandsOffReason(n));
        if (n.Manual) return new CardIntegrity(n.Id, n.Title, ManualState, "manual — the Operator handles it directly; not policed");
"""),
("""        judged.Count(j => j.State == ManualState),
        judged.Where(j => j.State is Dishonest or Stuck).ToList());""",
"""        judged.Count(j => j.State == ManualState),
        judged.Where(j => j.State is Dishonest or Stuck).ToList(),
        judged.Count(j => j.State == ExternalState));"""),
("""    /// or flipped to manual). Never clears an agent's or the Operator's request.</summary>""",
"""    /// or flipped to manual, or handed to an external owner). Never clears an agent's or the
    /// Operator's request.</summary>"""),
])

# ---- BoardVerifier: skip external cards ---------------------------------------------------
edit('ClaudeWeb.App/Services/TaskGraph/BoardVerifier.cs', [
("""            if (start.Manual) { notes.Add($"{start.Title}: manual — not verified"); continue; }""",
"""            if (start.Manual) { notes.Add($"{start.Title}: manual — not verified"); continue; }
            // An EXTERNALLY OWNED card (openspec kanban-external-owner) is another human's:
            // out of our domain, so no probing, no advance, no badge either.
            if (CardDomain.IsExternal(start)) { notes.Add($"{start.Title}: external — owned by {start.ExternalOwner}, not verified"); continue; }"""),
])

# ---- Controller: POST / DELETE /api/taskgraph/nodes/{id}/owner ----------------------------
edit('ClaudeWeb.App/Controllers/TaskGraphController.cs', [
("""    public record HumanRequestBody(string? Reason);""",
"""    public record HumanRequestBody(string? Reason);
    /// <summary>The external human developer who owns a card (openspec kanban-external-owner).</summary>
    public record OwnerRequest(string? Name);"""),
("""    /// <summary>The Operator dismisses the policeman's observation on a card (openspec""",
"""    /// <summary>Hand a card to a DIFFERENT human developer (openspec kanban-external-owner):
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

    /// <summary>The Operator dismisses the policeman's observation on a card (openspec"""),
])

# ---- ArchAgentService: list_tasks + refusals + role prompt --------------------------------
edit('ClaudeWeb.App/Services/Arch/ArchAgentService.cs', [
("""                        awaitingDispatch = !TaskGraph.TaskLifecycle.IsDelivered(a.Status) && a.AssignedAt is not null && a.DispatchedAt is null && !blocked && !n.Manual,""",
 """                        awaitingDispatch = !TaskGraph.TaskLifecycle.IsDelivered(a.Status) && a.AssignedAt is not null && a.DispatchedAt is null && !blocked && !TaskGraph.CardDomain.IsHandsOff(n),"""),
("""                    awaitingDispatch = n.Status == "todo" && n.RepoId is not null && n.AssignedAt is not null && n.DispatchedAt is null && !blocked && !n.Manual,""",
 """                    awaitingDispatch = n.Status == "todo" && n.RepoId is not null && n.AssignedAt is not null && n.DispatchedAt is null && !blocked && !TaskGraph.CardDomain.IsHandsOff(n),"""),
("""                    manual = n.Manual,
                    needsHuman = n.NeedsHuman is null ? null""",
"""                    manual = n.Manual,
                    // Whose card (openspec kanban-external-owner): a named EXTERNAL human
                    // developer's — out of our domain; never dispatch, update, move or judge it.
                    externalOwner = n.ExternalOwner, externalOwnerAt = n.ExternalOwnerAt,
                    needsHuman = n.NeedsHuman is null ? null"""),
("""        // A MANUAL card (openspec kanban-board-integrity) is not the arch's to move.
        if (cur.Manual) return new ToolOutcome(false, "manual", $"task {id} is manual — the Operator handles it directly; the card was not changed");""",
"""        // A MANUAL card (openspec kanban-board-integrity) is not the arch's to move; an
        // EXTERNALLY OWNED one (openspec kanban-external-owner) is not even ours.
        if (TaskGraph.CardDomain.Refusal(cur, "the card was not changed") is { } handsOff) return new ToolOutcome(false, handsOff.Status, handsOff.Message);"""),
("""        // A MANUAL card (openspec kanban-board-integrity) is the Operator's to drive by
        // talking to the repo agent directly — nothing is sent for it, by anyone.
        if (node.Manual) return new ToolOutcome(false, "manual", $"task {id} is manual — the Operator handles it directly with the repo agent; nothing was sent (flip it back on the card to let the harness dispatch)");""",
"""        // A MANUAL card (openspec kanban-board-integrity) is the Operator's to drive by
        // talking to the repo agent directly — nothing is sent for it, by anyone. An
        // EXTERNALLY OWNED card (openspec kanban-external-owner) is another human's.
        if (TaskGraph.CardDomain.Refusal(node, "nothing was sent (clear it on the card to let the harness dispatch)") is { } handsOff) return new ToolOutcome(false, handsOff.Status, handsOff.Message);"""),
("""        dispatch, update, move or judge a manual card — `dispatch_task` and
        `update_task` refuse it (status `manual`); it never appears as `awaitingDispatch`.
""",
"""        dispatch, update, move or judge a manual card — `dispatch_task` and
        `update_task` refuse it (status `manual`); it never appears as `awaitingDispatch`.
        A card with `externalOwner` set is OUT OF OUR DOMAIN: a different human developer
        owns it entirely and we have no authority over it — distinct from manual (still
        the Operator's). Never dispatch, update, move, verify, judge or report it as stuck,
        dishonest or needing a human; `dispatch_task` and `update_task` refuse it (status
        `external`); it never appears as `awaitingDispatch`. Mention it only as "owned by
        <name> (external)" when the Operator asks about it.
"""),
])

# ---- Policeman tools, status and prompt ---------------------------------------------------
edit('ClaudeWeb.App/Services/Arch/ArchAgentService.Policeman.cs', [
("""            verdict = new { checkedAt = verdict.CheckedAt, cards = verdict.Cards, honest = verdict.Honest, dishonest = verdict.Dishonest, stuck = verdict.Stuck, manual = verdict.Manual, flagged = verdict.Flagged },""",
 """            verdict = new { checkedAt = verdict.CheckedAt, cards = verdict.Cards, honest = verdict.Honest, dishonest = verdict.Dishonest, stuck = verdict.Stuck, manual = verdict.Manual, external = verdict.External, flagged = verdict.Flagged },"""),
("""            id = n.Id, @ref = TaskGraphService.CardRef(n.Id), title = n.Title, status = n.Status, manual = n.Manual,
            by = n.NeedsHuman!.By""",
 """            id = n.Id, @ref = TaskGraphService.CardRef(n.Id), title = n.Title, status = n.Status, manual = n.Manual, externalOwner = n.ExternalOwner,
            by = n.NeedsHuman!.By"""),
("""            $"{s.Cards} card(s): {s.Honest} honest, {s.Dishonest} dishonest, {s.Stuck} stuck, {s.Manual} manual; {needsHuman.Count} carry a human request",
            new { checkedAt = s.CheckedAt, cards = s.Cards, honest = s.Honest, dishonest = s.Dishonest, stuck = s.Stuck, manual = s.Manual, flagged, needsHuman,""",
 """            $"{s.Cards} card(s): {s.Honest} honest, {s.Dishonest} dishonest, {s.Stuck} stuck, {s.Manual} manual, {s.External} external (another human's — not ours); {needsHuman.Count} carry a human request",
            new { checkedAt = s.CheckedAt, cards = s.Cards, honest = s.Honest, dishonest = s.Dishonest, stuck = s.Stuck, manual = s.Manual, external = s.External, flagged, needsHuman,"""),
("""        if (cur.Manual) return new ToolOutcome(false, "manual", $"task {TaskGraphService.CardRef(resolved)} is manual — the Operator handles it directly; not flagged");""",
 """        if (CardDomain.Refusal(cur, "not flagged") is { } handsOff) return new ToolOutcome(false, handsOff.Status, handsOff.Message);"""),
("""        if (cur.Manual) return new ToolOutcome(false, "manual", $"task {cref} is manual — the Operator handles it directly; not observed");""",
 """        if (CardDomain.Refusal(cur, "not observed") is { } handsOff) return new ToolOutcome(false, handsOff.Status, handsOff.Message);"""),
("""        if (cur.Manual) return new ToolOutcome(false, "manual", $"task {cref} is manual — the Operator handles it directly; not touched");""",
 """        if (CardDomain.Refusal(cur, "not touched") is { } handsOff) return new ToolOutcome(false, handsOff.Status, handsOff.Message);"""),
])

edit('ClaudeWeb.App/Services/Arch/ArchPoliceman.cs', [
("which cards are manual (not yours), and every card that already carries",
 "which cards are manual or externally owned (not yours), and every card that already carries"),
("that has an assignee and is not manual, call read_transcript",
 "that has an assignee and is neither manual nor externally owned, call read_transcript"),
("Leave manual cards alone. Never re-ping anyone.",
 "Leave manual cards alone. Leave EXTERNALLY OWNED cards (externalOwner set: a different human developer's, out of our domain) entirely alone — never read, observe, move, flag or report them as stuck or dishonest; they are not yours to judge. Never re-ping anyone."),
("N honest · N dishonest · N need human · N manual, then one line per card you moved",
 "N honest · N dishonest · N need human · N manual · N external, then one line per card you moved"),
("""        sb.AppendLine($"Board now: {s.Cards} cards — {s.Honest} honest · {s.Dishonest} dishonest · {s.Stuck} stuck · {s.Manual} manual.");""",
 """        sb.AppendLine($"Board now: {s.Cards} cards — {s.Honest} honest · {s.Dishonest} dishonest · {s.Stuck} stuck · {s.Manual} manual · {s.External} external.");"""),
])

# ---- MCP tool descriptions ----------------------------------------------------------------
def append_desc(name, extra):
    pat = r'(Tool\("' + name + r'",\s*\n\s*")(.*?)(",\n\s*Schema\()'
    return (pat, lambda m: m.group(1) + m.group(2) + ' ' + extra + m.group(3))

edit('ClaudeWeb.App/Services/Arch/ArchMcpServer.cs', [
("counts (honest / dishonest / stuck / manual), every flagged card",
 "counts (honest / dishonest / stuck / manual / external), every flagged card"),
("Re-observe only when the state or the summary changed. Refused on a manual card.",
 "Re-observe only when the state or the summary changed. Refused on a manual card and on an externally owned card (status external — another human's, out of our domain)."),
("Returns moved | linked | unchanged, always with the reason. Refused on a manual card.",
 "Returns moved | linked | unchanged, always with the reason. Refused on a manual card and on an externally owned card (status external)."),
("The Operator sees a prominent 🆘 badge and resolves it on the card. Refused on a manual card.",
 "The Operator sees a prominent 🆘 badge and resolves it on the card. Refused on a manual card and on an externally owned card (status external — not ours to judge)."),
], regex=[
append_desc("list_tasks", "externalOwner (openspec kanban-external-owner) names a DIFFERENT human developer who owns the card: it is out of our domain — never dispatch, update, verify or judge it; it is never awaitingDispatch."),
append_desc("update_task", "Refused with status manual on a manual card and status external on a card owned by an external human developer (out of our domain)."),
append_desc("dispatch_task", "Refused with status manual on a manual card and status external on a card owned by an external human developer — nothing is sent."),
])
print('all backend patches applied')
