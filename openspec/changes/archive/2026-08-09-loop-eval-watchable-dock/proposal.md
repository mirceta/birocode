## Why

The whole point of live mode (add-loop-eval-live-mode) and the Tests-tab runner
(add-loop-eval-ui-runner) is the operator's user story: *press Start in
Autopilot → Tests → E2E eval, then watch the loop drive a real conversation in an
agent dock on the dashboard*. The `loop-eval-ui-runner` baseline spec already
promises exactly that ("the fixture repo's agent dock tab opens in the frontend
where the operator watches the loop drive real agent turns") — but the goal
scenario never creates a dock tab at all, so a goal run shows a repo card and a
loop card and **no dock**: the conversation being driven is invisible in the
DOCKS strip. The operator hit this in practice ("I don't see an agent dock that
would get driven by the loop"). The queue scenario creates a tab but never binds
it to the seeded conversation, so until the engine's first send is discovered the
dock opens onto an empty chat.

## What Changes

- **Goal scenario creates a dock tab** for the fixture repo (both modes, so the
  scenario code stays mode-blind), right after the seed turn and before arming.
  The existing live teardown / keep-mode bookkeeping (`liveTabId`) already covers
  it.
- **Both scenarios bind the tab to the driven conversation**: after the seed turn
  completes, its `sessionId` (already exposed by `GET /api/runs`) is PATCHed onto
  the dock tab and passed explicitly as the arm's `SessionId` pin — tab, pin, and
  seed are provably the same conversation, and opening the dock immediately shows
  the seed turn instead of an empty chat. From there the existing visible-page
  run discovery (fix-loop-conversation-identity, D6) streams every loop-driven
  turn into the dock with no further work.
- **Tests-tab runner gains a direct "watch" affordance**: while a run is active,
  the E2E section locates the `loopeval-*-live` fixture's dock tab in the synced
  dock list and renders a button that focuses that dock (activates the tab and
  navigates to it), replacing the current passive "open the repo…" prose. Until
  the tab appears, the passive hint remains as the fallback.
- No new endpoints, no engine changes, no dock-model changes — the dock list is
  already backend-owned and device-synced, and the dashboard already shows every
  synced tab.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-eval`: the live-watchability requirement gains the dock guarantee — a
  scenario SHALL ensure a dock tab exists for the fixture repo and is bound
  (sessionId) to the conversation the loop drives, before arming.
- `loop-eval-ui-runner`: the "agent dock tab opens" promise becomes concrete and
  testable — while a run is active the Tests tab SHALL offer a control that
  focuses the fixture repo's dock, with the passive watch hint only as the
  pre-appearance fallback.

## Impact

- `tests/loop-eval/lib.mjs` — generalize `createTabWithStash` (tab creation
  without stash), add the sessionId PATCH helper; `seedTurn` already returns the
  run (which carries `sessionId`).
- `tests/loop-eval/goal.mjs` — create + bind the dock tab, pass `SessionId` on
  arm.
- `tests/loop-eval/queue.mjs` — bind the existing tab to the seeded session,
  pass `SessionId` on arm.
- `client/src/components/autopilot/TestInventoryView.jsx` — the watch button
  (uses `useDock()`; no new API).
- No harness (C#) changes expected.
