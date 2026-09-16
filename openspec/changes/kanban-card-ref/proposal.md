# Kanban cards: a short stable reference and a copy button

## Why

Cards on the Management Kanban are hard to point at in a prompt: to send the arch
agent to one card the Operator describes it or pastes the whole description. The arch
identifies a task by its id (what `list_tasks` returns), so a reference has to end up
as that id — a pretty label the arch cannot look up would be useless.

## What changes

- Every card shows a **short, stable reference**: `#` + the first 8 characters of the
  task id (ids are 32-hex GUIDs, so the prefix never changes for the card's life),
  small and muted at the right of the title.
- A **copy button** next to it copies `task <full id>` — the canonical, unambiguous
  form — with "✓ copied" feedback; the button stops propagation so it neither opens the
  card nor starts a drag. The card's detail view gets the same button beside the id.
- The board and the arch **resolve references**: `update_task`, `assign_task`,
  `dispatch_task` and `create_task`'s `dependsOn`, and the board's PATCH / assign /
  dispatch endpoints, accept the full id, `#<short>`, `task <id>` or any unique prefix
  of at least 6 characters; an ambiguous prefix is refused naming the candidates.
  `list_tasks` returns the `ref` beside the id so the arch sees what the Operator sees.

## Non-goals

No change to the Task graph node; no new ids (the reference is derived from the id).
