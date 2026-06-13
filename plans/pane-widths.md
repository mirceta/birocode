# Pane widths — per-tab span in multi-pane

> **Status (2026-06-13):** DEPLOYED & confirmed. 18/18 headless checks
> (`.preview-test/pane-widths-test.mjs`). Merged to main.
> Builds on [settings-tab.md](settings-tab.md) (tab registry + Settings UI)
> and [multi-pane.md](multi-pane.md) (the pane window).
> Structured per [doc-principles.md](doc-principles.md).

## Why

All multi-pane panes are equal width. On a wide monitor the user wants
content-heavy tabs (Plan, Files) to span 2-4 slot units while utility tabs
(Git) keep 1 — chosen by the user, like tab order already is.

## What

1. **Width per tab, 1-4 units**, set in the Settings tab's existing tab
   cards (a small 1/2/3/4 stepper next to the ↑/↓ controls). Default 1.
2. **Weight consumes the slot budget**: the strip still computes how many
   ~420px slot units fit (cap 5); a weight-3 tab eats 3 of them, so fewer
   panes show but each unit keeps its physical size. The active tab is
   always shown even if its weight alone exceeds the budget.
3. Phone bottom nav is untouched — weights only affect the desktop
   multi-pane strip.

## How

- **Storage**: `tabWidths: { <tabKey>: 1-4 }` alongside `tabOrder` in
  `uisettings.json` — extend `UiSettingsService` Store, `SettingsController`
  GET/PUT (clamp to 1-4, drop unknown keys; absent key = 1, so future tabs
  need no migration).
- **`PaneStrip.jsx`**: `useMultiPane` windows over weights instead of a
  count — greedily take neighbours around the active tab while total weight
  fits the budget; render each pane with `flex-grow: weight`.
- **`Settings.jsx`**: stepper on each tab card; saves through the existing
  PUT; the live-preview behavior of tab order applies to widths too where
  the strip is visible.

## Done =

Headless Playwright on a wide viewport (~2100px = 5 units): default all-1
shows 5 panes; setting the active tab to weight 3 shows 3 panes with the
wide one ~3x the others; weight survives reload (backend round-trip);
narrow/phone viewport unchanged.
