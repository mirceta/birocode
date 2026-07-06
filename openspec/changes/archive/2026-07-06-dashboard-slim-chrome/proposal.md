## Why

The agent dashboard wastes vertical space on chrome: a "Dashboard" title label in
the upper-left that tells the operator nothing (the overlay is self-evident), a
header row whose only other content is the upper-right sizing/view controls, and
generous margins/padding around the dock toolbar below it. On the screens that
matter (the Operator's monitor and the End User's phone) that header stack costs
one to two dock rows' worth of height before any agent content appears.

## What Changes

- Remove the `Dashboard` title label (`.dash__title`) from the dashboard header
  entirely — no replacement text.
- Collapse the two header rows into one: the dock toolbar (the docks bar) and the
  upper-right controls (size stepper, content zoom, layout mode, view tabs,
  only-important filter, close button) share a single horizontal bar. The dock
  toolbar takes the leading space and keeps its horizontal scroll; the controls
  sit after it on the same line, wrapping below only when the viewport is too
  narrow to fit both.
- Trim the vertical chrome: reduce the dashboard's outer padding and the header's
  bottom margin / toolbar top margin so the grid starts higher.
- No behavior changes to any control or to the toolbar's toggle semantics — this
  is layout-only; every existing control keeps its function, labels, and gates.

## Capabilities

### New Capabilities

- `dashboard-chrome`: the dashboard overlay's header layout — what chrome the
  header shows (no title label), the single shared control/toolbar bar, its
  wrapping behavior on narrow screens, and the compact spacing budget above the
  agent grid.

### Modified Capabilities

<!-- none — agent-dock's toolbar requirements ("at the top of the Dashboard",
toggle semantics, Advanced gate) are unchanged; only unspecified layout moves. -->

## Impact

- `client/src/pages/Dashboard.jsx` — remove the `<h2 class="dash__title">`, reorder
  the header so `DockToolbar` and the control groups share one flex row.
- `client/src/pages/dashboard.css` — `.dash` padding, `.dash__header` wrap/margins,
  `.dash__docktoolbar` flex sizing (from `flex: 1 1 100%` full-width row to a
  shrinking lead item), control-group flex rules.
- `client/src/i18n/*.json` — `dashboard.title` stays (still used by aria-labels and
  the free-drag panel head); no key removals expected.
- No backend, API, or UI-mode/capability-map changes.
