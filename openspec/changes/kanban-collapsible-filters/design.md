## Design

**D1 — fold in the shared bar, not in the Kanban.** The Kanban and the Task graph render
the same `TaskFilterBar`; folding it there gives both panes the behaviour for free and
keeps one place to reason about. The Kanban's own toolbar (column layout) stays where it
is, under the fold.

**D2 — the fold is display state, the filter is not touched.** Folding never reads or
writes the filter store. The summary is derived from the filter on every render; a chip's
× is an ordinary `setFilter` (the same path the expanded chip's click takes), so URL sync,
the saved filter and faceted counts stay exactly as specified in openspec task-filters.

**D3 — one fold per browser, shared by every mounted bar.** A module-level store with
`useSyncExternalStore` (the `taskFilterStore` pattern), persisted under
`claudeweb_task_filters_fold`. Default collapsed when nothing is remembered; garbage reads
as collapsed. Shared, so the two panes never disagree.

**D4 — the summary chip looks like a selected chip.** Same surface / accent inset as
`tf__chip--on`, a muted uppercase kind ("MACHINE:"), the value, and a small × button with
its own accessible name ("Clear machine spacex"). State values show their column label,
flags their chip label (⛔ blocked), `unassigned` shows "Unassigned".

**D5 — the sticky block moves to the fold.** `.tf` was the sticky element; now `.tf-fold`
is, and `.tf` inside it is static (in the graph's pinned block the fold is static too, as
the bar was). Collapsed, the block is a single ~33 px line with the same bottom border, so
the layout toolbar follows at the container's normal gap — no empty strip.

**D6 — no OR hint.** The task search ANDs its words (`matchesGroup`, the q group); the
Status tab's OR hint describes `agentQuery`, which this bar does not use. Adding the hint
here would describe behaviour the box does not have.
