# Proposal: split-no-forced-wide

## Why

Entering split view currently forces the dock's dashboard grid cell to span two
columns — the same widening the ⤢ (Wide) toggle applies. The user experiences
this as split "forcing the dock into expanded mode": the dock jumps in size and
the neighbors reflow, even when they wanted the split contained in the dock's
normal footprint. Whether a dock is wide should stay the user's call (the ⤢
toggle); split should only change what happens **inside** the dock.

## What Changes

- Entering/leaving split no longer touches the dock's grid cell width. The
  `splitDocks` report-up machinery (PinnedAgent → Dashboard) is removed.
- The ⤢ Wide toggle keeps working exactly as before, including while split —
  widening is now the user's explicit choice in every case.
- The split pane minimum-width floors (chat 300px / app 260px) were sized for a
  widened cell; in a normal-width cell they'd overflow it. They become
  container-aware (`min(300px, 45%)` / `min(260px, 38%)`), and the divider's
  drag clamp mirrors the same rule, so the panes always fit whatever width the
  dock actually has.

## Capabilities

### agent-dock

- **REMOVED**: "A split dock widens in the dashboard grid" — split no longer
  changes cell width.
- **ADDED**: "Split fits the dock's existing cell" — split renders inside the
  dock's current footprint at any cell width; manual ⤢ widening still honored.

## Impact

- `client/src/pages/Dashboard.jsx` — drop `splitDocks` state / `handleSplitChange` / `splitWide` cell class.
- `client/src/components/dashboard/PinnedAgent.jsx` — drop `onSplitChange` prop + report-up effect; divider clamp floors become container-aware.
- `client/src/pages/dashboard.css` — pane `min-width` floors become `min(px, %)`.
- `.preview-test/split-view-check.mjs` — the widen/restore assertions invert (cell must NOT widen).
- No backend change.
