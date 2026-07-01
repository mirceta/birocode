## Why

The Dashboard renders one embedded tile per agent dock, and the fleet has grown to
"many, many" docks. Today the grid shows every dock whose `dashboard` field is not
`false`, and the only way to hide a dock from the grid is to leave the Dashboard, open
the **Agents** page, and toggle its `▦` button. There is no way, from the Dashboard
itself, to see the full roster of docks and quickly curate which ones are on screen. As
the roster grows this makes the grid unwieldy: an operator who wants to focus on three
of twenty docks has no fast, in-place control.

## What Changes

- Add a **dock toolbar** (a horizontal, overflow-friendly strip of tabs) at the top of
  the Dashboard, inside the existing `.dash__header`, listing **every** dock — including
  ones currently hidden from the grid — one tab per dock, labeled and color-coded from
  the dock's own title/color.
- Each tab reflects and toggles that dock's **rendered-on-dashboard** state: a tab shown
  as **active** means the dock renders in the grid; clicking an active tab **hides** the
  dock (removes its tile from the grid) and shows the tab as inactive; clicking an
  inactive tab **shows** the dock again. This drives the existing `DockTab.dashboard`
  field via the existing `PATCH /api/dock/{id}` — no new backend field or endpoint.
- The grid keeps its current source of truth: it renders exactly the docks whose
  `dashboard !== false`, so the toolbar and grid stay consistent by construction.
- The toolbar is device-independent in the same sense the rest of the dock state is: it
  reads the shared dock roster from `GET /api/dock` via `DockContext`, so it reflects
  live additions/removals/renames without a page reload.
- Gate the toolbar behind the same Advanced-mode gate as the dashboard / agent dock, so
  Basic mode is unaffected.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `agent-dock`: gains a Dashboard-level dock toolbar that lists every dock as a
  toggleable tab and controls, in place, which docks are rendered in the dashboard grid
  (by driving the existing per-dock `dashboard` visibility field).

## Impact

- Frontend only:
  - `client/src/pages/Dashboard.jsx` — render the new toolbar in `.dash__header`, sourced
    from the unfiltered dock list; wire each tab's click to `updateTab(id, { dashboard })`.
  - `client/src/pages/dashboard.css` — toolbar strip styles (tabs, active/inactive states,
    horizontal overflow for large rosters).
  - `client/src/i18n/*` — labels for the toolbar and its tabs' accessible state.
  - `client/src/context/UiModeContext.jsx` — capability-map entry (Advanced) if the
    toolbar is treated as a distinct gated feature.
- Backend: none. Reuses `DockTab.dashboard` and `PATCH /api/dock/{id}` as they exist today.
- Data: no schema change; `dock.json` shape is unchanged.
- Behavior note: because `dashboard` is a shared dock field (not device-local), toggling a
  dock's visibility from the toolbar changes it for every client viewing that dock — the
  same semantics as the existing Agents-page `▦` toggle. See `design.md` for the
  device-local alternative and why reuse is proposed.
