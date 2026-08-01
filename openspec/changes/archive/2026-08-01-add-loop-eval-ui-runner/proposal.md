# Proposal: add-loop-eval-ui-runner

## Why

The loop-eval suite's live mode (shipped in `add-loop-eval-live-mode`) proves the
loop engine against the real :5099 harness, but the only trigger is a terminal
command (`node tests/loop-eval/goal.mjs --live` with `LOOPEVAL_LIVE_PW` set) — the
Operator asked for the obvious next step: start it from the harness itself. The
watching experience already exists (live mode registers the fixture repo in the
live store and opens its dock tab), so the missing piece is a UI trigger plus
run-status feedback in the Tests tab.

## What Changes

- The Autopilot console's **Tests tab** gains an **E2E eval** section listing the
  live-mode scenarios (goal, queue, run-all) with a **Start** button each,
  live run status (preflight → armed → running with iteration count → verdict),
  and per-assertion results when a run finishes.
- The harness gains a backend **eval-runner service** that spawns the existing
  Node scenario scripts in `--live` mode against itself, streams their
  `@@LOOPEVAL@@` verdict lines and status output back to the UI, and enforces
  one-run-at-a-time (the box has one `claude` CLI).
- The eval runner authenticates against the harness with a **one-shot internal
  token** minted by the harness for the spawned child process — the live
  operator password is never read off disk, never passed, and the existing
  `LOOPEVAL_LIVE_PW` path stays unchanged for terminal runs.
- Preconditions stay operator-owned: gate OFF / kill switch OFF / leftover
  `loopeval-*-live` repo are surfaced as actionable errors in the Tests tab
  (what to click, where) — the runner never auto-enables anything, same
  no-enable-path stance as live mode itself.
- UI is **Advanced-mode only** (per the UI-modes convention: new features
  default to Advanced).

## Capabilities

### New Capabilities

- `loop-eval-ui-runner`: starting, watching, and reading the results of a
  live-mode loop-eval run from the harness UI — the Tests tab E2E section, the
  backend run-orchestration endpoints, single-run concurrency, and precondition
  surfacing.

### Modified Capabilities

- `loop-eval`: live mode gains a second authentication path — a harness-minted
  one-shot internal token (`LOOPEVAL_LIVE_TOKEN`) accepted as an alternative to
  `LOOPEVAL_LIVE_PW`; the "never read a password off disk / never defaulted"
  requirement is preserved and restated to cover both paths.

## Impact

- **Frontend**: `client/src/components/autopilot/TestInventoryView.jsx` (new E2E
  section) or a sibling component; capability map entry in
  `client/src/context/UiModeContext.jsx` as `'advanced'`.
- **Backend**: new controller/service pair (per `plans/INTEGRATION.md`
  conventions) to spawn/track/stream the runner process; a one-shot token
  accepted by the auth layer for API calls only for the run's lifetime.
- **Eval suite**: `tests/loop-eval/lib.mjs` learns `LOOPEVAL_LIVE_TOKEN`; scenario
  scripts unchanged otherwise.
- **Specs**: new `loop-eval-ui-runner`; delta to `loop-eval`.
- **Cost**: unchanged — runs still spend real agent turns (~10–15 min for
  run-all); the button makes that easier to trigger, so the UI must show the
  cost note before starting.
