# Hide inactive agents — "Show only important" dashboard toggle

> **Status (2026-06-20):** **User-confirmed working and merged to main.** The
> **"Show only important agents"** switch is wired in `Dashboard.jsx`: device-local
> `claudeweb_dash_only_important` (default off), filters the dock map to `important`
> docks, empty-state hint, i18n en+tr. Frontend compiles clean
> (`npm --prefix client run build`, 0 errors). **Decisions locked** (were open
> questions): state is **device-local**; the filter is **strictly per-dock** —
> filtered mode renders important docks **flat** (no "together" grouping), so an
> important dock always shows whether it's a primary, a dependent, or standalone.
> Frontend-only, **no backend change**. On `feature/hide-inactive-agents`.

## Problem

The agent dashboard shows **every** agent dock on the machine at once (the
"wall of phones"). When many agents are running, the few you actually care
about — the one building, the mission-critical repo — are lost in the crowd.
We already let the operator mark a dock **★ important**
([important-agents.md](important-agents.md)): it gets a red border and is pinned
to the front. But there's no way to **collapse the view down to just those**.

## Goal

A single dashboard-level **toggle** — **"Show only important agents"** — that,
when **on**, **hides every dock that isn't marked ★ important**, leaving only the
important ones; toggle **off** to show all docks again. ("Inactive" here means
**not starred important**, not a liveness state.)

## Design (proposed — confirm at playback)

Pure **view filter** on top of the existing `important` flag. No new persisted
dock state, no backend change — the star (`DockTab.important`, backend-synced)
already carries the signal.

- **State:** a **device-local** boolean, default **off**, in `localStorage`
  (new key e.g. `claudeweb_dash_only_important`), exactly like the other
  dashboard view prefs in `Dashboard.jsx` (`SIZE_KEY`, `ZOOM_KEY`,
  `LAYOUT_MODE_KEY`, `GRID_SWAP_KEY`). It's a per-viewer preference, not shared.
- **Control:** a labelled switch in the dashboard's control row, beside the
  existing size/zoom/layout controls. Copy: **"Show only important agents"**.
- **Filtering:** apply at the dock list. `Dashboard.jsx` already builds an
  ordered list (`important` pinned first, then the rest, ~lines 515–519); when
  the toggle is on, drop the `rest` so only `important` docks render. Applies to
  **both** surfaces (phone docks **and** summary cards) since both map the same
  list.
- **Empty state:** if the toggle is on and **nothing** is starred, show a small
  hint ("No important agents — star one, or turn this off") instead of a blank
  dashboard, so it never looks broken.
- **Gating:** lives inside the already-Advanced dashboard; no separate flag
  (same as important/wide/waiting controls).
- **i18n:** add `dashboard.showOnlyImportant` (+ any hint string) to `en.json`
  and `tr.json`.

## Open questions (resolve at playback)

1. **Dependent "together" groups** ([dependent-agents.md](dependent-agents.md)):
   if a **primary** is important but its **dependent** is not (or vice-versa),
   does the filter hide the non-important half and break the group? Proposed:
   filter strictly by each dock's own `important` flag (a group with no important
   member disappears; a mixed group shows only its important docks). Confirm.
2. **Wide docks** ([dock-double-width.md](dock-double-width.md)): no interaction
   expected — a hidden dock just isn't rendered. Confirm the grid reflows cleanly
   when wide+important docks remain.
3. **Switch placement / styling:** a plain labelled checkbox-style switch vs. a
   pill toggle matching the layout-mode switch. Pick at build.

## Verification (planned)

Browser-verify on an isolated `:5210`/`:5201` preview: with a mix of starred and
un-starred docks, toggling on hides the un-starred ones (both phone + card
views) and persists across reload (device-local); toggling off restores all; the
empty-state hint shows when nothing is starred. Then deploy to live `:5099` per
the self-dev deploy rule.
