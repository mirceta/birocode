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

- [ ] 4.1 Unit tests: dispatch brief, node JSON compatibility, tool list (15).
- [ ] 4.2 Live, Management App: Kanban renders four columns; a task created there appears in
      Backlog; assigning moves it to Assigned with "awaiting ping"; Ping sends the brief to
      a real (idle, local) repo agent and the card moves to In progress with the pinged
      chip; the agent's reply ends with TASK DONE; the card can be dragged to Done.
- [ ] 4.3 Arch tool path: `list_tasks` shows the board; an operator-driven arch turn with
      the loop armed dispatches an awaiting task by itself.
- [ ] 4.4 Deploy (self-upgrade), docs (understanding app), memory.
