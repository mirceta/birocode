# Add loop-eval-suite

## Why

The loop engine's most important property — a real agent, driven by the real engine,
actually reaches the goal — has no repeatable test. Unit tests cover only the pure
decision ladder, browser tests only the UI, and the one end-to-end proof we have
(the tick-5.5 rehearsal) is an untracked scratch script that was run once by hand.
Every future engine change re-exposes us to "it looks armed but never drives" with
no way to catch it short of another manual rehearsal. Token cost is accepted:
a run that proves the loop works is worth more than any number of free tests
that cannot see agent behavior.

## What Changes

- New committed eval harness at `tests/loop-eval/` (Node scripts, modeled on
  `tests/chat-systest/hub/instance.mjs` + `tests/discovery-eval/` scoring): boots an
  **isolated** harness instance (binaries copied outside the repo tree,
  `CLAUDEWEB_DATADIR` + `CLAUDEWEB_Port` + `CLAUDEWEB_AuthPassword`), pre-seeds the
  autopilot gate + kill switch in the isolated data dir, materializes a fixture repo,
  registers it via `POST /api/repos`, arms a loop via `POST /api/autopilot/loop`,
  and polls `GET /api/autopilot/loops` until the run resolves.
- **Scenario 1 — goal loop**: fixture repo containing a small product with a
  deliberately missing feature and a failing goal check. Assert: loop reaches
  `done · verified` (work → `LOOP_DONE` → verify → `GOAL_VERIFIED`), the goal check
  now passes when re-run, and iterations stayed under the cap.
- **Scenario 2 — queue loop**: fixture repo plus a seeded dock-tab stash of 6 prompts,
  each with a machine-checkable expected artifact. Assert: queue drains to
  `done · drained`, `queueSent == 6` in arm order, and each prompt's expected
  artifact exists/matches. (This promotes `.claudeweb-preview/rehearsal.mjs` into
  tracked, repeatable form — minus the mid-run operator-stop, which stays covered
  by unit tests.)
- Machine-readable verdicts (pass/fail per assertion + summary JSON, exit code),
  same spirit as discovery-eval's `--json` / `--assert-recall`.
- On-demand only: run from the CLI, spends real Claude turns and minutes, never CI.
- Tests tab: the E2E rehearsal subtab and the "Plan: engine seam" subtab are updated
  to document the eval suite as the now-tracked rehearsal layer (doc-only; no new
  runnable machinery in the app).

## Capabilities

### New Capabilities
- `loop-eval`: on-demand real-agent eval suite for the autopilot loop engine —
  isolated harness boot, committed fixture repos, scripted goal-loop and queue-loop
  scenarios with automated outcome assertions.

### Modified Capabilities
- `autopilot-explainer`: the test-coverage map SHALL present the eval suite as the
  tracked end-to-end layer (what it runs, what it costs, how to launch it) instead of
  describing the rehearsal layer as untracked scratch.

## Impact

- New: `tests/loop-eval/` (runner, lib, fixtures, per-scenario expected outcomes, README).
- Modified: `client/src/components/autopilot/TestInventoryView.jsx` (rehearsal + plan
  subtab copy).
- No engine or API changes: the suite drives the shipped surface (`/api/repos`,
  `/api/autopilot/loop`, `/api/autopilot/config`, `/api/autopilot/loops`) exactly as
  an operator would. The host-only gate stays host-only — the harness seeds
  `autopilot-gate.json` in its isolated data dir before boot, which is a host-side
  file write, not a new endpoint.
- Costs real tokens per run (two scenarios ≈ 8–10 real agent turns); documented as
  a before-shipping gate, never CI.
