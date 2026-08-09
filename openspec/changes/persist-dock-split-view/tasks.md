## 1. Persisted per-dock view state

- [x] 1.1 Add a small device-local storage helper for the per-dock record
      (`claudeweb_dock_appview:<dockId>` → `{ appId, split, ratio }`; safe
      JSON parse, ratio clamped to [20, 80] on read) — in PinnedAgent.jsx or a
      shared util next to it, matching the existing localStorage patterns.
- [x] 1.2 PinnedAgent.jsx: lazy-init `openAppId`, `splitApp`, `splitRatio` from
      the stored record; write-through on every change — app open/close
      (including the files/console/openspec paths that close the app), split
      toggle, and ratio commit (drag end + double-click reset), not per
      pointer-move.
- [x] 1.3 Guarded rehydration: once the discovered-apps list has loaded, if the
      remembered `appId` is absent, clear the stored record and stay on plain
      chat; split restore only takes effect with an open app and the
      `dockAppSplit` gate on (Basic mode degrades without erasing the record).

## 2. Verify

- [x] 2.1 Build the client and run an isolated harness on a side port
      (self-dev rules: isolated dir, never the live :5099 bin or port —
      disposable instance on :5219 with its own CLAUDEWEB_DATADIR, fresh
      client/dist mirrored into the exe-local bin).
- [x] 2.2 Playwright verify script `verify-dock-splitview-persist.mjs`
      (disposable instance = full dock isolation; two fixture repos because the
      dashboard opener needs >= 2 dock tabs): open app → split → drag ratio
      (commit on release) + keyboard nudge → hide dock via toolbar strip →
      re-show → same app + split + ratio restored, and again after a reload;
      cover stays cover; explicit close then hide/re-show lands on chat;
      vanished-app fallback (app deleted via the real API, then reload) degrades
      to chat and clears the stored memory; Basic mode renders no dock surface
      at all. 19/19 checks pass.
- [x] 2.3 `openspec validate persist-dock-split-view --strict` passes; honesty
      pass on proposal/design/spec wording vs what was actually built.
