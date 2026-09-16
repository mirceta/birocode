# Multi-assignee tasks: one card owned by several repo agents

## Why

Some work spans several repositories at once — the DLL-mode sinhro invoice lock needs
the fix in prg AND its verification through the case9 race across skratek-projects and
web-flow-autodev. Today a board task has a single assignee (one machine + one repoId),
so cross-repo work is either several loosely related cards or one card that can only
name one of its owners.

## What changes

- **Data model.** A task carries a SET of assignees, each `{machine, repoId}` with its
  OWN lifecycle state (todo → doing → committed → pr-opened → pr-merged → done), branch,
  headCommit, pushed, prUrl, prNumber, mergeCommit, verifiedStatus and warning. The
  card's legacy fields mirror the FIRST (primary) assignee, so older readers and sync
  peers keep working; a card written before this change reads back as one assignee.
- **Aggregate rule.** The card's status is derived from its assignees: as far as its
  SLOWEST assignee, and out of `todo` as soon as any assignee has started. So `done`
  means every assignee is done, `pr-merged` means every one is at least pr-merged, and a
  single-assignee card reads exactly as its assignee. A status set on the card is set on
  every assignee; a status set on one assignee moves that one and re-aggregates.
- **Arch tools.** `create_task`, `assign_task` (with `mode` replace | add | remove) and
  `idea_to_task` take `assignees` (comma-separated handles); `dispatch_task` pings every
  assignee not yet pinged (or a named subset), each with the shared brief plus which repo
  it owns and who else is on the card; `list_tasks` returns `assignees[]` with each one's
  state; `update_task` takes `assignee` to move that agent's state and record its
  branch/PR (a claim without `assignee` on a multi-assignee card is refused; a status
  without it broadcasts). Raw ids and handles are both accepted everywhere.
- **Verification** runs PER ASSIGNEE (local facts for this machine's repos, PR facts on
  GitHub for any machine), each assignee advances forward-only with its own badge, and
  the card aggregates. The stale guard runs per assignee.
- **UI.** Kanban cards show every assignee as a chip with its own status, and let the
  operator add or remove assignees; the Task graph node shows an assignee row — each chip
  coloured like a node would be (border = its machine, background = its repo) with its
  own status — behind a double border; the legends count a task once per distinct
  machine / repo among its assignees; the task filters' machine and agent chips match a
  task when ANY of its assignees matches.
- **Role prompt** (marker v10) tells the arch how multi-assignee tasks are created,
  dispatched and read.

## Non-goals

The invoice-lock fix itself; wiring task ea8681e1 to several repos (the Operator does
that once this lands); any change to how existing single-assignee cards behave.
