## 1. Suite — create and bind the dock tab

- [x] 1.1 Split `createTabWithStash` in `tests/loop-eval/lib.mjs` into
      `createTab(repoId, repoName)` (POST /api/dock, tracks `liveTabId`,
      returns tabId) plus the existing stash loop; keep `createTabWithStash`
      as the composition so queue.mjs is untouched by the split
- [x] 1.2 Add `bindTabSession(tabId, sessionId)` to lib.mjs: PATCH
      `/api/dock/{tabId}` with `{ sessionId }`; on a missing/empty sessionId
      warn via `say()` and return without failing (design D2 fallback)
- [x] 1.3 goal.mjs: after the seed verdict, `createTab(repoId, repoName)` +
      `bindTabSession(tabId, seed.run.sessionId)`, then pass
      `SessionId: seed.run.sessionId` on the arm request (mode-blind — both
      isolated and live, no new assertions)
- [x] 1.4 queue.mjs: `bindTabSession` the existing tab to the seed session and
      pass `SessionId` on its arm request the same way
- [x] 1.5 Update `announceWatch` copy to name the dock directly ("its agent
      dock is in the DOCKS strip — open the loopeval-* agent")

## 2. Frontend — watch control in the Tests tab

- [x] 2.1 In `TestInventoryView.jsx`'s `LoopEvalRunner`, read the synced dock
      list via `useDock()` and, while a run is active, find the tab whose
      `repoName` matches `/^loopeval-.*-live$/`
- [x] 2.2 Render "▶ Watch its agent dock" when that tab exists:
      `setActiveTab(id)` + navigate to the chat surface; keep the existing
      passive hint as the no-tab-yet fallback, and render no watch affordance
      once the run is terminal and the tab is gone
- [x] 2.3 Style the control with the existing `st-run-btn` / `ap-mini` palette
      (no new CSS system)

## 3. Verify

- [x] 3.1 `npm --prefix client run build` + `dotnet build` stay green;
      `dotnet test` unaffected (no C# change expected)
- [x] 3.2 Isolated goal run once (`node tests/loop-eval/goal.mjs`) — verdict
      count and pass/fail identical to before the change (design D4)
- [x] 3.3 Live goal run started from the Tests tab: the `loopeval-goal-live`
      dock appears in the DOCKS strip, the watch button jumps to it, the seed
      turn is visible immediately, and loop-driven turns stream in
      (browser-verified per docs/claude-web/browser-testing.md —
      `.claudeweb-preview/playwright/verify-loopeval-dock.mjs`, 12/12 checks;
      the only console noise is the pre-existing missing understanding.md /
      plan.md 400 probe on the bare fixture repo, allowlisted by exact URL)
- [x] 3.4 After the run finishes, the dock tab is cleaned up and the watch
      affordance is gone; `LOOPEVAL_KEEP=1` path still names the tab in its
      manual-cleanup steps (lib.mjs downLive)

## 4. Ship

- [x] 4.1 `openspec validate loop-eval-watchable-dock --strict` passes
- [ ] 4.2 Feature branch, deploy to live via `swap.ps1`, operator verifies the
      user story in production, keep on their "keep it", then archive + merge
