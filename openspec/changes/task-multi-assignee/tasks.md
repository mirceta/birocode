## 1. Build

- [x] 1.1 Model: `Assignee` record, `Node.Assignees` (trailing, optional) with value
      equality; `AssigneesOf`, `AggregateStatus`, `IsUnverified(Node)`, `WithAssignees`
      (legacy fields mirror the primary), `Normalize` on load and sync merge;
      `SetAssignees` / `AddAssignee` / `RemoveAssignee` / `SetAssigneeStatus`; per-assignee
      `MarkDispatched` / `RecordClaim` / `ApplyVerification`; `IsStale` per assignee;
      `UpdateNode(status)` broadcasts, legacy `repoId` PATCH replaces the set.
- [x] 1.2 Verifier: `BoardVerifier` walks every assignee (local facts + PR facts each),
      reports per-assignee moves and the card's aggregate move.
- [x] 1.3 Arch tools: `ResolveAssigneeRefs`; `create_task` / `idea_to_task` `assignees`;
      `assign_task` `assignees` + `mode`; `dispatch_task` every not-yet-pinged assignee or
      a named subset, brief with own repo + co-assignees, `sent` / `partial`; `update_task`
      `assignee` (+ `machine`); `list_tasks` `assignees[]` and any-assignee filters; MCP
      catalogue descriptions + schemas; role prompt paragraph, marker v10.
- [x] 1.4 API: `POST /api/taskgraph/nodes/{id}/assign` takes `assignees[] + mode`;
      `POST /api/taskgraph/nodes/{id}/dispatch` takes an optional `assignees[]` subset.
- [x] 1.5 Client: `assigneesOf` + `taskView.machines/agents` + any-match + facets once per
      key (`taskFilters.js`); `assigneeKeys` (`graphColors.js`); Kanban chips per assignee,
      add / remove assignees, Ping assignees; Task graph assignee row + double border,
      palette and legends over every assignee, legend repo toggle over all handles; CSS.
- [x] 1.6 Tests: `TaskMultiAssigneeTests` (13), `taskFilters.test.mjs` any-match, marker pin.

## 2. Verify

- [x] 2.1 .NET + client suites green; isolated :5200 instance: a two-assignee card via the
      assign endpoint — Kanban shows two chips with their own status and the remove ×;
      the graph node shows the assignee row (two chips) and the legends count both
      machines; the machine filter matches the card for either machine; single-assignee
      cards unchanged.
      DONE 2026-09-06 22:30 — .NET 415 pass (13 new in `TaskMultiAssigneeTests`), client 30
      pass; detached run `verify-multi-assignee.mjs` → `@@MULTIASSIGNEE@@ pass:true, 29
      checks` (log `.claudeweb-preview/out-multi-assignee.log`, evidence stamp
      2026-09-06T20-30-00): assign with assignees[] → two assignees, legacy mirror = first,
      card todo → doing broadcast, mode remove / add, single card unchanged, catalogue
      advertises assignees / mode / assignee; Kanban two chips with own status, × remove,
      add picker, "Ping assignees", agent filter via the second assignee; graph assignee
      row of two chips, double border, both repos in the legend; no page errors.
      `openspec validate task-multi-assignee --strict` valid.

## 3. Ship

- [ ] 3.1 Commit on `feature/task-multi-assignee`, merge origin/main, push, open the PR
      (task e5d29bf9796142cd909611abb247198e); merge and deploy on the Operator's word.
