## 1. Store + API

- [x] 1.1 `TaskGraphService.Node` gains SourceId / AssignedBy / AssignedAt / DispatchedAt /
      DispatchCount / CreatedBy / IdeaId (optional; sync-compatible); `Assign`,
      `MarkDispatched`, `Find`, `Prerequisites`, `IsBlocked`.
- [x] 1.2 `POST nodes/{id}/assign`, `POST nodes/{id}/dispatch`; node create accepts
      sourceId / createdBy / ideaId.

## 2. Arch agent

- [x] 2.1 `DispatchTask` + `DispatchMessage`; `SendTask(requireArmed)`; tools list_tasks,
      create_task, update_task, assign_task, dispatch_task, list_ideas, idea_to_task; role
      prompt section "The task board".

## 3. Kanban view

- [x] 3.1 `KanbanBoard.jsx` + styles; Ideas tab "🗂 Kanban"; "Send to graph" stamps ideaId.

## 4. Verify

- [x] 4.1 Unit tests: dispatch brief, node JSON compatibility, tool list (15). 222/222.
- [x] 4.2 Live, Management App (check-kanban.mjs 10/10, 2026-09-05 20:26): task created in
      Backlog, assigned to birokrat-ai-platform → Assigned with "awaiting ping", Ping →
      `sent`, card In progress with the pinged chip and dispatchedAt/dispatchCount stamped,
      dragged to Done; the repo agent replied exactly "TASK DONE 2b7dc04c68ef4225a0219f34caffb374".
      Follow-up: graph nodes with a pre-board repo label are "📎 label only" and never count
      as awaiting dispatch (they would have been pinged unasked).
- [x] 4.3 Arch tool path (2026-09-05 20:29, live, loop armed by the operator): a task assigned
      through the board; one operator line to the arch ("dispatch what awaits") → the arch
      called `list_tasks` (12 tasks, exactly one awaitingDispatch) then `dispatch_task` →
      `sent`, card doing (ping #1), and reported the id + status; the repo agent answered
      "TASK DONE 395bce506f1a48fba8d9b5542bc6e51d". Test cards deleted afterwards.
- [x] 4.4 Deployed by self-upgrade (295fa51, then e4840ca); understanding app has the task
      board flow; memory updated.
