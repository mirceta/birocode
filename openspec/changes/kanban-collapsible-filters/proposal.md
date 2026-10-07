# The Kanban's filter section folds to one line

## Why

Fleet task 4e047c9e (the Operator, 2026-10-07): the Kanban (Management → Ideas → Kanban)
is cluttered by its filter controls — a search box and four chip groups (machine, agent,
state, flag) sit between the toolbar and the columns on every visit, whether or not a
filter is set. The board should get that height back, and the active filters should
still be readable (and clearable) at a glance.

## What the code says (verified)

- The controls are ONE component, `TaskFilterBar`, mounted by the Kanban (under its head,
  above the column-layout toolbar) and by the Task graph (inside its pinned block with
  the legends). The filter state is the shared `taskFilterStore` (URL query + the last
  filter per browser); the bar only renders and toggles it.
- The fleet Status tab's bar (openspec fleet-status-compact-layout, PR #151) is the look
  the chips follow; its OR-pattern search helper (PR #152, `agentQuery.js`) is NOT shared
  by the task search, which matches words AND-wise — so no OR hint belongs here.

## What changes

`TaskFilterBar` gains a fold around the controls:

- A toggle heads the bar: chevron (▸ / ▾) + "Filters" + a count badge of active filters.
  A real button — focusable, `aria-expanded`, Enter / Space.
- **Collapsed (the default):** one line — the toggle, a summary chip per active filter
  value ("machine: spacex", "state: In progress", "text: prg"), each with its own × that
  clears that one value without expanding; "× clear all" when anything is active; the
  "N of M tasks" count; and the bar's `extra` (the graph's hide-filtered toggle). With no
  filter: "no filters".
- **Expanded:** the controls exactly as before, under the toggle line.
- The fold is remembered per browser (`claudeweb_task_filters_fold`) and shared by every
  mounted bar, so the Kanban and the Task graph (side by side in the Management App)
  fold together. The filter itself is untouched by folding: URL persistence, the saved
  filter, the chips' counts all keep working.
- The fold is the sticky block; collapsed it is one line tall, and the Kanban's layout
  toolbar and columns start right under it.

## Impact

Client only: `TaskFilterBar.jsx`, `taskfilters.css`, a pure `taskFilterSummary.js`
(chips, remove-one, fold state) with node tests, a UI shot test with before / after
screenshots. No API, no server, no change to the filter model.
