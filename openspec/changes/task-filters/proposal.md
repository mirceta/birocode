# Task filters: Kanban and Task graph narrowed by machine, agent and state

## Why

The fleet task board (Management → Kanban / Task graph) now carries every task of
every machine. Finding "what is spacex working on" or "what is still in progress on
this box" means reading the whole board. The fleet Status tab got a filter bar for the
same reason (openspec fleet-status-filters); the two task views need the same, on one
shared model, so a view can be narrowed, bookmarked and shared to the living-room
screen — and so the arch agent can ask the board the same question through its tool.

## What changes

- **One filter model** for both views (`taskFilters.js`, pure; `taskFilterStore.js`,
  the shared live state): text search, machine chips, repo-agent chips
  (`<machine>/<handle>`, the stable handles from openspec stable-handles, with a numeric
  suffix fallback when names repeat), state chips (the Kanban columns, read from one
  `kanbanColumns.js` so a future column appears by itself), flag chips (blocked; stale
  when such a flag exists on a card). Multi-select within a group, AND across groups,
  an Unassigned chip in the machine and agent groups, a clear × and "N of M tasks".
- **A pinned bar** in both views (`TaskFilterBar.jsx`), sticky to the top of whatever
  scrolls; in the Task graph it pins together with the colour legends.
- **Kanban** hides filtered-out cards; column heads keep their count as "shown of all".
  **Task graph** dims filtered-out steps (edges still make sense); a "hide filtered"
  toggle removes them and their edges. Clicking a legend entry applies the same filter.
- **URL + memory**: the filter lives in the query (`?machine=spacex&agent=spacex/prg%232
  &state=doing&flag=blocked&q=…&hide=1`), the last filter is remembered per browser; a
  URL with filter keys wins on load.
- **`list_tasks`** (arch tool) takes the same optional filters: `status`, `machine`
  (label, "self" or "unassigned") and `repoId` (handle / id / unique name), ANDed.

## Non-goals

No saved named filters; no change to card content; the Kanban's columns themselves are
unchanged (the lifecycle change owns them).
