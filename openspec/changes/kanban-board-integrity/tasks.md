## 1. Build

- [x] 1.1 Board goal: `Goal`/`GoalUpdatedAt` on the board, snapshot and LWW merge; `SetGoal`;
      `PATCH /api/taskgraph/goal`; `goal` on `GET /api/taskgraph`; `boardGoal` in `list_tasks`.
- [x] 1.2 Node flags: `Manual`/`ManualAt`/`NeedsHuman` (`HumanRequest(At, By, Reason, RequestId)`);
      `SetManual` (drops a policeman stamp), `SetNeedsHuman` (with `onlyIfBy`); value equality.
- [x] 1.3 `BoardIntegrity`: pure `Judge` (manual / dishonest / stuck / honest), `StuckReason`,
      `Assess`, `Apply` (stamps + withdraws only its own marks).
- [x] 1.4 Verifier: `BoardVerifier` skips manual cards; `TaskVerificationPoller` runs the
      policeman after each pass and exposes `LastIntegrity`; `integrity` on `GET /api/taskgraph`
      and `GET /api/taskgraph/integrity`.
- [x] 1.5 Human request endpoints: `POST` / `DELETE /api/taskgraph/nodes/{id}/human`;
      `manual` on the node PATCH.
- [x] 1.6 Arch: `manual` + `needsHuman` in `list_tasks`, `awaitingDispatch` false for manual,
      `dispatch_task` / `update_task` refuse manual (status `manual`); role prompt paragraph.
- [x] 1.7 Kanban: goal panel + policeman line; 🆘 / ✋ / 👮 chips and card edges; ✋ toggle on
      the card, "Go manual / Back to auto", "Needs human" / "Resolved" in the detail; Ping
      disabled when manual; `needs-human` + `manual` filter flags.
- [x] 1.8 Tests: `BoardIntegrityTests` (backend), filter-flag test (client).

## 2. Verify

- [x] 2.1 `openspec validate kanban-board-integrity --strict`; .NET + client suites green;
      headless evidence (`client/tests/ui/shot-kanban-policeman.mjs`) → screenshots of the
      goal field, the 🆘 badge and the ✋ toggle.

## 3. Ship

- [ ] 3.1 PR against main (fleet task b2ea0809); merge and deploy on the Operator's word.

## 4. Follow-up (not this change)

- [ ] 4.1 human-delegation-watchers: `request_human` sets `NeedsHuman(by: "agent", requestId)`
      on the work card; the watcher's resolution clears it.
- [ ] 4.2 A goal-checking watcher condition (LLM judgement of the board against the goal on a
      timer) once watchers exist.
