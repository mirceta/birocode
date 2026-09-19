## 1. Build

- [x] 1.1 Research: `check-harness-tabs.mjs` — where a tab opened from a popup / a plain-tab
      launcher lands, re-click = focus without reload, the popup blocker with and without
      pop-ups allowed.
- [x] 1.2 `harnessWindow.js`: `viewer` (tabs | single) on the placement; `launcherUrl`,
      `isLauncherPage`, `installLauncher` (open once, focus after, never reload, reports),
      `openAgentViaLauncher` (find / create the launcher tab without features, await its hook,
      blocked / no-launcher outcomes).
- [x] 1.3 `workerWindow.js`: window + tabs → the relay (blocked → fall back beside the dashboard
      and tell the Settings tab); window + single → the placed viewer; tabs → as before.
- [x] 1.4 `HarnessLauncher.jsx` at `manage.html?launcher=1` from the same bundle; `main.jsx`.
- [x] 1.5 `ManageSettings.jsx`: the viewer choice, the two one-time steps, "Open the harness
      window now" creating the launcher, the relay note; i18n en/tr; bundle rebuilt.
- [x] 1.6 Tests: `harnessWindow.launcher.test.mjs` (5); the placement tests updated.

## 2. Verify

- [x] 2.1 `openspec validate harness-window-agent-tabs --strict`; client suite green.
- [x] 2.2 `client/tests/ui/shot-harness-window-tabs.mjs` (8/8): the viewer choice, "Open now"
      creating the launcher tab, a first click creating the launcher without features and
      asking it, a re-click being a focus, a second agent its own ask, the dashboard never
      opening agent tabs itself, the launcher page rendering with its hook →
      `docs/screenshots/manage-settings-tabs-viewer.png`, `harness-launcher.png`.

## 3. Ship

- [ ] 3.1 PR against main (fleet task 9973393e); the Operator merges by hand; no deploy here.

## 4. Follow-up

- [ ] 4.1 The companion extension for tabs in an existing window placed on a chosen screen.
