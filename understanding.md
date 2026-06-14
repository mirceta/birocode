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

## Status — built & verified (7/7)

Implemented Option B:
- `UiSettingsService` → `repoId → { tabOrder, tabWidths, hiddenTabs }` map, with
  `__default__` legacy migration and fork-on-write so a project's other settings
  don't reset when one is changed.
- `SettingsController` keys GET/PUT by the resolved repo (`RepositoryResolver`).
- `Layout.jsx` moved `UiSettingsProvider` inside `RepoProvider`;
  `UiSettingsContext` re-fetches on project switch. `useOrderedTabs`/`PaneStrip`/
  `Settings` unchanged.

Browser-verified on an isolated :5200 instance (`verify-per-project-tabs.mjs`,
7/7): API isolation (SELF=custom order, OTHER inherits default) + in-app project
switch swaps the nav and restores it. Live :5099 left untouched (settings file
backed up + restored). Next: commit, then deploy/merge when the user says.
