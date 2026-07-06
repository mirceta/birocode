## Context

The dashboard overlay (`client/src/pages/Dashboard.jsx`) opens over the studio
and renders a `.dash__header` followed by the agent grid. Today the header is
effectively two rows:

1. Title row — `<h2 class="dash__title">Dashboard</h2>` on the left; then the
   size stepper (`.dash__size`), content zoom (`.dash__zoom`), layout-mode
   controls (`.dash__layout-ctl`), view tabs (`.dash__views`), the
   only-important switch, and the close button on the right.
2. Docks bar — `DockToolbar` (`.dash__docktoolbar`), styled `flex: 1 1 100%`
   with `margin-top: 10px` so the header's `flex-wrap: wrap` pushes it onto its
   own full-width row (openspec `add-dashboard-dock-toolbar`).

Around that, `.dash` has `padding: 16px` and `.dash__header` has
`margin-bottom: 12px`. Total: roughly two bars plus ~38px of pure spacing
before the first dock tile. The change collapses this to one bar and a small
spacing budget. Layout-only; no control behavior changes.

## Goals / Non-Goals

**Goals:**
- Remove the "Dashboard" title label.
- One horizontal bar: docks bar leading (left), all header controls trailing
  (right), close button outermost.
- Reduce `.dash` outer padding and inter-bar margins so the grid starts higher.
- Preserve every control's behavior, i18n labels, a11y roles, and the
  dashboard's Advanced gate.

**Non-Goals:**
- No changes to DockToolbar toggle semantics or roster source (agent-dock spec).
- No changes to the grid, docks, Ideas/Autopilot panels, or drag layout.
- No new user-facing settings; no capability-map changes (dashboard is already
  gated as-is).
- Not touching the studio-level HeaderStatusStrip (separate, already shipped).

## Decisions

1. **Single flex row via flex sizing, not restructuring.** Keep everything a
   direct child of `.dash__header` (already `display: flex; flex-wrap: wrap`).
   Move `DockToolbar` from last child to FIRST child in JSX, drop `.dash__title`,
   and change `.dash__docktoolbar` from `flex: 1 1 100%` to
   `flex: 1 1 0; min-width: 40%; margin-top: 0`. The basis must be `0`, not
   `auto`: flex-wrap assigns lines by the item's HYPOTHETICAL size (content
   width under `auto` — the whole roster), so an auto-basis toolbar takes a
   line alone and wraps every control (caught by Playwright during verify).
   Its existing
   `overflow-x: auto` keeps a big roster scrolling inside the leftover space
   instead of wrapping. Control groups stay `flex: 0 0 auto`.
   *Alternative considered:* wrapping the controls in a new right-side container
   div — rejected; it adds a node and CSS surface for no benefit since flex
   order/sizing on existing children suffices.

2. **Wrap direction on narrow screens: controls drop below the docks bar.**
   With the toolbar first in DOM order and greedy (`flex-grow: 1`), when the
   viewport can't fit both, `flex-wrap` naturally moves the control groups to a
   second line. A `min-width` floor (~40%) on the toolbar guarantees it never
   collapses to nothing when the roster is long.
   *Alternative:* media-query two-row layout at a fixed breakpoint — rejected;
   content-driven wrapping handles any roster/control width without maintaining
   a breakpoint.

3. **Spacing budget.** `.dash` padding `16px` → `8px 12px` (keep readable side
   gutters, halve vertical); `.dash__header` `margin-bottom: 12px` → `6px`;
   toolbar `margin-top: 10px` → `0`. Net recovery ≈ one full bar plus ~24px.
   *Alternative:* zero margins — rejected; tiles touching the bar reads cramped
   and hurts the drag-handle hit areas.

4. **Keep the `dashboard.title` i18n key.** It still labels `aria-label`s (the
   view tablist, the size group) and the free-drag agents panel head
   (`.dash__main-head-title`). Deleting the visible `<h2>` does not orphan the
   key; removing the key would break those labels. No i18n changes needed.

5. **Empty-roster gating unchanged.** The control groups are conditioned on
   `tabs.length > 0` and `DockToolbar` renders the full roster (even when all
   docks are hidden). Reordering children does not alter these conditions; the
   empty dashboard shows just the toolbar + close button on one line.

## Risks / Trade-offs

- [Docks bar and controls compete for one line on mid-width screens] → the
  toolbar's `min-width` floor + `overflow-x: auto` keeps tabs reachable by
  scroll; controls wrap to line two, which is still one line fewer than today.
- [Losing the visible title costs orientation for new users] → accepted by the
  user explicitly; the overlay's distinct chrome and close button carry enough
  context, and screen-reader labels keep using `dashboard.title`.
- [Touch scroll of the toolbar vs. page scroll on phones] → unchanged from
  today's toolbar (already `overflow-x: auto`); no new gesture surface.
- [Regression risk in the header's many conditional controls] → Playwright
  verification must assert all controls remain present and functional in a
  seeded-roster scenario, on desktop and a narrow (phone) viewport.

## Migration Plan

Pure frontend layout change: build `client/dist`, verify on an isolated preview
port with Playwright (both viewports, screenshot), then normal `swap.ps1` deploy
with the dead-man rollback. Rollback = the standard auto-rollback / previous
build; no data or API surface involved.

## Open Questions

- None blocking. Exact pixel values for the spacing budget may be tuned during
  verification against phone screenshots; the spec pins the structure (one bar,
  reduced spacing), not pixel counts.
