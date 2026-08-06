# fix-loop-arm-freshness — tasks

## 1. Backend (engine)

- [x] 1.1 `AutopilotService.LastAssistantMessage`: also return the trailing
  assistant message's timestamp (UTC).
- [x] 1.2 `Tick`: for driven kinds, when the trailing message predates
  `loop.ArmedAt`, build the `LoopContext` with `LastAssistant = null` and
  `RunErrored = false` — the kind proposes its stored prompt instead of
  judging stale history. Missing timestamp falls back to current behavior.
- [x] 1.3 `DrainLegacyArming`: stop arming suggestion loops — clear the
  legacy list only, with a log line naming the dropped repos.

## 2. Frontend (dock)

- [x] 2.1 `DockLoopControl.jsx`: on popover open, after the gated detail
  fetch, seed `goal`, `cap`, and (when unarmed) `pickedMode` from this repo's
  loop record if the user hasn't typed yet.

## 3. Verify

- [x] 3.1 Builds: `npm --prefix client run build` + isolated .NET build.
- [x] 3.2 Isolated-port e2e: seed a transcript whose trailing reply mentions
  "deploy"; arm a drive goal loop → engine SENDS iteration 1 (no deny-list
  escalate at 0); then a post-arm reply with a deny word DOES escalate.
- [x] 3.3 Restart persistence: restart isolated harness → loop record
  (goal/cap) unchanged in `loops.json`; popover shows stored goal (Playwright).
- [x] 3.4 Legacy drain: seed legacy ArmedRepoIds → start → no active loops,
  list cleared.
- [x] 3.5 `openspec validate fix-loop-arm-freshness --strict`.
