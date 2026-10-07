# Fleet Status → Agents: compact, orderly layout for a nine-machine fleet

## Why

Fleet task 40b3e438 (the Operator, 2026-10-07): the fleet has grown to nine machines and the
Management dashboard's Status tab (Fleet Status → Agents) has become cumbersome to watch. At
the dashboard's normal viewport (1500 × 950) **two and a half machines** fit on one screen;
each machine block is a tall stack (header line, an Occupied box, a Free box, each with its own
margins), the general information per machine is a row of loose pills in no scannable order,
the agent chips have random widths, and scrolling the list loses the filters and the view tabs.

## What the code says (verified)

- `FleetStatus.jsx` renders one `<section class="fs__machine">` per machine: a header line with
  the name, address, "open harness" and two `StatusBadges` runs (`machineBadges` — build / hub
  sync / sends / upgrades / gate / may-send; `machineMeta` — agents / managed / running /
  hidden), then either the split layout (two bordered boxes, Occupied above Free, each a
  flex-wrap strip of chips) or the merged list. The head (title, hub build, count), the view
  tabs and the filter bar are ordinary flow content above the list.
- `.fs` stacks everything with a 10 px gap, `.fs__machine` has 8 × 10 px padding and the header
  an 8 px bottom margin, every `.fs__occ` box 6–8 px padding plus a 6 px header margin.
- An agent chip is `max-width: 220px` (300 px when working) and otherwise sized by its label.
  The running chip is ~50 % larger than an idle one (task 3546287b) — a rule to keep.
- Order inside a section is the hub's order, so running agents sit wherever the hub listed them.
- The scrolling container is `.mg__status` (ManageApp's Status pane); `.fs` is `overflow: visible`
  inside it.

## What changes

Presentation only — every filter, the split / merged switch, the running filter, the "!" and
✓ "mark as checked", click-to-expand, double-click-to-open and the occupancy control keep their
handlers and data hooks byte for byte.

1. **Vertical density.** The gaps and paddings between and inside machine blocks shrink; the
   two occupancy sections become lean rows (the section label as a narrow left column, the
   chips beside it) instead of stacked boxes; the head's title and the view tabs share one row.
   Target: five or more machines per 950 px screen in the split layout, more in merged.
2. **A per-machine facts table.** The header's badge soup (`machineBadges` + `machineMeta`) is
   replaced by ONE aligned key/value grid, `machineFacts(m)`: the same columns in the same
   order for every machine — status · build · hub sync · sends · upgrades · gate · may send ·
   agents · managed · running (· hidden, when a filter is on) — a field a machine cannot have
   (hub sync on the hub itself) shows "—" rather than dropping the column, so the eye scans one
   column down the list. State colour stays, as subtle cell styling (coloured value, a faint
   tint on warn/bad cells), not loose pills.
3. **Orderly agent chips.** The chips sit on a column grid (equal cells); a working chip —
   running, or finished and not yet checked — spans two columns and keeps its larger type, so
   the "active is visibly bigger" rule stays within an aligned layout. Order inside every section
   (and the merged list): running first, then finished-unchecked, then idle, alphabetical by
   name within each group (`orderAgents`).
4. **Pinned head.** The head (title + view tabs) and the filter bar are one sticky block at the
   top of the Status pane with a solid background and a subtle bottom border / shadow, so the
   filters and the tab switcher stay visible while the machine list scrolls under them.

## Non-goals

- No change to the fleet feed, the filters' semantics, the occupancy rule or the Overview /
  Scoreboard / By-plan tabs (they keep the same machine header, so they gain the facts table too).
- No change to the agent detail panel beyond spacing.
