# Design: task-board-kanban

- **D1 — Same nodes.** The kanban is a projection: column = f(status, assignee). No second
  store, so the graph, the kanban and the arch's `list_tasks` never disagree, and the
  existing ideas-hub sync carries the new fields (all optional; old peers ignore them).
- **D2 — Assignee = machine + repo.** `SourceId` (collector source id, null = this
  harness) + `RepoId`, the same addressing the fleet arch already uses. The picker is fed
  by `/api/arch/fleet/status`, so every docked or managed agent on every machine is
  offered; `🏛` marks the ones in the arch scope, which are the only ones a dispatch can
  reach (the send path's `unmanaged` refusal says so).
- **D3 — Dispatch reuses send_task.** One path, one rule set: managed, claimed, busy,
  allow/accept sends across machines. The operator's button skips only the armed-loop
  rule (a person pressing a button is the arm); the arch's tool keeps it.
- **D4 — Doing means "the agent has it".** `sent` moves the card to doing and stamps
  `dispatchedAt` / `dispatchCount`; `awaitingDispatch` is the arch's cue and is false once
  pinged, so a wake never re-pings by accident.
- **D5 — Closing-line convention.** The brief asks the repo agent to end with `TASK DONE
  <id>` or `TASK BLOCKED <id>: <why>`; the arch, which reads transcripts anyway, moves the
  card. Cheap, robust, needs nothing inside the repo agent.
