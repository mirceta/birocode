# Dashboard drag layout — free 2D drag of the Ideas & agents panels

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-17): SHIPPED.** Deployed to live :5099 & confirmed; **merged to main
> 2026-06-17**. On `feature/dashboard-drag-layout`. Free 2D drag (desktop) **plus** a
> snap-to-grid mode (mobile default), with a mode switch in the top-right. Supersedes the
> side-swap toggle.

## Goal

On the agent dashboard overlay, arrange the **Ideas** and **agents** panels:
- **Free mode** (desktop default) — drag either panel anywhere by its `⠿` header handle
  (free x/y), remembered per device.
- **Grid mode** (mobile default — touch-drag is unreliable) — panels sit in the normal
  responsive flow (side-by-side on wide, stacked on narrow); a `⇄` button tap-flips their
  order. No dragging needed.
- A **mode switch** in the top-right controls toggles free ⇄ grid; the default follows the
  device (`max-width: 700px` → grid) until the operator picks one (then their choice wins,
  device-local). Both panels — Ideas included — participate in both modes.

## Decision log

- **Snap-zones (first cut):** drag → Left/Right/Top/Bottom drop-zones. Operator reported it
  "doesn't work" and asked for full 2D instead → removed.
- **Free 2D (current):** absolute {x,y} per panel, **pointer-events** dragging (more reliable
  than HTML5 DnD — the likely cause of the snap version feeling broken). Tradeoffs accepted
  by the operator: panels can overlap and can be dragged partly off-canvas (mitigated by a
  clamp that always leaves a grabbable strip, plus a **Reset layout** button).

## Where it is now

`client/src/pages/Dashboard.jsx` renders `.dash__body` (flex row) with two children:
`<aside data-panel="ideas">` and `<div data-panel="agents">`. Until a panel is moved the
normal flow is untouched; after the first drag both render absolutely on a canvas.

## How it works

1. **State**, device-local: `DASH_POS_KEY = 'claudeweb_dash_pos'` → `{ ideas?: {x,y},
   agents?: {x,y} }`. Empty = natural flow (Ideas left / agents right).
2. **Drag**: each panel header has a `⠿` handle. `onPointerDown` captures the pointer
   (`setPointerCapture`) and seeds BOTH panels from their current flow offsets (so
   flow→absolute doesn't jump); `onPointerMove` updates {x,y}; `onPointerUp` persists.
3. **Apply**: positioned panels get inline `position:absolute; left/top`. `.dash__body--free`
   turns the body into a `display:block` canvas with a tall `min-height`. The dragged panel
   gets `.dash__panel--lifted` (z-index + shadow).
4. **Clamp**: keeps a 48px grabbable strip on every edge so a panel can't be lost.
5. **Reset layout** button (`↺`, header, shown once `positions` is non-empty) clears it back
   to the default flow.
6. i18n `dashboard.dragPanel` / `dashboard.resetLayout` (en + tr). Advanced-gated.

## Known limitations (free 2D, as warned)

- Panels can overlap; very tall agent grids can extend past the canvas min-height.
- Pixel positions are device-local and not responsive across very different widths
  (Reset recovers). Touch-drag works via pointer events but is unverified on a phone.

## Verify

Build, deploy to live :5099 (self-dev swap), browser-verify: drag both panels around, drop,
reload (positions stick), Reset returns to default, and a panel can't be fully lost off-edge.
