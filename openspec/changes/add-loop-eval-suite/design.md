# Design — add-loop-eval-suite

## Context

The loop engine (`ClaudeWeb.App/Services/Autopilot/AutopilotService.cs`, ticking every
10s over `ILoop` kinds) has three coverage layers today (see the autopilot Tests tab):
xUnit facts on the pure `DrivenLoop.Decide` ladder, runnable browser tests on the UI,
and a one-off untracked rehearsal (`.claudeweb-preview/rehearsal.mjs`) that drove the
real engine + real Claude turns over a scratch repo once, by hand. Nothing repeatable
proves the property that actually matters: the loop drives a real agent to the goal.

Two committed precedents supply nearly all the machinery:

- `tests/chat-systest/hub/instance.mjs` — full isolated-instance lifecycle: build,
  copy binaries **outside the repo tree** (so `FindRepoRoot` won't auto-pin this repo),
  git-init a scratch repo, spawn the exe with `CLAUDEWEB_DATADIR` / `CLAUDEWEB_Port` /
  `CLAUDEWEB_AuthPassword`, log in, `POST /api/repos` to register, `taskkill /T /F` down.
- `tests/discovery-eval/` — fixture + ground-truth + scoring + `--json` verdicts +
  assert-threshold exit code, driving the *shipped* production path, never a reimplementation.

Constraints that shape the design:

- The autopilot gate is host-only by design (`AutopilotGate.cs`: "Do not add a
  POST/enable endpoint. Ever."). The eval must not weaken that.
- The queue loop's queue is the bound dock tab's live stash (`dock.json`), not a field
  on the loop — a queue scenario must produce a real dock tab with stash items.
- Driven loops read the trailing assistant message from the pinned session; a fresh
  repo has no session, so each scenario must seed one turn via `POST /api/chat` first
  (the rehearsal script learned this).
- Runs cost real tokens and minutes; loop cadence is a fixed 10s tick.

## Goals / Non-Goals

**Goals:**

- A committed, repeatable, on-demand eval suite that runs the REAL engine + REAL
  Claude turns over committed fixture repos and asserts outcomes mechanically.
- Scenario 1 (goal loop): missing feature + failing goal check → `done · verified`,
  goal check passes afterwards, iterations under cap.
- Scenario 2 (queue loop): 6 stashed prompts → `done · drained`, `queueSent == 6`,
  each prompt's expected artifact present/correct.
- Machine-readable verdicts (per-assertion pass/fail, summary JSON, exit code) so a
  human or an agent can read the result without eyeballing logs.
- Full isolation: never touches the live :5099 instance, live data dir, or this repo's
  own registration.

**Non-Goals:**

- Not CI, not a button in the app (running it spawns a second harness and spends real
  tokens; the Tests tab documents it, CLI launches it).
- Not a replacement for the planned fake-runner engine-seam tests (cheap orchestration
  regression) — this is the complementary expensive layer.
- No engine/API changes, no new endpoints, no gate-flipping endpoint.
- Not statistical (no N-run recall aggregation like discovery-eval); one run per
  scenario with hard assertions is the v1 shape.
- Mid-run operator-stop / resume paths stay covered by unit tests (they were rehearsed
  once in tick 5.5); v1 asserts the happy paths end-to-end.

## Decisions

1. **Drive the shipped surface only.** The runner talks to the isolated instance the
   way an operator + phone user would: `POST /api/auth/login`, `POST /api/repos`,
   `POST /api/chat` (seed session), `POST /api/autopilot/loop` (arm), `POST
   /api/autopilot/config` (kill switch), poll `GET /api/autopilot/loops` +
   `GET /api/runs`. Alternative — invoking `AutopilotService` in-process from xUnit —
   rejected: 15 concrete constructor deps, and it would test a wiring the product
   doesn't ship. (That path belongs to the engine-seam plan.)

2. **Gate via seeded data dir, not an endpoint.** Before boot, the runner writes
   `autopilot-gate.json` (`enabled:true`) and `autopilot.json` (kill switch on,
   auto-advance on) into the fresh `CLAUDEWEB_DATADIR`. This is the same trust
   boundary as the operator clicking the host GUI — a host-side file write. The
   host-only rule survives intact.

3. **Fixture repos are committed as templates, materialized per run.** Fixtures live
   under `tests/loop-eval/fixtures/<scenario>/repo-template/` and are copied to a
   temp dir + `git init` + initial commit for each run (agents may commit; runs must
   not dirty the template). `expected/` beside the template holds the ground truth:
   for the goal scenario a `goal-check.mjs` (node script exit 0/1 — same check the
   goal prompt tells the agent about); for the queue scenario a per-prompt list of
   expected artifacts (file exists / content regex). Alternative — pointing at an
   external scratch repo like `qloop-lab` — rejected: not committed, not repeatable.

4. **Queue seeding via `dock.json` in the seeded data dir.** The 6 prompts are written
   as a dock tab's stash items in the pre-boot `dock.json` (the rehearsal proved the
   engine consumes exactly this shape); the arm call binds `tabId` to that tab.
   Alternative — driving the dock UI/API to stash items — more moving parts for no
   extra signal; the suite is about the loop engine, not the dock.

5. **Fixture product = tiny node scripts, no build step.** The goal fixture is a
   ~3-file node mini-app with an obvious missing feature and `node goal-check.mjs`
   failing; queue prompts ask for small, mechanically checkable edits ("create
   `notes/step-3.md` containing DONE-3"-grade, but phrased as real work). Keeps
   agent turns short, assertions crisp, and avoids .NET/npm toolchain time inside
   agent turns.

6. **Runner layout mirrors chat-systest, scoring mirrors discovery-eval.**
   `tests/loop-eval/lib.mjs` (adapted instance lifecycle + polling + `@@LOOPEVAL@@`
   machine-readable event lines), `goal.mjs`, `queue.mjs`, `run-all.mjs`, `README.md`.
   Each scenario emits per-assertion verdicts and a summary JSON (`--json <out>`),
   exit code 0 only if all assertions pass. Errored/timed-out runs are failures with
   the harness log tail attached.

7. **Timeouts generous, bounded.** 10s tick + real turns ⇒ goal scenario budget
   ~15 min, queue ~20 min, per-poll cadence 5s (rehearsal values). A timeout is a
   FAIL verdict (`timeout` reason), never a hang: the runner always tears the
   instance down (`taskkill /T /F`) in `finally`.

## Risks / Trade-offs

- [Agent nondeterminism → flaky verdicts] → prompts ask for mechanically checkable
  artifacts; assertions test outcomes (files, tokens, loop status), never transcript
  wording; deny lists kept minimal so escalation stops are real signal, not noise.
  A failed run's verdict JSON names the exact assertion + `loops.json` record +
  audit lines so diagnosis doesn't require re-running.
- [Cost creep if run casually] → README + Tests tab copy state cost up front
  (≈8–10 real turns, ~$ and ~30 min for `run-all`); scenarios runnable individually.
- [Isolated instance collides with live or another preview] → dedicated port
  (default 5210, overridable), fresh temp data dir per run, binaries copied outside
  the repo tree — all inherited from the chat-systest hub pattern.
- [Fixture drift: goal check passes before the agent runs] → each scenario's first
  step asserts the precondition (goal check FAILS on the fresh fixture; queue
  artifacts ABSENT) before arming — a fixture regression fails fast and cheap,
  before any tokens are spent.
- [`claude` CLI availability/model config differs per machine] → precondition probe
  in `lib.mjs` (the seeded `POST /api/chat` turn) — if that turn errors, the suite
  aborts with a clear "CLI not working here" verdict instead of burning the scenarios.

## Migration Plan

Additive only: new `tests/loop-eval/` tree + copy edits in `TestInventoryView.jsx`.
No deploy coupling; nothing to roll back beyond reverting the commit. The untracked
`.claudeweb-preview/rehearsal.mjs` stays as historical scratch (superseded by
`queue.mjs`).

## Open Questions

- Model pinning for eval turns (cheapest capable model vs. whatever the box defaults
  to) — v1 uses the instance default; revisit if verdicts prove model-sensitive.
- Whether scenario 2 should later re-add the mid-run operator-stop + resume leg as an
  opt-in flag (`--with-stop`) once the happy path is stable.
