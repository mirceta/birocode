## 1. Build

- [x] 1.1 `harnessWindow.js`: the placement store (`manageapp.harnessWindow`), `featuresFor`,
      `screenSummary`, `screenPicking` (feasibility), `listScreens`, `openInHarnessWindow`.
- [x] 1.2 `workerWindow.js`: `focusAgentTab` consults the placement — `tabs` unchanged,
      `window` routes to the dedicated harness window.
- [x] 1.3 `ManageSettings.jsx` + css: the placement setting (two modes, screen picker or the
      honest note, "Open the harness window now", the what-a-page-can-do note) and the arch's
      settings cards.
- [x] 1.4 `Arch.jsx`: the fleet-wide cards split into Managed agents / Fleet / Home repo / Goal
      conversations; `cards="settings" | "status" | "all"`.
- [x] 1.5 `ManageApp.jsx`: the Settings tab (order, weights, label, pane); Status keeps the
      status cards; i18n en/tr; the Management App bundle rebuilt.
- [x] 1.6 Tests: `harnessWindow.test.mjs` (6 — store, features, summary, feasibility, screens,
      open/reuse/navigate/focus, the click-time dispatch).

## 2. Verify

- [x] 2.1 `openspec validate management-settings-tab --strict`; client suite green.
- [x] 2.2 Headless evidence `client/tests/ui/shot-manage-settings.mjs` (10/10): the tab, the
      cards' new homes, the placement UI (picker or honest note), the chosen screen shown,
      "Open now" and a badge click opening the named window with the screen's features in
      `window` mode and the per-agent tab with no features in `tabs` mode →
      `docs/screenshots/manage-settings.png`, `manage-status-after.png`.

## 3. Ship

- [ ] 3.1 PR against main (fleet task a434653b); the Operator merges by hand; no deploy here.

## 4. Follow-up (the Operator decides)

- [ ] 4.1 A companion Chrome extension for per-agent tabs inside an existing left-monitor
      window (chrome.windows / chrome.tabs, driven by the dashboard).
- [ ] 4.2 Serve the dashboard over https (or reach it from localhost) so the screen picker works.
- [ ] 4.3 Sync the placement to the harness so another device inherits it.
