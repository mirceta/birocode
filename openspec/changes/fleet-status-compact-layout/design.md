# Design — fleet-status-compact-layout

## D1 · Same columns for every machine

`machineFacts(m, { running, hidden, narrowed })` (statusBadges.js, pure) returns the SAME list of
`{ key, label, value, tone, mono?, title }` for every machine, in one fixed order. A fact that does
not apply (hub sync and may-send on the hub itself) is "—" (muted); a fact an unreachable machine
cannot report is "?" (unknown); nothing is omitted, so column N is the same field on every row of
the list. Values are the shortest honest word — `same` / `behind`, `yes` / `no`, `open` / `closed`,
a count, a 7-hex build — with the long sentence the old pill carried kept on the cell's `title`.
`machineBadges` and `machineMeta` go away (this was their only caller); the agent detail and the
Overview keep their badges.

## D2 · A grid, not a pill row

`.fs__facts` is a bordered strip of fixed-width cells (label above value), one per fact, with a
per-key width so a column lines up across machines whether it says `open` or `closed`. The strip
sits at the right end of the machine header (`margin-left: auto`) and wraps under the name only
when the pane is too narrow to hold both. Tone is the value's colour (the Overview's `--ov-*`
tokens, ≥ 4.5:1) plus a faint tint on `warn` / `bad` cells only — the ok state is quiet.

## D3 · Chips on a column grid, the working chip spanning two

`.fs__strip` is `grid-template-columns: repeat(auto-fill, minmax(164px, 1fr))`; every chip fills
its cell (fixed, equal widths, ellipsis inside). A working chip's wrapper (`.fs__chipwrap--working`:
running, or finished-unchecked) spans two columns and keeps the larger type from task 3546287b, so
it is still visibly bigger, but on the grid. Below ~360 px (one-column grids, side-by-side panes)
a container query drops the span so nothing overflows. `orderAgents` (agentsView.js, pure) sorts
running → finished → idle, alphabetical within, and is applied to a machine's agents before
`splitByOccupancy` / `mergedList`, so both layouts share it and the merged list still reads
occupied-then-free (status-agents-attention D4).

## D4 · Sections as rows

Occupied stays above Free (manual-agent-occupancy), but each section is now one row: the label
("OCCUPIED · 3") as a fixed 80 px left column, the chip grid beside it, 3 px between the rows. An
empty section is a single ~22 px row saying "none".

## D5 · One sticky block

The head (title · view tabs · hub build · count) and the filter bar are wrapped in
`.fs__sticky` (`position: sticky; top: 0`) inside the existing scroll container (`.mg__status`;
or `.fs` itself when it is the scroller). It carries the page background (`--color-bg`), a bottom
border and a soft shadow; `.fs` loses its top padding so the block sits flush. No JavaScript —
the browser pins it, in both layouts and at every pane width.
