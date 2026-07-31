# Add the Autopilot Tests tab — one place that states what test coverage exists

## Why

The loop engine now has real test coverage at three layers — the xUnit decision-ladder
suite in `tests/ClaudeWeb.Tests`, the in-app System-tests browser runner, and the
end-to-end rehearsal that drives the real engine with real Claude turns — but nothing in
the app says so. The inventory lives only in chat history, so we repeatedly re-discover
what is covered, what is scratch, and what is honestly untested (the `AutopilotService`
tick engine itself). Without a stated map we don't even know what we don't know: the
next loop change starts from zero again.

## What Changes

- A new **🧪 Tests** root tab in `AutopilotConsole` (both surfaces: the routed Autopilot
  tab and the dashboard pop-up), with four subtabs:
  1. **Unit tests** — static inventory of the xUnit suite: what `dotnet test` runs, what
     `AdvanceQueueLoopTests` covers, and the seam that makes it testable
     (`DrivenLoop.Decide` is a pure ladder; `LoopConfigStore` has a test-dir override).
  2. **Browser (System tests)** — the existing runnable `SystemTestsView`, **moved here**
     from Reference (it is test machinery, not an explainer). Reference keeps the two
     "How … works" explainers.
  3. **E2E rehearsal** — honest description of the rehearsal layer: real engine, real
     Claude turns, scratch repo, untracked scripts, minutes not milliseconds, never CI.
  4. **Plan: engine seam** — the stated gap and the plan to close it: `AutopilotService`
     has no automated tests (BackgroundService, 15 concrete constructor dependencies, no
     seams); the plan is a "run one agent turn" interface + manual-tick entry point so a
     fake runner can drive whole scenarios in milliseconds.
- Static subtabs are pure reference content (no backend calls); the Browser subtab keeps
  its existing `/api/autopilot/systests` behavior unchanged.

## Impact

- Affected specs: `autopilot-explainer` (ADDED requirement: test-coverage map surface).
- Affected code: `client/src/components/autopilot/TestInventoryView.jsx` (new),
  `AutopilotConsole.jsx` (new root tab, System tests moved out of Reference),
  `autopilot.css` if any new styles are needed (reuse `ca-*`/`ov-*` where possible).
- No backend changes; no new API surface; operator-gate posture unchanged.
