## 1. Backend — drop run-all from the runner surface

- [x] 1.1 Remove the `run-all` `ScenarioDef` from `LoopEvalRunnerService.Scenarios`
      (listing + start validation follow); keep the `run-all.mjs`-based
      `suitePresent` probe and comments honest about the suite still owning
      the sweep
- [x] 1.2 Verify `POST /loopeval/runs {scenario:"run-all"}` now rejects as
      unknown scenario (existing validation path — confirm error copy, no 500)
- [x] 1.3 `dotnet test` — full suite green (ScenarioManifestCacheTests already
      model goal+queue only)

## 2. Frontend — runner subtab slims to rows

- [x] 2.1 In `TestInventoryView.jsx`, strip `section === 'rehearsal'` down to
      LoopEvalRunner plus a one-line pointer to the mechanics subtab
- [x] 2.2 Move the runner's intro paragraph (what Start spawns, token mint,
      one-run-at-a-time) out of `LoopEvalRunner` into the mechanics content
- [x] 2.3 Remove the `composes` branch from `ScenarioManifest` (dead with no
      run-all row) and the run-all mentions in the moved/retained copy
      (cost section cites `run-all.mjs` as the terminal sweep, not a row)

## 3. Frontend — new mechanics subtab

- [x] 3.1 Add `evalhow` section to `TestInventoryView` holding the moved prose:
      layer intro, "The two scenarios", "Two run modes", "What it costs",
      rule-of-thumb footer, runner intro paragraph
- [x] 3.2 Add the subtab entry in `AutopilotConsole.jsx` Tests nav
      (Unit · Browser · E2E eval · How E2E works · Plan) routing to
      `TestInventoryView section="evalhow"`

## 4. Verify

- [x] 4.1 `npm --prefix client run build` clean
- [x] 4.2 Headless browser check against an isolated preview (:5200 recipe):
      E2E eval subtab shows only banner/rows/run panel with two rows (goal,
      queue) and no Full sweep; How E2E works subtab renders the moved prose
- [x] 4.3 `openspec validate loop-eval-tests-tab-declutter --strict` passes
