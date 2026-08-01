# Design: add-loop-eval-ui-runner

## Context

`add-loop-eval-live-mode` shipped a live mode for the loop-eval suite: the same
scenarios (goal, queue) run against the operator's live :5099 harness, watchable
in the real UI, authenticated with `LOOPEVAL_LIVE_PW` supplied per-invocation.
The trigger is a terminal command; the Operator wants a button. The Autopilot
console already has a Tests tab (`TestInventoryView.jsx`, capability
`autopilot-explainer`) that inventories the test layers, including a row for
this suite with copy that says "run from a terminal."

Constraints inherited from the live-mode design and repo conventions:

- The suite drives only the shipped operator surface; there is **no remote
  gate-enable path** — gate and kill switch are host-owned toggles.
- The live password is never defaulted, never read off disk by the suite.
- One `claude` CLI per box — concurrent eval runs contend and confuse the watcher.
- New backend surface follows `plans/INTEGRATION.md` (attribute-routed
  controller + per-module service extension); new UI defaults to Advanced mode.
- Runs cost real agent turns (~1–10 min goal, ~7–25 min queue) — a button makes
  spending that trivially easy, so the UI must say so before starting.

## Goals / Non-Goals

**Goals:**

- Start any live-mode scenario (goal, queue, run-all) from the Tests tab and
  watch it: run status in the Tests tab, the actual conversation in the fixture
  repo's agent dock, the loop card in the Autopilot console.
- Zero password handling in the browser or on disk: the harness authenticates
  its own spawned runner with a one-shot internal credential.
- Preconditions surfaced as actionable UI errors, never auto-fixed.
- Exactly one run at a time, with a visible "a run is active" state.

**Non-Goals:**

- No isolated-mode-from-UI (that mode boots a second instance and is the
  automation path; terminal is fine for it).
- No scheduling, history persistence, or run archive beyond the last run's
  result held in memory (a later change can add history if wanted).
- No changes to scenario logic, fixtures, or assertions.
- No Basic-mode exposure.

## Decisions

### D1 — The harness spawns the existing Node scripts; no reimplementation

The backend runs `node tests/loop-eval/<scenario>.mjs --live` as a child process
from the harness repo checkout, exactly what the operator would type. The
scenario scripts, fixtures, and assertions stay the single source of truth; the
UI is a front-end to the same runner. Alternative — porting the orchestration
into C# — was rejected: two implementations of one eval would drift, and the
suite is already built to be driven headlessly and report machine-readable
verdicts.

Consequence: the feature only works when the opened live harness runs a checkout
that has `tests/loop-eval/` (Self-Development case: repo = harness repo). The
run endpoint resolves the suite path from the registered repo that matches the
harness's own repo root and returns a clear error if absent.

### D2 — Auth: mint a real session server-side, pass it as `LOOPEVAL_LIVE_TOKEN`

`PasswordAuthMiddleware` already authorizes the `claudeweb_session` cookie
backed by a server-side session store. The eval-runner service mints a session
directly in that store (tagged `loopeval-runner`, no password involved), hands
the session id to the child via the `LOOPEVAL_LIVE_TOKEN` env var, and revokes
it when the run process exits (success, failure, or kill). `lib.mjs` learns:
if `LOOPEVAL_LIVE_TOKEN` is set, install it as the session cookie and skip
`POST /api/auth/login`; otherwise the `LOOPEVAL_LIVE_PW` path is unchanged.

Rejected alternatives: passing the operator password (the suite's own spec
forbids reading it off disk, and the harness only stores a PBKDF2 hash — it
*cannot* recover the password, which is the strongest version of the rule);
a new bypass header in the middleware (a second auth path to audit forever,
where a minted session reuses the existing lifecycle: same store, same
revocation, same middleware).

Trust boundary: minting happens in-process behind an already-authenticated
operator request; the token never touches disk or the browser — it crosses one
process boundary via env, same trust as the operator typing the password into
the same terminal.

### D3 — Run state is a singleton service with an SSE stream to the Tests tab

`LoopEvalRunnerService` (singleton) owns at most one active run:
`{scenario, state, startedAt, statusLines[], verdict}`. States:
`preflight → armed → running → passed | failed | error`, derived by parsing the
runner's stdout — the `@@LOOPEVAL@@ {json}` verdict lines (existing
machine-readable contract) plus the per-poll status lines for the live tail.
The Tests tab subscribes over an SSE endpoint (`GET /api/loopeval/runs/stream`,
same pattern as the existing event feed) and renders state, tail, and — on
completion — per-assertion results from the verdict JSON. `POST /api/loopeval/runs`
returns 409 while a run is active; a Stop button issues
`DELETE /api/loopeval/runs/current`, which kills the process tree and lets the
suite's own teardown/cleanup contract handle the fixture (the service re-checks
for a leftover `loopeval-*-live` repo afterwards and reports it).

### D4 — Preconditions are checked twice, enforced once

The Tests tab calls `GET /api/loopeval/preflight` when the E2E section renders,
so the operator sees gate/kill-switch/leftover-repo problems (with "what to
click, where" copy) *before* pressing Start. But the authoritative check stays
where it already lives — the suite's own live preflight — so the backend never
duplicates policy: it just relays a fail-fast verdict if the race is lost.
Neither layer enables anything; same no-enable-path stance as live mode.

### D5 — UI placement: an "E2E eval" section inside the existing Tests tab

Extend `TestInventoryView.jsx` (autopilot-explainer capability) rather than a
new tab: the inventory already describes this suite, so the Start buttons sit
on the row that explains them. The section shows per-scenario cost copy
(minutes + agent turns) next to each Start button, the live status/tail while
running, and the last verdict with per-assertion results. Gated `'advanced'` in
`UiModeContext.jsx`.

## Risks / Trade-offs

- [Runner outlives the harness if the harness crashes mid-run] → the child is
  killed on service disposal, and the spawn uses a job-object/process-tree kill
  (`taskkill /T` semantics) so scenario children (`node`, `claude`) die with it;
  a leftover `loopeval-*-live` repo is caught by the next preflight, which
  already names the manual cleanup.
- [Self-dev deploys swap the live binaries while a run is active] → the runner
  writes nothing under `run-bin`; the run would fail on harness restart and the
  Tests tab shows `error` with the tail. Documented, not prevented — deploying
  mid-eval is operator error the same way deploying mid-chat is.
- [Session minting is a privileged internal API] → it lives inside the runner
  service only (not a controller action), tagged sessions are revoked on run
  end and on service start (stale-run sweep), so an orphaned token dies with
  the next boot.
- [SSE through the phone's proxy path] → the event feed already proved SSE
  works through the harness's own serving path; reuse its headers/no-buffering
  setup verbatim.
- [Button makes an expensive run one tap] → cost copy on the button row plus a
  confirm step ("this spends ~N real agent minutes") before POSTing.

## Open Questions

- None blocking. History/persistence of past runs deliberately deferred.
