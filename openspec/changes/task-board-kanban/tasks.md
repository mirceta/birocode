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

- [x] 4.1 Unit tests: dispatch brief, node JSON compatibility, tool list (15).
- [x] 4.2 Live, Management App: Kanban renders four columns; a task created there appears in
      Backlog; assigning moves it to Assigned with "awaiting ping"; Ping sends the brief to
      a real (idle, local) repo agent and the card moves to In progress with the pinged
      chip; the agent's reply ends with TASK DONE; the card can be dragged to Done.
- [ ] 4.3 Arch tool path: `list_tasks` shows the board; an operator-driven arch turn with
      the loop armed dispatches an awaiting task by itself.
- [ ] 4.4 Deploy (self-upgrade), docs (understanding app), memory.
      DONE 2026-09-05 20:26 on live (check-kanban.mjs 10/10): task created in Backlog, assigned
      to birokrat-ai-platform → Assigned with "awaiting ping", Ping → `sent`, card In progress
      with the pinged chip and dispatchedAt/dispatchCount stamped, dragged to Done; the repo
      agent replied exactly "TASK DONE 2b7dc04c68ef4225a0219f34caffb374". Follow-up: graph nodes
      with a pre-board repo label are "📎 label only" and never count as awaiting dispatch.
