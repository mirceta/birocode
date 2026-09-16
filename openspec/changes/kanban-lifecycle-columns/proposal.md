# Kanban lifecycle columns with harness-verified transitions

## Why

The Kanban has only `todo | doing | done`, and "done" means "the agent said it
finished". That hides the real state of the work: an agent can finish, commit on
a local feature branch, never push, return to main — and the branch is forgotten
on that one machine (e.g. `feature/pin-conversation-lanes` committed but never
pushed on living room; `feature/handles` pushed + PR'd only because the Operator
asked by hand). A task whose branch sits unpushed on one machine is not done;
the board must not be able to say it is.

## What Changes

- **Statuses** become the delivery lifecycle: `todo → doing → committed →
  pr-opened → pr-merged → done`. `blocked` stays a flag, not a column.
  - `committed` — work committed on a named branch, not yet on origin.
  - `pr-opened` — branch pushed, PR exists, link stored on the card.
  - `pr-merged` — PR merged into the default branch.
  - `done` — merged AND, where the repo is a deployed harness, the merge commit
    is live on at least the machine that did the work; otherwise done = merged.
- **Task ↔ branch ↔ PR linkage** stored on the card: branch name, machine/repo,
  head commit, pushed yes/no, PR URL/number, merge commit — set by the harness
  (git state of the assignee repo; GitHub API where a token exists), not only by
  the agent's words.
- **Verified transitions**: the harness advances the card when it observes the
  fact. An agent's closing line moves the card no further than the facts
  support; `update_task` cannot skip forward past the verified state (backwards
  is allowed).
- **Migration**: `todo→todo`, `doing→doing`, `done→pr-merged` when a merged PR
  can be found for the recorded branch, else `committed` with a warning badge.
- **Abandonment guard**: a card in `committed`/`pr-opened` with no activity for
  a configurable time (default 24 h) is flagged stale on the board and the fleet
  Status tab; `list_tasks` exposes `stale`; `list_agents` lists repos with local
  branches carrying unpushed commits that belong to a board task.
- **Agent contract**: dispatch briefs close with `TASK COMMITTED <id> <branch>
  <commit>` (default, no push) | `TASK PR <id> <url>` (only when the brief
  allowed push) | `TASK BLOCKED <id>: reason`. The arch never pushes or merges.

## Non-goals

No auto-push, no auto-merge, no change to the `claimed` rule (task
379f58b3eb85474daa8e2153eec24494 covers hand-over separately).

## Impact

- Affected specs: `task-graph` (statuses, linkage, verified transitions,
  migration, stale), `arch-agent` (update_task clamp, list_tasks stale,
  list_agents unpushed branches, dispatch brief closing lines).
- Affected code: `TaskGraphService` (+ migration + linkage fields),
  `ArchMcpServer` / `ArchAgentService` (tools + closing-line parse + brief
  template), a git/PR verification service, `KanbanBoard.jsx`,
  `TaskGraphPanel.jsx`, `FleetStatus.jsx`, arch home role prompt (CLAUDE.md).
- Sync: nodes gain optional fields — older peers read back unchanged (same
  seed-and-grow contract as the assignment fields).
