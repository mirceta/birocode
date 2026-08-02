# Tasks: add-loop-eval-ui-runner

## 1. Suite: token auth path

- [x] 1.1 `tests/loop-eval/lib.mjs`: accept `LOOPEVAL_LIVE_TOKEN` — install it as
      the `claudeweb_session` cookie and skip `POST /api/auth/login`; keep
      `LOOPEVAL_LIVE_PW` behavior unchanged; with neither set in live mode,
      refuse before any network call (extend the existing guard message to name
      both variables); no implicit fallback between the two
- [x] 1.2 Fail fast on an invalid/revoked token: first authorized preflight call
      returning 401 produces a verdict naming the credential (mirror the
      existing wrong-password verdict copy)
- [x] 1.3 Update `tests/loop-eval/README.md`: `LOOPEVAL_LIVE_TOKEN` row in the
      env table (marked "set by the harness UI runner — not for manual use"),
      and a short "run it from the Tests tab" pointer in the live-mode section

## 2. Backend: runner service + endpoints

- [x] 2.1 `LoopEvalRunnerService` (singleton, own module extension per
      `plans/INTEGRATION.md`, log tag `[LOOPEVAL]`): holds at most one run
      `{scenario, state, startedAt, statusLines, verdicts}`; resolves the suite
      path from the harness's own repo checkout and errors clearly if
      `tests/loop-eval/` is absent
- [x] 2.2 Session minting: create a tagged (`loopeval-runner`) session directly
      in the existing session store, pass its id to the child as
      `LOOPEVAL_LIVE_TOKEN`, revoke on run end (all outcomes); sweep stale
      tagged sessions at service start
- [x] 2.3 Spawn `node tests/loop-eval/<scenario>.mjs --live` with stdout/stderr
      captured; parse per-poll status lines into the tail and `@@LOOPEVAL@@`
      JSON lines into verdicts; derive state transitions
      (preflight → armed → running → passed/failed/error)
- [x] 2.4 `LoopEvalController`: `POST /api/loopeval/runs` (409 with active-run
      info when busy; body = scenario id), `GET /api/loopeval/runs/current`,
      `DELETE /api/loopeval/runs/current` (process-tree kill, then leftover
      `loopeval-*-live` repo check reported in the final state),
      `GET /api/loopeval/preflight` (gate, kill switch, leftover repo, suite
      present — read-only, no enable path)
- [x] 2.5 `GET /api/loopeval/runs/stream` SSE endpoint reusing the event feed's
      proxy-safe SSE setup; emits state changes, tail lines, and final verdict
- [x] 2.6 Kill the child process tree on service disposal so a harness shutdown
      never orphans a running eval

## 3. Frontend: Tests tab E2E section

- [x] 3.1 E2E eval section in `TestInventoryView.jsx`: scenario rows (goal,
      queue, run-all) with cost copy (turns + minutes) and Start buttons;
      confirm step restating the cost before POSTing
- [x] 3.2 Preflight banner: render `GET /api/loopeval/preflight` results as
      actionable instructions (gate → host GUI, kill switch → Autopilot
      console, leftover repo → remove card); block Start while unmet
- [x] 3.3 Active-run view: state, live tail (SSE), Stop button; on completion
      render per-assertion pass/fail and overall verdict; disable all Start
      buttons while any run is active
- [x] 3.4 Register the section as `'advanced'` in
      `client/src/context/UiModeContext.jsx`

## 4. Verification

- [x] 4.1 Backend unit tests: single-run conflict (409), state derivation from
      captured runner output fixtures, session revocation on each terminal
      state, stale-session sweep
      (tests/ClaudeWeb.Tests/LoopEvalRunnerTests.cs — 58/58 green)
- [x] 4.2 Token path check without spending agent turns: spawn a live-mode
      scenario with a bad token against a disposable instance → credential
      verdict; with a minted token → preflight passes (stop before arming via
      the existing preflight-only failure, e.g. kill switch off)
      (.claudeweb-preview/playwright/verify-loopeval-token.mjs — 6/6 checks)
- [x] 4.3 Isolated regression: `node tests/loop-eval/run-all.mjs` (default mode)
      still green — suite changes are additive (2026-08-01: PASS goal 8/8 +
      PASS queue 13/13, exit 0)
- [x] 4.4 Browser test (per `docs/claude-web/browser-testing.md`): Tests tab
      shows the E2E section in Advanced mode, hides it in Basic; preflight
      instructions render when the kill switch is off; Start → confirm → 409
      path exercised against a stub run
      (.claudeweb-preview/playwright/verify-loopeval-ui.mjs — 15/15 checks)
- [x] 4.5 End-to-end acceptance on live (operator-run): click Start on goal in
      the live Tests tab, watch dock + loop card, verdict renders; confirm
      fixture cleanup (no `loopeval-*-live` card left)
      (2026-08-01: deployed via swap.ps1, user verified on live and said
      "keep it" — rollback disarmed)
- [x] 4.6 `openspec validate --strict` green
