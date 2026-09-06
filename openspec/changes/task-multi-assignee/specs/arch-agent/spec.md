## ADDED Requirements

### Requirement: The arch creates, assigns, dispatches and reads multi-assignee tasks
`create_task`, `assign_task` and `idea_to_task` SHALL accept `assignees` (comma-separated
handles, raw ids or unique names; `assign_task` with `mode` replace | add | remove);
`dispatch_task` SHALL ping every assignee not yet pinged or the named subset and SHALL
answer `sent`, `partial` or the first failure with per-assignee results; `update_task`
SHALL accept `assignee` to move that assignee's state and record its branch/PR, SHALL
apply a status without `assignee` to every assignee, and SHALL refuse a branch/PR claim
without `assignee` on a task with several assignees; `list_tasks` SHALL return
`assignees[]` with each one's handle, status, dispatch record, linkage, verified state,
warning, stale and awaitingDispatch, and its machine / agent filters SHALL match any
assignee. The role prompt SHALL tell the arch these rules.

#### Scenario: Cross-repo task
- **WHEN** the arch calls `create_task` with assignees "spacex/prg, MONSTER/skratek-projects" and later `dispatch_task`
- **THEN** both agents receive the brief, each told which repo is its own, and `list_tasks` shows both assignees at doing

#### Scenario: Relaying one agent's closing line
- **WHEN** the arch calls `update_task` with assignee "spacex/prg", status committed and a branch
- **THEN** prg's assignee is committed with that branch while skratek's is unchanged
