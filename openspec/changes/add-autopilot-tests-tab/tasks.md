# Tasks — add-autopilot-tests-tab

## 1. Frontend

- [x] 1.1 `TestInventoryView.jsx` — static content for the three documentation subtabs
      (Unit tests / E2E rehearsal / Plan: engine seam), facts verified against the repo
      (47 tests green, 13 in `AdvanceQueueLoopTests`, 15 constructor deps on
      `AutopilotService`)
- [x] 1.2 `AutopilotConsole.jsx` — new 🧪 Tests root tab with four subtabs; System tests
      subtab renders the existing `SystemTestsView`; remove `systests` from Reference
- [x] 1.3 Styles — reuse `ca-sec`/`ov-list`; add minimal `ti-*` rules only if needed

## 2. Verify

- [x] 2.1 `npm --prefix client run build` clean
- [x] 2.2 Headless browser check on an isolated instance: Tests root tab present, all
      four subtabs render, System tests runner works from its new home, Reference no
      longer lists it
- [x] 2.3 `openspec validate add-autopilot-tests-tab --strict`
