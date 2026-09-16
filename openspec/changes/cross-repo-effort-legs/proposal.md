# Cross-repo efforts: typed driver/driven legs on one card, per-leg verified merge, done only when EVERY leg is merged

## Why

One logical effort often spans two or more repositories kept apart on purpose: an
orchestrator (web-flow-autodev) DRIVES product repos (prg, skratek, a `prgcopies\copy1\prg`
checkout). On the board that split was invisible, and it just produced a dangerous false
state: the Knjiga-pošte card (cbc74bc0) was marked done/merged off a single PR (#21 in
web-flow-autodev) while its prg leg (PR #166) was NOT merged. The prg work was done in an
agentless checkout that no managed agent owns, so it was on no card at all, and nothing on
the board could say "this effort has two legs and only one is merged".

The multi-assignee model (openspec task-multi-assignee) already carries per-assignee
branch / PR / verified state and aggregates "the card is as far as its slowest assignee". What
it lacked: roles, legs without an agent, the partial state being named, a way for the agent
that knows the effort to say so, and the policeman naming the mismatch.

## What changes

1. **EFFORT = one card with TYPED LEGS.** An assignee is a leg; it gains `Role` (driver |
   driven | null) and `Path` (an agentless checkout). The card records "A drives B":
   `list_tasks` returns each leg's `role`, `agentless`, `path`, `merged`, `mergeState` and a
   per-card `effort` (legs, merged, `partiallyMerged`, `allMerged`, drivers, driven, unmerged,
   `mismatch`). Tools: `add_leg`, `remove_leg`, `set_leg_role`, `assign_task(role)`; API:
   `POST /api/taskgraph/nodes/{id}/legs`, `POST …/legs/role`.
2. **PER-LEG PR + VERIFIED MERGE.** Unchanged in principle (per assignee since
   task-multi-assignee) and now complete: an agentless leg is probed at its own checkout path
   and its PR resolved from that checkout's origin + recorded branch, so every leg is checked
   on GitHub independently.
3. **DONE ONLY WHEN EVERY LEG IS MERGED.** The aggregate rule already forbids it; this change
   NAMES the partial state (`Effort.Summarize(...).PartiallyMerged`, the card's "N of M legs
   merged — partially merged, not done") and catches the claim: a column that says pr-merged /
   done while a leg is not verified merged is judged **dishonest** with every leg named
   (`Effort.MismatchReason`) — by the board check and by the policeman sweep, at once. Claims
   stay advisory (never clamped, per the Operator's rule); the harness never *verifies* such a
   card done.
4. **AGENTLESS DRIVEN LEGS** are first-class: `path` + branch (+ PR), synthetic repo id
   `path:<path>`, never attributed to a managed agent, never pinged (dispatch refuses / skips
   them and says the driver works and reports them), never read by the policeman.
5. **AGENT SELF-INSPECTION.** A repo-agent tool server (`RepoAgentMcpServer`, `POST
   /api/agents/mcp?repo=<id>`, bearer + per-repo identity written by the harness) injected into
   every repo agent's turn: `my_effort` (which effort am I in, my role, what I drive / who
   drives me, the shared goal, every sibling leg's branch / PR / merge state, partially merged
   or not) and `report_leg` (record a leg's branch / commit / PR — my own, or as the DRIVER the
   legs I drive, since an agentless checkout cannot report for itself). This is the server
   human-delegation-watchers planned as `repo-agent-tools`; `request_human` lands here next.
6. **POLICEMAN CHECKS EVERY LEG.** The verifier already verifies each leg; the sweep now skips
   agentless legs when reading transcripts and tracing PRs (nothing to read; the verifier owns
   them) and flags a cross-repo mismatch immediately with every leg named. The dispatch brief
   lists every leg, the done rule and the two tools.
7. **CARD-SECTIONS UI.** A **Legs** section (only on efforts): one row per leg — role glyph,
   name (agent handle or path tail + "no agent"), status, merge state linked to the PR —
   with the brief "N of M legs merged" (amber when partially merged, green when all); the
   Board check text on a merged/done claim is the mismatch reason; a `partially merged`
   filter flag; in the detail a role select per leg and an "add leg" row (role, agent or
   checkout path, branch, PR URL); agentless chips read "copy1/prg (no agent)".

## Composition (read first; nothing forked)

- **task-multi-assignee**: legs ARE assignees — the same list, key, per-assignee verification,
  aggregate and `WithAssignees` mirror; two new optional fields.
- **kanban-card-sections / policeman-observes-agents / one-policeman**: `legsOf` sits beside
  `boardCheckOf` / `observationOf` / `ownerOf`; the Board check reuses its `unverified` key
  with the mismatch text; `BoardIntegrity.Judge` and `PolicemanSweep.Flag` gain one rule each.
- **kanban-external-owner / manual**: the leg tools go through `CardDomain.Refusal`; hands-off
  cards are skipped before any leg logic runs.
- **human-delegation-watchers** (PR #96, proposal only): the repo-agent tool server it planned
  now exists (`Services/Agents`), modelled on the arch's and Tasks' servers and injected through
  `ToolsConfigStore.BuildMcpConfigJson` (chat, loops and arch sends all pass through it);
  `request_human` should be added to `RepoAgentToolbox`, not to a second server.

## Impact

- Backend: `Effort` (new), `TaskGraphService` (`Assignee.Role/Path`, `AddLeg`, `SetLegRole`),
  `BoardVerifier` (agentless probing + PR resolution), `BoardIntegrity` (mismatch rule),
  `PolicemanSweep` (skip agentless, mismatch flag), `TaskGraphController` (legs endpoints),
  `ArchAgentService` (`list_tasks` effort, tools, dispatch, brief, role prompt v12),
  `ArchMcpServer` (3 tools + role), `Services/Agents/*` + `AgentToolsController` (new),
  `ToolsConfigStore.HarnessServers`, `PasswordAuthMiddleware` exemption, module registration.
- Client: `cardSections.js` (`legsOf`, `ROLES`, merge words, Board check mismatch),
  `taskFilters.js` (`partial-merge` flag, agentless chip label), `KanbanBoard.jsx` (Legs
  section, detail editor, role select), `kanban.css`; the Management App bundle rebuilt.
- Tests: `CrossRepoEffortTests` (8, incl. the Knjiga-pošte regression),
  `cardSections.legs.test.mjs` (6), `shot-kanban-effort-legs.mjs` (10/10),
  `check-effort-legs-api.mjs` on an isolated instance.
- Specs: `task-graph`, `arch-agent`, new capability `repo-agent-tools`.

## Out of scope (follow-ups)

- `request_human` on the repo-agent server (human-delegation-watchers).
- A peer's agentless leg probed by the peer's own poller (today only its PR URL is checked).
- Retyping the live Knjiga-pošte card (an Operator action on the board, not code).
