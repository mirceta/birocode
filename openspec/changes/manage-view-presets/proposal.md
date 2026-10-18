# Management dashboard layout presets (fleet task d6e499cd)

## Why

The Management dashboard has many tabs (Status, Kanban, Subagents, Memory, Prompts, Arch agent…). The Operator works
with several of them side by side, with the dividers dragged into place. Rebuilding that arrangement by hand
(toggling panes, reordering, dragging) each time the work changes is slow. The Operator wants to save a view once and
switch between two or three of them in one click.

## What changes

- **A view** is the state ManageApp already keeps per device: the visible panes in order, and the divider positions.
  A **preset** freezes one: `{ id, name, auto, panes: [{ tab, sel? }], fractions, created, updated }`.
  - The fractions sum to 1, so a preset survives window resizes.
  - `sel` is the Subagents conversation, kept when Subagents is open.
- **A preset bar** under the dashboard header:
  - 💾 **Save view** (Alt+Shift+S) adds a 🔖 preset tab named after the open panes, "Status | Kanban | Subagents".
  - Clicking a preset (or Alt+1..9) opens exactly those panes, in that order, with those divider positions. A
    one-pane preset switches to the Tabs layout.
  - The applied preset is highlighted. A manual change marks it **modified**, offering ⟳ Update preset and ↶ Revert.
  - ⋯ per preset: Rename (or double-click the tab), Update from the current view, Move left / right, Delete.
- **Persistence:**
  - Per browser in localStorage, as the working copy.
  - On the hub: `GET/PUT /api/settings/view-presets` (`view-presets.json`), so another browser sees the same
    presets.
  - A fresh browser adopts the hub's list.
  - While the two agree, every edit is mirrored to the hub. When they differ, **⇅ Sync** merges them: the union by
    id, with the browser's version winning a conflict.
- **Robustness:**
  - A preset naming a tab that no longer exists opens the rest and shows a toast.
  - The default view is untouched until a preset is applied: loading the page and saving presets change none of the
    view keys.

## Impact

- **Server:** `ViewPresetsService` + `ViewPresetsController` (Settings module); tests: `ViewPresetsTests`.
- **Client:**
  - `manage/viewPresets.js` (pure model, with tests), `manage/PresetsBar.jsx` and `viewPresets.css`;
  - `ManageApp.jsx` (`currentView` + `applyPreset`);
  - en/tr strings;
  - the committed manage bundle.
