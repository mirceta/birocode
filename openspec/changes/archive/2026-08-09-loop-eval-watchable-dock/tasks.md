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
- [x] 3.4 ~~After the run finishes, the dock tab is cleaned up and the watch
      affordance is gone~~ SUPERSEDED by §5 (operator decision 2026-08-09): the
      dock must SURVIVE the verdict; teardown is deferred to FINISH AGENT

## 4. Ship

- [x] 4.1 `openspec validate loop-eval-watchable-dock --strict` passes
- [x] 4.2 Feature branch, deploy to live via `swap.ps1`, operator verifies the
      user story in production, keep on their "keep it", then archive + merge —
      shipped inside main @ 43e8e88 (merged via the ideas-drive-sync PR cycle),
      deployed to live :5099 2026-08-09 and kept on the operator's "keep it";
      the in-production user story was browser-verified in 3.3 before merge

## 5. Kept test agent + FINISH AGENT (operator decision 2026-08-09)

- [x] 5.1 Runner sets `LOOPEVAL_KEEP=1` on UI-started runs (suite skips live
      teardown); waiter stops any loop still armed on a `loopeval-*-live`
      fixture the moment the run ends, so a kept fixture never spends turns
- [x] 5.2 `POST /api/loopeval/fixture/finish` (FinishFixture): stop loop, close
      dock tab(s), unregister repo card, delete scratch copy; 409 while a run
      is active, 404 with nothing to finish; clears the run's leftover banner
- [x] 5.3 Tests tab: watch control no longer gated on `active` (dock stays
      after the verdict); kept-agent banner with FINISH AGENT button; leftover
      fixture blocks Start via the banner, not the problems list; explainer +
      lib.mjs keep/preflight copy point at FINISH AGENT
- [x] 5.4 Verify: builds green, C# tests pass, deploy to live, operator sees
      the dock survive a finished run and FINISH AGENT tear it down
      (deployed 2026-08-09 03:24, kept; operator confirmed "it works")
