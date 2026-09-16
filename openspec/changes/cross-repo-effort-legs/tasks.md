## 1. Build

- [x] 1.1 Model: `Assignee.Role` / `Assignee.Path`; `Effort` (agentless ids, labels, merge
      words, `Summarize`, `MismatchReason`, `Matches`); `AddLeg`, `SetLegRole`; the card
      warning names legs by label.
- [x] 1.2 Verifier: an agentless leg on this machine is probed at its path; its PR is
      resolved from the checkout's origin + branch; the path joins the live-merge clone map.
- [x] 1.3 Judge + policeman: `BoardIntegrity.Judge` and `PolicemanSweep.Flag` report a
      cross-repo mismatch (column claims merged, a leg is not) as dishonest with every leg
      named; the sweep neither reads nor traces agentless legs.
- [x] 1.4 API: `POST /api/taskgraph/nodes/{id}/legs`, `POST …/legs/role`.
- [x] 1.5 Arch: `list_tasks` (per-leg role / agentless / path / merged / mergeState; per-card
      `effort`), `add_leg` / `remove_leg` / `set_leg_role`, `assign_task(role)`,
      `update_task(assignee=path)`, dispatch skips agentless legs (status `agentless`), the
      brief lists legs + the done rule + the tools, role prompt v12.
- [x] 1.6 Repo-agent tool server: `RepoAgentToolbox` (`my_effort`, `report_leg`),
      `RepoAgentMcpServer`, `RepoAgentToolsService` (hosted, bearer, registers the harness
      entry on `ToolsConfigStore`), `AgentToolsController` (`POST /api/agents/mcp?repo=`),
      middleware exemption, `AddAgentsModule`.
- [x] 1.7 Kanban: `legsOf` + `ROLES` + merge words; the Legs section; the Board check's
      mismatch text; `partial-merge` filter flag; agentless chip labels; the detail's role
      select per leg and "add leg" row; CSS; the Management App bundle rebuilt.
- [x] 1.8 Tests: `CrossRepoEffortTests` (8 — the Knjiga-pošte regression, aggregate,
      agentless leg + reload, probe at path, summary, dispatch/brief, the tool server),
      `cardSections.legs.test.mjs` (6); the arch tool-catalogue tests updated (27 tools, v12).

## 2. Verify

- [x] 2.1 `openspec validate cross-repo-effort-legs --strict`; .NET suite green; client
      suite green.
- [x] 2.2 Headless evidence `client/tests/ui/shot-kanban-effort-legs.mjs` (10/10) →
      `docs/screenshots/kanban-effort-legs.png`, `kanban-effort-legs-detail.png`.
- [x] 2.3 Isolated instance `.claudeweb-preview/effort-legs-e2e.ps1` →
      `check-effort-legs-api.mjs` (15/15): legs endpoints, the agentless checkout probed at
      its path, a done claim judged dishonest with the leg named, the agent MCP endpoint
      guarded by its bearer.

## 3. Ship

- [ ] 3.1 PR against main (fleet task 68d33734); the Operator merges by hand; no deploy here.
- [ ] 3.2 On the live board: type the Knjiga-pošte card's legs (web-flow driver, prg driven
      with PR #166) so the verifier checks both — an Operator action.

## 4. Follow-up (not this change)

- [ ] 4.1 `request_human` on the repo-agent tool server (human-delegation-watchers).
- [ ] 4.2 A peer's agentless leg verified by the peer's own poller (today: PR URL only).
- [ ] 4.3 The Task graph view drawing roles (driver → driven arrows) beside the Kanban's Legs.
