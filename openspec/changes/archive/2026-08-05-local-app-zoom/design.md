## Context

Two surfaces embed a running local app through the harness's same-origin
`/api/localview/<repoId>/app/<appId>/` proxy, and both do it with the one shared
component `client/src/components/app/ProductFrame.jsx`:

- the agent dock's local-apps view — `PinnedAgent.jsx` renders `<ProductFrame>` inside
  `.phone__screen` (`PinnedAgent.jsx:766`);
- the Local tab — `LocalApp.jsx` renders `<ProductFrame>` inside `.localapp__body`
  (`LocalApp.jsx:216`).

`ProductFrame` owns the liveness probe and empty state and renders a bare
`<iframe class="product-frame">`. Two other consumers (App tab preview `AppRun.jsx`,
public `Landing.jsx`) iframe the cross-origin preview port directly and are out of
scope.

Prior art in the repo: the Dashboard already has a **whole-dock content zoom**
(`contentZoom` in `Dashboard.jsx`, set from the Layout popover slider, persisted
per device) that applies CSS `zoom` to every dock's `.phone__screen` — chat, console,
and all. That is a different feature: it scales the dock's whole interior uniformly.
This change adds a **per-frame** zoom that scales only the embedded app, per surface,
and composes with (never touches) the dock-wide zoom.

## Goals / Non-Goals

**Goals:**
- Zoom the embedded local app in/out without scaling any surrounding harness UI.
- Same mechanism and controls on both embedding surfaces (dock local-apps view,
  Local tab), implemented once in the shared `ProductFrame`.
- Per-surface, ephemeral zoom state (reset on reload), 50%–200% in 25% steps.

**Non-Goals:**
- No changes to the App tab preview or Landing page embeds.
- No persistence of zoom level (device- or app-scoped) — can be added later if wanted.
- No pinch-gesture zoom on touch; buttons only in this change.
- No server/API work — purely client-side presentation.

## Decisions

### 1. Scale with `transform: scale()` + compensated iframe size, not CSS `zoom`

The iframe gets `transform: scale(f); transform-origin: top left` with its layout
size compensated to `width/height: calc(100% / f)`, wrapped in a
`.product-frame__viewport` container with `overflow: auto`.

- The compensation means the scaled iframe fills the viewport *exactly* at every
  level (layout `100%/f` × scale `f` = 100%), at `f < 1` and `f > 1` alike — the
  frame's footprint never changes, with no dead margins and no outer overflow.
- What changes is the iframe's **inner viewport**: at `f > 1` the embedded app sees
  a smaller viewport painted magnified, so overflowing content scrolls with the
  app's *own* scrollbars — exactly like browser zoom, satisfying the spec's
  "zoomed-in content stays reachable" within the frame. The wrapper is
  `overflow: hidden` purely to clip sub-pixel rounding.
- Why not CSS `zoom` on the iframe: `zoom` participates in layout and its effect on
  iframe inner-viewport sizing differs across engines; `transform` is paint-only,
  fully specified, and the same technique works identically at any nesting depth —
  including inside the dock's existing `zoom`-ed `.phone__screen`, where the two
  simply compose visually.

### 2. Zoom state and controls live inside `ProductFrame`, behind a `zoomable` prop

`ProductFrame` gains an opt-in `zoomable` prop. When set (and the frame is online) it
renders a small overlay control cluster — − / level% / + / reset — anchored to a
corner of the viewport, and keeps the zoom level in its own `useState`.

- One implementation serves both surfaces; hosts change by one prop
  (`PinnedAgent.jsx:766` and `LocalApp.jsx:216` pass `zoomable`), which also
  guarantees App tab / Landing (no prop) are untouched.
- Component-local state is automatically per-surface (each mounted frame has its
  own) and ephemeral (gone on unmount/reload) — exactly the spec'd scope. Switching
  dock views (console/files/app) or switching apps remounts the frame and resets to
  100%; acceptable for v1 and consistent with "ephemeral".
- Alternative considered: host-owned state passed down as a `zoom` prop. Rejected —
  duplicates control UI and state plumbing in two hosts for no requirement we have.

### 3. Constants: `ZOOM_MIN 0.5`, `ZOOM_MAX 2`, `ZOOM_STEP 0.25`

Fixed steps keep the control two-button simple, match the spec, and avoid a slider
(the Layout popover slider already means "dock-wide zoom" to operators — a different
control shape signals a different feature). Buttons disable at the clamps.

### 4. Mode gating needs no new capability-map entry

The control renders wherever its host surface renders: the dock is already behind the
dashboard's Advanced gate, and on the Local tab zoom is a *viewing* control, which the
`local-app-tab` spec explicitly allows in Basic mode. Per CLAUDE.md, new UI defaults
to Advanced unless the End User needs it — the phone tab (End-User surface) is an
explicitly requested target of this feature, which is that exception. So no
`UiModeContext.jsx` entry; noted here so the omission reads as a decision, not an
oversight.

## Risks / Trade-offs

- [Pointer-events and scrolling: the overlay cluster sits above the iframe] → keep the
  overlay small and corner-anchored; `pointer-events` only on the buttons themselves.
- [At `f > 1` apps with fixed `100vh` layouts may look cramped in the shrunken
  inner viewport rather than usefully magnified] → accepted; reset-to-100% is one
  tap away, and the wrapper clips so the harness layout never moves.
- [Composing with the dock-wide CSS `zoom` could surprise (e.g. dock zoom 80% × frame
  zoom 200% = 160% effective)] → by design; the indicator shows the *frame* zoom only,
  and the spec pins both features as independent.
- [ProductFrame remount (reloadKey bump, app switch) resets zoom] → within spec
  (ephemeral); revisit only if users ask for stickiness.

## Open Questions

- None blocking. Pinch-to-zoom on touch and per-app persistence are deliberate
  follow-ups, not part of this change.
