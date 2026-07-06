## Why

In the dashboard's free drag layout mode the agents grid panel (`.dash__main`)
is the only drag-layout citizen without its own size: Ideas has a drag-resize
grip and the Autopilot dock is resizable, but the agents panel always stretches
the full canvas width. The operator can't lay out a narrower agents column
next to other panels, which defeats the point of the free canvas.

## What Changes

- The agents panel gets a right-edge drag grip in free layout mode that sets an
  explicit panel width (`ew-resize`, horizontal only — height keeps following
  content).
- Width is clamped (min 360px, max ~95vw) and persisted per device in
  localStorage (`claudeweb_dash_agents_w`), consistent with the other
  device-local layout prefs.
- Double-clicking the grip clears the width back to full-canvas; the existing
  ↺ reset-layout button clears it too.
- Grid mode is unchanged: no grip, no applied width (the panel keeps sharing
  the flex row with Ideas).
- The dock grid inside re-wraps to the narrowed panel: explicit per-row column
  counts keep their count at narrower tracks; auto layout shrinks its capped
  tracks.

## Capabilities

### New Capabilities

- `dashboard-free-layout`: the dashboard's free drag canvas — panels placed at
  saved positions, per-panel sizing, and layout reset. Seeded here with the
  agents-panel width requirement (seed-and-grow; positions/mode toggle already
  exist in code but are specified as touched).

### Modified Capabilities

(none — `dock-grid-layout` requirements are untouched; the grid merely renders
inside a narrower container, which its existing column rules already handle)

## Impact

- `client/src/pages/Dashboard.jsx` — width state + grip handlers on the agents
  panel, reset wiring.
- `client/src/pages/dashboard.css` — grip styling (`.dash__main-resize`),
  free-mode width behavior for `.dash__main`.
- `client/src/i18n` strings for the grip tooltip/aria-label if a new key is
  needed.
- No backend, no API changes. Device-local persistence only.
