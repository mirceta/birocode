## 1. Engine + store extensions (backend)

- [x] 1.1 `LoopConfigStore`: add `StopReason`/`StopDetail` fields (additive JSON), written by `Resolve`; extend `LoopState` record
- [x] 1.2 `AutopilotService.HandleLoop`: add the `NEEDS_HUMAN:` check (ordered error → sentinel → needs-human → deny-list → cap → resend), capturing the trailing question into the stop detail; pass detail for deny-list and cap resolutions too
- [x] 1.3 `LoopRecipeStore` (`loop-recipes.json`): id/name/prompt/sentinel/cap, atomic writes, seed "Drive the feature" + "Finish and ship" with the contract paragraph in the prompt text, never-reseed-over-edits guard; DI registration

## 2. API

- [x] 2.1 Recipe CRUD on `AutopilotController` (list/create/update/delete), operator-gated like the other action endpoints
- [x] 2.2 `GET /api/autopilot/loops`: read-only loop-status projection (loop states + stop reason/detail + recipe names), session-auth only, NOT operator-gated; extend `GET /api/autopilot` payload with recipes + stop reasons for the console

## 3. Convention doc

- [x] 3.1 Write `docs/loop-driven-agent-convention.md` (agent-agnostic contract: sentinel + `NEEDS_HUMAN:` markers, when to emit, safety posture incl. the read-only-endpoint deviation); add the CLAUDE.md pointer line

## 4. Frontend — dock card

- [x] 4.1 Loop badge on the dock agent card (looping n/cap · done · escalated · capped · error · stopped; escalated visually distinct), polling `GET /api/autopilot/loops`
- [x] 4.2 Loop control popover on the dock card: recipe picker + cap tweak → arm via `POST /api/autopilot/loop`; Stop for an active loop; explicit gate-closed hint on 403
- [x] 4.3 Advanced-gate the badge + control in the `UiModeContext` capability map; CSS + i18n (en/tr) strings

## 5. Frontend — Autopilot console

- [x] 5.1 `LoopsView`: recipe management (list/edit/delete, seeded defaults) and arm-from-recipe
- [x] 5.2 Stop-reason readout per loop (reason + detail, e.g. the NEEDS_HUMAN question) in `LoopsView`

## 6. Verify + docs honesty

- [x] 6.1 Backend e2e on an isolated port: NEEDS_HUMAN branch resolves `escalate` with the question captured; stop reason/detail persisted for deny/cap branches; recipes seed once and survive edit+restart (`.claudeweb-preview/playwright/verify-loops-adoption-api.mjs` — 33 checks, all pass)
- [x] 6.2 Playwright on an isolated port: dock badge states (looping/escalated/terminal), arm-from-dock recipe flow, gate-closed hint, Basic mode shows nothing; per the dock-test-isolation rules (own dock tab, stubbed repos) (`.claudeweb-preview/playwright/verify-dock-loops-ui.mjs` — isolated :5219 datadir, all pass)
- [x] 6.3 `openspec validate adopt-autopilot-loops --strict`; honesty pass on `understanding-app/` + the Autopilot explainer tab so both match the built behavior
- [ ] 6.4 First real use: arm "Drive the feature" on an actual small feature, review the stop-reason readout, tune the seed recipes from what happened
