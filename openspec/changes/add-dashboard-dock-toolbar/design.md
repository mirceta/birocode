## Context

The Dashboard (`client/src/pages/Dashboard.jsx`) is a full-screen overlay that renders one
tile per agent dock. The dock roster comes from `GET /api/dock` through `DockContext`
(`useDock()` → `tabs`, `updateTab`), backed by `%APPDATA%\ClaudeWeb\dock.json`
(`DockRegistry.cs`). Each `DockTab` already carries a `dashboard` boolean (default `true`),
and the grid is built from `dockTabs.filter(t => t.dashboard !== false)`. That `dashboard`
field is toggled today only from the **Agents** page (`Agents.jsx`, the `▦` button) via
`PATCH /api/dock/{id}`. The header (`.dash__header`) already hosts a row of controls (size,
zoom, layout mode, view tabs, "show only important", close) — a natural home for one more.

## Goals / Non-Goals

Goals:
- One in-place control on the Dashboard to see the full dock roster and toggle which docks
  render in the grid, without leaving for the Agents page.
- Reflect the live roster (adds/removes/renames) with no reload.
- No backend change; reuse the existing visibility field and endpoint.

Non-Goals:
- No new "hidden vs closed" concept — hiding a dock from the grid does **not** close/delete
  it (that stays `DELETE /api/dock/{id}`); it only flips `dashboard`.
- No reordering of docks from the toolbar (ordering stays as it is today).
- No change to the "show only important" filter or the important/star mechanism.

## Decisions

### D1 — Reuse `DockTab.dashboard` rather than a new field
The requested behavior ("toggle whether a dock is rendered on the dashboard") is exactly
what `dashboard` already means. Reusing it means zero backend work, one source of truth, and
automatic consistency with the Agents-page `▦` toggle (toggling in one place is reflected in
the other). The toolbar becomes a thin second surface over an existing capability.

Alternative considered — a **device-local** visibility set (a `localStorage` key like
`claudeweb_dash_hidden_docks`, mirroring `claudeweb_dash_only_important`): this would let each
device curate its own view without affecting others. Rejected as the default because it
introduces a second, competing notion of "is this dock on the dashboard," which can silently
disagree with the `dashboard` field and the Agents page. **Open question for the user:** if
the intent is a *personal* view filter rather than a *shared* visibility change, we should
switch to the device-local approach instead. Flagged here rather than assumed.

### D2 — The toolbar lists the UNFILTERED roster
The grid renders `dashboard !== false`; the toolbar must render **all** docks so hidden ones
remain reachable to re-show. So the toolbar reads `dockTabs` (pre-filter) while the grid
keeps its filtered `tabs` memo. Active tab ⇔ `dashboard !== false`.

### D3 — Toggle path
Clicking a tab calls `updateTab(id, { dashboard: !(tab.dashboard !== false) })`, which already
issues `PATCH /api/dock/{id}` and updates context state; the grid re-renders from the changed
`tabs` memo. No optimistic-vs-server reconciliation beyond what `updateTab` already does.

### D4 — Large rosters
"Many, many" docks means the strip must not blow out the header. The toolbar is a single
horizontally-scrollable row (overflow-x auto) with compact tabs (dot + short label), so it
scales to a large roster without wrapping the rest of the header controls. No pagination.

### D5 — Labeling & color
Each tab shows the dock's display label (repo name, plus conversation/session hint where the
tile shows one) and a color dot from `tab.color`, matching how the tile identifies itself, so
the toolbar reads as "the same docks, in a row."

### D6 — Gate
Behind the existing Advanced-mode gate for the dashboard / agent dock, consistent with the
rest of the dock UI; Basic mode shows neither the dock nor the toolbar.

## Risks / Trade-offs

- **Shared-vs-personal semantics (D1):** the biggest design risk. If the user expects a
  personal filter, the shared `dashboard` field is the wrong tool — hence the explicit open
  question. Cheap to pivot to device-local before implementation.
- **Empty grid footgun:** an operator could hide every dock and see a blank grid. Mitigation:
  the toolbar itself always shows all tabs (so re-showing is one click), plus an empty-state
  hint in the grid when all docks are hidden.
- **Header crowding:** one more control in an already busy header. Mitigation: the toolbar
  sits on its own line within `.dash__header` (a second row), not inline with the steppers.

## Migration Plan

None. No schema/endpoint change; existing `dock.json` and `dashboard` values are honored
as-is. Docks with no `dashboard` field (older entries) already default to visible.

## Open Questions

1. **Shared or personal?** Reuse the synced `dashboard` field (proposed), or make toolbar
   visibility a device-local view filter? (See D1.)
2. Should hiding a dock also **collapse** it out of the "show only important" and "hot" views,
   or is hiding orthogonal to those filters? (Proposed: orthogonal — hide wins; a hidden dock
   never renders regardless of the other filters.)
