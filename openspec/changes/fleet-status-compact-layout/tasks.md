# Tasks — fleet-status-compact-layout

## 1. Build

- [x] 1.1 `statusBadges.js`: `machineFacts` (one fixed column set per machine, "—" / "?" never an omission); `machineBadges` / `machineMeta` removed with their tests replaced.
- [x] 1.2 `agentsView.js`: `orderAgents` — running → finished-unchecked → idle, alphabetical within.
- [x] 1.3 `FleetStatus.jsx`: the sticky head (title + tabs on one row, filter bar), the `MachineFacts` grid in the machine header, the ordered agents, the working-chip wrapper class; no handler or data hook changed.
- [x] 1.4 `manage.css`: density, the facts grid, the chip column grid (span-2 working chips, container query below 360 px), sections as rows, the sticky block.

## 2. Verify

- [x] 2.1 `node --test`: `machineFacts` (same keys for hub / peer / unreachable / old build; honest "—" and "?"), `orderAgents`.
- [x] 2.2 UI `shot-fleet-status-compact.mjs` on a nine-machine fixture at 1500 × 950: before/after/scrolled/merged shots; asserts no horizontal overflow, the head pinned with a solid background after scrolling, identical fact columns on every machine, working chip wider than idle, running first in every section, and the filters / split-merged / expand / double-click / occupancy / ✓ still working.

## 3. Ship

- [ ] 3.1 PR with the before/after screenshots; merge + deploy on the Operator's word.
