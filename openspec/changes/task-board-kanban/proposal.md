# Proposal: task-board-kanban — an agent-operable task board shared by the operator and the arch agent

## Why

Ideas are where intent is written down; the Task graph is where steps are sequenced.
Neither is a place where WORK IS HANDED OUT: nothing on the board says which repo agent
on which machine should do a step, nobody tells that agent, and the arch agent cannot
read or write the board at all. The operator wants a kanban view of the same tasks,
assignment of tasks to repo agents across the fleet (by a person or a management agent),
and the arch agent reading the board and pinging the assignee that has not picked its
task up yet.

## What

- **One store, two views.** The existing task graph (`/api/taskgraph`) gains assignment
  and dispatch fields on its nodes; the Ideas surface gets a **Kanban** tab next to the
  Task graph: Backlog · Assigned · In progress · Done, drag between columns, an assignee
  picker fed by the fleet status (any repo agent on any machine), a "Ping assignee" button,
  blocked / awaiting-ping / pinged chips, and "＋ Task".
- **Assignment + dispatch API.** `POST /api/taskgraph/nodes/{id}/assign {sourceId, repoId,
  by}` and `POST /api/taskgraph/nodes/{id}/dispatch`. Dispatch composes a brief (title,
  note, prerequisites, a closing-line convention `TASK DONE <id>` / `TASK BLOCKED <id>: …`)
  and sends it through the arch send path with its rules; on `sent` the card moves to
  doing. Ideas promoted to tasks carry `ideaId`.
- **Arch MCP tools**: `list_tasks` (with `awaitingDispatch`), `create_task`, `update_task`,
  `assign_task`, `dispatch_task`, `list_ideas`, `idea_to_task`; the role prompt makes
  dispatching awaiting tasks and moving cards on `TASK DONE` / `TASK BLOCKED` its duty.

## Out of scope

Automatic detection of `TASK DONE` by the harness (the arch reads transcripts and moves
the card); a per-agent task queue inside repo agents; editing edges from the kanban.
