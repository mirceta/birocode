# Understanding — per-project tab settings (design done)

## Goal (final)

**One goal:** tab settings specific to the **agent/project**. A different
**tab order, pane widths, and tab visibility** per project, so each project's
nav matches the work. Switching project swaps the layout.

**Explicit non-goal:** browser independence (the user doesn't need it). So the
store stays on the **backend** and cross-device sync is kept — no reversal of
settings-tab.md, no "sign-off" needed.

## Decision (Option B, finalized)

Backend store, keyed by **project (`repoId`)**, covering **all three** tab
settings. `uisettings.json` goes from one flat record to a `repoId → { tabOrder,
tabWidths, hiddenTabs }` map; `GET/PUT /api/settings/ui` key off the `X-Repo-Id`
header already sent; the frontend re-fetches on project switch. Old flat file
migrates to a `__default__` entry so no one's current layout resets.

Code magnitude: ~3 files (`UiSettingsService`, `SettingsController`,
`UiSettingsContext`) + a 2-line provider move in `Layout.jsx` so the settings
context can see the active project. `useOrderedTabs`/`Settings`/`PaneStrip`
unchanged.

## Plan docs (refactored)

- `plans/browser-scoped-tab-order.md` — central comparison table + recommendation.
- `plans/tab-order-option-agent.md` — chosen option, full design + code changes.
- `plans/tab-order-option-browser.md` / `-tab.md` — rejected alternatives, kept
  for the record.

## Status

Design complete and decided. Next: create a feature branch is already done
(`feature/browser-scoped-tab-order`); commit the plan, then build Option B.
