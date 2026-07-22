## Context

The dashboard's free drag layout (`plans/dashboard-drag-layout.md`, now
specified under `dashboard-free-layout`) absolutely positions three citizens —
Autopilot, Ideas, agents — inside the `.dash__body--free` canvas. Ideas already
has a bottom-right drag-resize grip (`startIdeasResize` in
`client/src/pages/Dashboard.jsx:378`, persisted as
`claudeweb_dash_ideas_size`); the Autopilot dock is resizable too. The agents
panel (`.dash__main`, `dashboard.css:368`) has no size of its own: `flex: 1 1
480px` in flow, and in free mode (display:block canvas) a `<div>` naturally
stretches the full canvas width.

## Goals / Non-Goals

**Goals:**
- Right-edge drag grip on the agents panel in free mode → explicit width.
- Persist per device; double-click grip and ↺ reset both clear it.
- Reuse the Ideas resize pattern (pointer capture, clamp, localStorage,
  double-click clear) so the two grips behave identically.

**Non-Goals:**
- No height control (content keeps driving height).
- No grid-mode resize — there the panel shares the flex row with Ideas, and a
  forced width would fight the flow (same reasoning as the floating Ideas
  overlay).
- No backend/synced persistence — all free-layout state is device-local.

## Decisions

- **Right-edge strip, not a corner grip.** Horizontal-only resize reads better
  as a full-height edge strip with `cursor: ew-resize`; a bottom-right corner
  grip (Ideas style) signals 2D resize, which this isn't. Visual language
  (subtle bar, accent on hover, `touch-action: none`) matches the Ideas grip.
- **Pointer events + capture, mirroring `startIdeasResize`.** Same
  ref-bookkeeping shape (`{startX, baseW}`), same commit-on-pointerup to
  localStorage, same double-click-to-clear. New key
  `claudeweb_dash_agents_w` storing a plain number (width only — no object,
  nothing else to remember).
- **Clamp min 360px** — enough for one 340px card track plus padding —
  **max `0.95 * window.innerWidth`**, same ceiling the Ideas grip uses.
- **Apply as inline `width` + `maxWidth: 100%`** on `.dash__main` only when
  `free && agentsW`. The inner dock grid needs no changes: explicit per-row
  uses `minmax(0, 1fr)` tracks (shrink freely) and auto uses
  `minmax(0, 340|460px)` capped tracks (shrink below cap when the container
  narrows).
- **`resetLayout()` also clears the width** — ↺ means "back to flow", and a
  leftover width would make reset look broken.
- **Grip renders only in free mode**, alongside the existing free-only
  `.dash__main-head` drag handle.

## Risks / Trade-offs

- [Grip overlaps dock content at the panel's right edge] → the strip is thin
  (~10px), sits above content with its own z-index, and only exists in free
  mode on desktop; the same trade was accepted for the Ideas corner grip.
- [Saved width larger than a smaller screen later] → `maxWidth: 100%` caps
  rendering; the clamp re-applies on next drag.
- [Panel positioned partly off-canvas then resized] → width clamp is against
  viewport width, not remaining canvas — acceptable, `clampPos` already lets
  panels hang off-edge deliberately.
