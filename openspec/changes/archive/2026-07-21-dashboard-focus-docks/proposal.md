# Dashboard focus: docks first, panels on demand

## Why

The dashboard renders four panels at once — the agent docks grid plus three
auxiliary panels (Ideas, Autopilot mission-control, Agent audit) — and the
auxiliary three visually crowd the one surface the Operator actually watches:
the docks. Today the only relief is per-panel gadgetry (Ideas collapse/resize,
drag layout), which shrinks a panel but never removes it; there is no way to
get a docks-only dashboard, and the aux panels keep their mount cost (fetches,
layout interference) even when nobody is looking at them.

## What Changes

- The three auxiliary panels (Ideas, Autopilot, Agent audit) become
  **summonable instead of always-on**: each can be shown or hidden from a new
  compact **panel rail** — one toggle chip per panel — on the dashboard's
  existing shared header bar.
- **Default is hidden**: a fresh device gets a docks-only dashboard; the docks
  grid reclaims the full canvas. Each chip's state is remembered per device
  (localStorage), like the dashboard's other view settings.
- A **hidden panel is not mounted at all** — no polling/fetching, and it drops
  out of the drag-layout citizen list — not merely styled away.
- A **shown panel keeps every existing behavior** unchanged: Ideas
  collapse/wide/drag-resize, free-mode drag, grid-mode flow order.
- Chips respect the existing feature gates: the Autopilot and Agent-audit
  chips only render when `autopilotTab` / `agenticAudit` are on; the whole
  rail lives inside the already-Advanced-gated dashboard.

## Capabilities

### New Capabilities

- `dashboard-panels`: which panels the dashboard renders — the always-on
  docks grid, the summonable auxiliary panels (Ideas / Autopilot / Agent
  audit), the panel rail that toggles them, per-device persistence of the
  choice, and the not-mounted-when-hidden guarantee.

### Modified Capabilities

<!-- none — dashboard-chrome governs the header bar's layout, which gains the
     rail as one more trailing control group but keeps all its requirements;
     no existing requirement text changes. -->

## Impact

- `client/src/pages/Dashboard.jsx` — panel visibility state + rail; `dragKeys`
  and grid/free layout derive from visible panels only; aux panels render
  conditionally.
- `client/src/pages/dashboard.css` — rail chip styles; spacing when docks-only.
- `client/src/i18n/*` — chip labels/tooltips.
- No backend, API, or storage-schema changes; no change to the panels'
  internals (`IdeasPanel`, `AutopilotPanel`, `AgentAuditPanel`).
- Device-local migration concern: operators who use Ideas daily will find it
  hidden once until they tap its chip (one tap, then remembered).
