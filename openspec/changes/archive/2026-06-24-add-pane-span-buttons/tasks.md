# Tasks

## 1. Feature flag
- [x] Add `paneSpanButtons: 'advanced'` to `FEATURES` in `client/src/context/UiModeContext.jsx`

## 2. Pane-bar controls
- [x] In `client/src/layout/PaneStrip.jsx`, pull `tabWidths`/`saveTabWidths`, the tab order, and `useFeature('paneSpanButtons')`
- [x] Render gated "−"/"+" buttons in `.pane__bar` beside the label, with `aria-label`s + i18n keys
- [x] Wire clicks to the existing sparse-map + 1–4 clamp via `saveTabWidths(order, next)` (mirror Settings' `setWidth`)
- [x] Disable "−" at 1 and "+" at 4

## 3. Styling
- [x] Give `.pane__bar` a flex layout (label left, buttons right) and style the buttons in `client/src/styles/global.css`

## 4. i18n
- [x] Add `pane.spanInc` / `pane.spanDec` keys to `en.json` and `tr.json`

## 5. Verify
- [x] Headless-browser check (isolated self-dev preview on :5200, datadir seeded with "changeme"):
  - 4 panes @ 2000px → 8 buttons (2/pane); narrow @ 700px → 0 panes, 0 buttons
  - "+" grew the active pane to flexGrow 2 and persisted across reload (round-trips `/settings/ui`)
  - Settings stepper for the same tab read `2×` (shared state agreement); "−" returned it to 1
  - confirmed the accepted A2 edge: growing until the budget is spent collapses the strip to single-pane

## 6. Understanding app
- [x] Authored `understanding-app/index.html` — interactive sim of the slot-budget layout, the +/− window shift, and the collapse edge (mirrors `useMultiPane`)
