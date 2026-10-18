# Design — manage-view-presets

## Where the view lives today

`client/src/manage/ManageApp.jsx` keeps the split view in localStorage, per device:

| key | meaning |
|---|---|
| `manageapp.layout` | `tabs` (one view) or `panes` (side by side; below 720 px it renders as tabs) |
| `manageapp.tab` | the tab shown in Tabs layout (also `?tab=`) |
| `manageapp.paneOrder` | the order of all tabs; the strip and the panes follow it |
| `manageapp.hidden` | the panes hidden in panes layout |
| `manageapp.paneWeights` | flex-grow weight per tab; a divider drag re-derives the two neighbours' weights |

Presets reuse that state: nothing new is rendered differently. Applying a preset writes those same keys.

## The model (`viewPresets.js`, pure)

```
currentView(state)      -> { panes: [tab…], fractions: [..sum 1..] }   what is on screen
capture(view)           -> preset { id, name "A | B | C", auto, panes:[{tab, sel?}], fractions, created, updated }
applyPlan(preset, tabs) -> { layout, tab, order, hidden, weights, sel, missing[] }
isModified(preset, view)   panes / order differ, or any divider moved > 1 %
mergeBrowserWins(local, hub)  union by id, browser's copy on conflict, max 9
```

On apply, weights are `fraction × paneCount` for the preset's panes. The other tabs keep their own weights for the
Operator's later manual use. The preset's panes go first in `order`, the rest keep their relative order. The 220 px
pane minimum still applies: a pane saved at its minimum stays at the minimum in a narrower window.

## Sync

```
load:  hub = GET /api/settings/view-presets
       browser empty & hub not      -> adopt the hub's list
       hub empty & browser not      -> PUT the browser's list (nothing to lose)
       both, different              -> keep the browser's, show ⇅ Sync
edit:  write the browser copy; PUT to the hub only if the two agreed before the edit
sync:  merged = union(browser, hub) by id, browser wins -> both
```

Comparison ignores key order and the hub's 4-decimal rounding.

## Keys

Alt+1..9 applies preset n, and Alt+Shift+S saves the view. The brief suggested Ctrl+1..9, but Chrome and Edge keep
Ctrl+1..9 for their own tab switching and a page cannot claim it.

## Evidence

- Node: `viewPresets.test.mjs` (8). Client 341/341.
- .NET: `ViewPresetsTests` (4).
- Lab on this hub (`.claudeweb-preview/presetlab/lab.ps1`): an isolated harness on :5302 with copies of the live
  stores, gate closed, no prompt sent. Playwright passed **25/25**:
  - three presets made from real arrangements (by button, by Alt+Shift+S, renamed via ⋯);
  - switching by click and Alt+2 / Alt+3, with the same panes and the same divider fractions;
  - modified → Revert; a resize keeps the proportions;
  - a reload keeps the presets; the hub holds them;
  - a second browser profile sees the three and applies one;
  - a missing tab opens the rest with a toast;
  - ⇅ Sync merges in both browsers.
- The GIF and screenshots are in `docs/screenshots/dashboard-view-presets/`.
