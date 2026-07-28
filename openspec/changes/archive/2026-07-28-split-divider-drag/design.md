# Design: split-divider-drag

## Context

`dock-app-split-view` renders a split dock as
`.phone__screen--split` (a flex row) holding two stable panes:
`.phone__main` (chat) and `.phone__side` (the `ProductFrame` slot), each
`flex: 1 1 50%` with min-width floors 300px / 260px
(`dashboard.css:2064-2095`, `PinnedAgent.jsx:614-660`). The panes must never
remount on layout changes (keep-alive iframe + keep-composer chat contract).
The dock may be rendered under a CSS `zoom` (`contentZoom` on
`.phone__screen`), and the right pane is a cross-origin-ish iframe that
swallows mouse events.

## Goals / Non-Goals

**Goals:**

- Drag the chat/app boundary horizontally; both panes stay usable (clamped).
- Works with mouse and touch, including when the pointer crosses the iframe.
- Ratio is per-dock, session-ephemeral, survives split off/on and app switch.
- Zero remounts and zero backend involvement.

**Non-Goals:**

- Persisting the ratio to the server or across reloads/devices.
- Vertical (stacked) split layouts or resizing the dock's grid cell by drag.
- Exposing split (or the divider) in Basic mode.

## Decisions

- **D1 — Divider element, not edge-drag.** Insert `<div class="phone__divider">`
  between `.phone__main` and `.phone__side`, rendered only while split. A
  dedicated separator keeps the two panes' DOM identity untouched (chat stays
  `phone__main`'s last child; the slot div stays inside `phone__side`), honoring
  the D2 stable-tree contract from dock-app-split-view.
- **D2 — Ratio as dock-local React state, applied as inline flex-basis.**
  `const [splitRatio, setSplitRatio] = useState(50)` (percent width of the
  chat pane) next to the existing `splitApp` state. In split, panes get
  `style={{ flex: '1 1 ' + ratio + '%' }}` / `100 - ratio`; CSS min-width
  floors still backstop. State (not CSS resize / no external lib): matches the
  splitApp pattern, survives split toggling because `PinnedAgent` stays
  mounted, and needs no dependency.
- **D3 — Pointer events + pointer capture; iframe guarded during drag.**
  `onPointerDown` on the divider calls `setPointerCapture`, then `pointermove`
  computes `ratio = (clientX - rect.left) / rect.width * 100` against the
  screen row's bounding rect (ratio math is zoom-agnostic: both operands live
  in the same coordinate space, so `contentZoom` cancels out). Pointer events
  give mouse+touch in one path. Belt-and-braces for the iframe: while
  dragging, the screen row gets a `phone__screen--dragging` class whose CSS
  sets `pointer-events: none` on the side pane's iframe host, so even if
  capture is lost the frame can't eat the stream; the class also pins
  `cursor: col-resize` and disables text selection.
- **D4 — Clamp in JS to the same floors CSS already enforces.** Convert the
  300px/260px floors to a percent range against the current row width and
  clamp `splitRatio` inside it (when the row is too narrow for both floors,
  fall back to clamping between 20–80%). Clamping in JS keeps the divider
  visually attached to the boundary instead of letting the ratio run past
  where min-width stops the pane.
- **D5 — Double-click resets to 50/50; small keyboard support.** `onDoubleClick`
  → `setSplitRatio(50)`. The divider is `role="separator"`,
  `aria-orientation="vertical"`, `tabIndex=0`, with ArrowLeft/ArrowRight
  nudging the ratio by 2% — cheap accessibility consistent with it being an
  Advanced-mode operator control.
- **D6 — No new capability gate.** The divider only exists inside split, which
  is already behind `dockAppSplit`; it inherits that gating.

## Risks / Trade-offs

- [Pointer capture quirks on odd browsers] → the `--dragging` iframe
  pointer-events guard means worst case the drag still tracks; releasing
  anywhere ends the drag via `pointerup`/`pointercancel`.
- [Row width changes after drag (window resize, grid span toggle)] → ratio is
  percent-based so panes rescale proportionally; CSS floors keep both usable.
- [Ratio state lives in PinnedAgent, lost on dock unmount] → accepted;
  identical lifetime to the split choice itself (spec: ephemeral).
