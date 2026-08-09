## Why

The dock strip's segmented filter treats **running** and **unseen** as two separate
states, but they answer the same operator question — "which agents need my attention
right now?" — so triage means flipping between two views. Separately, any non-All
filter can hide tabs for docks that are *visible on the grid*, which is disorienting:
the operator sees the dock's tile below but its strip tab is gone, so the strip stops
being a reliable map of what's on screen.

## What Changes

- **Merge the status filters**: the **unseen** filter state is removed from the
  segmented control. Selecting **running** now renders tabs whose dot shows *either*
  the running state *or* the `!` unseen-result marker — one "needs attention" view.
- **Grid-visible docks always render**: a tab whose dock is currently visible on the
  dashboard grid (`dashboard !== false`) renders in the strip under **every** filter
  state — branch filters (**on main** / **not on main**) included. Filters only ever
  narrow the *hidden* docks' tabs.
- The excluded-tab **+N count**, ephemerality, and reorder-mode suspension keep their
  existing contract; only the classification of what a state excludes changes.
- The dots, latch behavior, and click semantics are untouched — this is purely about
  which tabs the strip renders.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `agent-dock`: the "Dock toolbar status filter states" requirement changes — the
  **unseen** state is removed and **running** matches running-or-unseen dots; the
  "Dock toolbar branch filter" requirement gains the grid-visible exemption (a
  visible dock's tab renders under every filter state).

## Impact

- `client/src/components/dashboard/DockToolbar.jsx` — filter state list and
  `matchesFilter` classification (view-local, no server or API changes).
- i18n strings for the filter control (remove/reword the unseen label, extend the
  running label to convey it includes unseen).
- No backend, storage, or endpoint changes; no new polling. The `unseenResult`
  latch and its server ownership are unchanged.
