## 1. Persisted per-dock view state

- [ ] 1.1 Add a small device-local storage helper for the per-dock record
      (`claudeweb_dock_appview:<dockId>` → `{ appId, split, ratio }`; safe
      JSON parse, ratio clamped to [20, 80] on read) — in PinnedAgent.jsx or a
      shared util next to it, matching the existing localStorage patterns.
- [ ] 1.2 PinnedAgent.jsx: lazy-init `openAppId`, `splitApp`, `splitRatio` from
      the stored record; write-through on every change — app open/close
      (including the files/console/openspec paths that close the app), split
      toggle, and ratio commit (drag end + double-click reset), not per
      pointer-move.
- [ ] 1.3 Guarded rehydration: once the discovered-apps list has loaded, if the
      remembered `appId` is absent, clear the stored record and stay on plain
      chat; split restore only takes effect with an open app and the
      `dockAppSplit` gate on (Basic mode degrades without erasing the record).

## 2. Verify

- [ ] 2.1 Build the client and run an isolated harness on a side port
      (self-dev rules: isolated dir, never the live :5099 bin or port).
- [ ] 2.2 Playwright verify script (dock-test-isolation rules: own POSTed dock
      tab, active in initScript, DELETE in finally): open app → split → drag
      ratio → hide dock via toolbar strip → re-show → assert same app + split +
      ratio restored; cover stays cover; explicit close then hide/re-show lands
      on chat; vanished-app fallback (stub the apps response without the
      remembered app) degrades to chat and forgets.
- [ ] 2.3 `openspec validate persist-dock-split-view --strict` passes; honesty
      pass on proposal/design/spec wording vs what was actually built.
