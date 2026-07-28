# Proposal: split-divider-drag

## Why

The per-dock split view (shipped in `dock-app-split-view`) fixes the chat/app
panes at 50/50. Real use immediately wants otherwise: a wide product screen
needs more room while the chat is only glanced at, or the operator is mostly
chatting and the app is just a live reference. A fixed ratio forces cover-mode
round-trips instead of a quick resize.

## What Changes

- The vertical boundary between the chat pane (`.phone__main`) and the app pane
  (`.phone__side`) becomes a visible, draggable divider: dragging it
  horizontally reallocates width between the two panes.
- The ratio is clamped so neither pane collapses below its existing usable
  floor (chat ≥ 300px, app ≥ 260px); double-clicking the divider resets to
  50/50.
- Dragging works with mouse and touch (pointer events), and keeps tracking
  smoothly across the embedded app iframe (no dead drag when the pointer
  crosses into the frame).
- The chosen ratio is per-dock and session-ephemeral, like the split choice
  itself: it survives toggling split off/on and switching apps while the dock
  is mounted, and is not synced to other docks/devices.
- No reload/remount on drag: resizing only changes pane widths — the app
  iframe and chat subtree stay mounted (same keep-alive contract as the split
  toggle).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `agent-dock`: the split-presentation requirement gains an adjustable pane
  ratio — a draggable divider between the chat and app panes with clamped
  floors, double-click reset, and per-dock ephemeral persistence.

## Impact

- `client/src/components/dashboard/PinnedAgent.jsx` — divider element between
  the two panes, drag state (`splitRatio`), pointer handlers, inline
  flex-basis on the panes.
- `client/src/pages/dashboard.css` — `.phone__divider` styling (hit area,
  hover/active affordance), drag-time iframe pointer-events guard.
- `client/src/i18n/en.json` / `tr.json` — accessible label/hint for the
  divider.
- No backend, API, or Basic-mode impact (Basic never sees split).
