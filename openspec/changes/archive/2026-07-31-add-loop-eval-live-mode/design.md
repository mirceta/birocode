## Context

`tests/loop-eval/` (openspec: add-loop-eval-suite) runs two real-agent scenarios —
goal and queue — against an isolated ClaudeWeb instance: `lib.mjs` builds, provisions
a scratch root, seeds `autopilot-gate.json` + `autopilot.json` pre-boot, boots on
:5210, drives the shipped API, asserts, tears down. The scenario files are already
thin compositions over `lib.mjs`, which is what makes a second mode cheap: almost
everything mode-specific already lives in the lib.

The user wants the same scenarios runnable against the LIVE :5099 harness so a human
can watch the run happen in the real UI (fixture repo card, agent dock turns,
Autopilot console loop card), while the isolated mode stays the fully-automatic
agent-facing gate.

Constraints inherited from the baseline spec and the codebase:

- The autopilot gate is host-only by design (`AutopilotGate.cs`) — no enable
  endpoint, ever. The isolated mode's file-seeding trick is only legitimate because
  that instance's datadir is scratch. Live mode gets no such trick.
- The live store is the operator's real `repositories.json` / `loops.json` /
  `autopilot-audit.jsonl`. Anything live mode adds must be clearly named, invisible
  to Basic mode, and removed by default.
- The live harness may already be running loops on other repos; the eval must
  neither disturb them nor mis-read them.

## Goals / Non-Goals

**Goals:**

- One suite, two run modes; scenario assertions identical in both.
- Live mode observable end-to-end in the live UI while it runs.
- Live mode safe-by-default: fail-fast preflights, no global-config writes,
  cleanup unless explicitly kept.
- Isolated mode behavior unchanged (it stays the default; no flag → today's run).

**Non-Goals:**

- No server/C# changes, no new endpoints, no remote gate-enable path (explicitly
  re-affirmed — this change must not weaken that boundary).
- No UI "run eval" button. Launching stays a deliberate CLI act in both modes
  (real tokens); the Tests tab documents, never executes.
- No CI integration, unchanged from the baseline.
- Not a general "point the suite at any host" feature — live mode targets this
  box's own live harness (`http://localhost:5099` default) only.

## Decisions

**D1 — Mode is a lib-level strategy, scenarios stay mode-agnostic.**
`lib.mjs` reads `--live` / `LOOPEVAL_LIVE=1` once into `CFG.live` and keeps the
existing exported surface (`buildOnce`, `provision`, `boot`, `login`, `down`,
`readAudit`, sent-texts source, …) working in both modes — each export branches
internally. `goal.mjs` / `queue.mjs` change only where unavoidable (they already
call the lib for everything mode-specific). Alternative — separate `goal-live.mjs`
twins — rejected: duplicated assertions drift, and the baseline spec's value is
that the SAME checks pass in both worlds.

**D2 — Live mode never provisions a harness; it preflights one.**
In live mode `buildOnce`/`boot` are no-ops and `provision` shrinks to: health-check
`http://localhost:5099` (port via `LOOPEVAL_LIVE_PORT`), materialize the fixture
template into a scratch dir (`%TMP%/cw-loopeval-live/fixture-repo`, git init +
initial commit — same recipe as today), and run preflights AFTER login:

1. gate open? — `GET /api/autopilot/loops` → `gateOpen` (ungated field);
2. kill switch on? — `GET /api/autopilot/loops/{repoId}/debug` →
   `killSwitchEnabled` (session-auth, not operator-gated);
3. no name collision — no live repo already named like the fixture (a leaked
   previous run) and nothing already answering the scenario's assertions.

A failed preflight prints WHAT to click (host GUI gate toggle / Autopilot console
kill switch) and exits as a failed verdict. Alternative — auto-enable the kill
switch via `POST /api/autopilot/config` and restore after — rejected: mutating the
operator's global autopilot config from a test script is exactly the class of
surprise the gate design exists to prevent, and the human this mode serves is
already looking at the UI where the toggle lives.

**D3 — Auth: password from `LOOPEVAL_LIVE_PW`, required, never defaulted.**
The isolated mode invents its own password; live mode must be handed the real one
explicitly. No fallback to `changeme`, no reading `auth.json` off disk — if the env
var is absent the run aborts before touching the network. Rationale: reading the
live secret store from a test script normalizes a bad pattern; the operator typing
their own password into their own shell is the correct trust shape.

**D4 — Diagnostics via the shipped debug bundle, not the live datadir.**
Isolated mode greps its scratch datadir (`loops.json`, `autopilot-audit.jsonl`).
Live mode reads the same facts through `GET /api/autopilot/loops/{repoId}/debug`:
`loop.queueSentTexts` (queue order assert), the per-repo `audit` slice (goal's
loop-attribution assert), `killSwitchEnabled` (preflight). The bundle exists
precisely to expose one loop's durable record over HTTP (openspec:
add-loop-debug-handoff); using it keeps live mode read-only toward the live
datadir and immune to store-path drift. The audit slice caps at 10 entries — ample
for the goal scenario's 2–4 sends; the queue scenario never asserted on audit and
still doesn't. Artifact/goal-check asserts run directly against the scratch
fixture dir exactly as today (same box, plain filesystem).

**D5 — Live cleanup = unregister + close tab + remove scratch; `LOOPEVAL_KEEP=1`
skips it and prints manual steps.**
Default teardown: stop the loop if still active (`action: stop`), `DELETE
/api/dock/{tabId}`, `DELETE /api/repos/{repoId}` (drops the registry entry, never
touches disk), remove the scratch dir. With `LOOPEVAL_KEEP=1` everything stays —
repo card, dock tab, transcript — so the human can poke at the aftermath in the UI;
the script prints the three manual cleanup actions. Fixture repos are named
`loopeval-goal-live` / `loopeval-queue-live` and registered `Visibility: 'advanced'`
so a kept repo never appears to the Basic-mode End User. Teardown failures warn and
name the leftover, never mask the scenario verdict.

**D6 — Human pacing: watch-phase banner, unchanged deadlines.**
Live mode prints a prominent "watch it at http://localhost:5099 → open
<repo name> → agent dock / Autopilot console" banner right after arming, and keeps
the same 5s poll cadence (the console output doubles as a narration track).
Deadlines/iteration caps stay identical to isolated mode — live mode proves the
same contract, just visibly. Alternative — slowing ticks or adding pauses "for
watchability" — rejected: it would make live mode test a different engine rhythm
than the one shipped.

**D7 — Docs: README two-mode section, Tests-tab copy, Understanding app.**
`README.md` gains a "Two run modes" section (when to use which, live-mode
prerequisites and knobs). The Autopilot console Tests tab's "E2E eval" subtab copy
gains the same distinction (documentation only — still no backend call, per the
autopilot-explainer spec). The Understanding app is refreshed to visualize the
two-mode architecture (per the repo's Understanding-app convention).

## Risks / Trade-offs

- [Live run leaves residue if the script is killed mid-run (Ctrl-C)] → cleanup runs
  in `finally` for normal failures; for hard kills the preflight collision check of
  the NEXT run detects the leaked `loopeval-*-live` repo and prints the removal
  steps rather than silently stacking duplicates.
- [Live box is doing other work — a busy run slot or an armed loop on another repo]
  → the eval only touches its own fresh repoId; arming is per-repo (exclusive slot
  per agent, not global), and `/api/runs` polling is repo-scoped. Other repos'
  loops are never listed as part of any assert.
- [Same box, one `claude` CLI — a live-mode run and an isolated run simultaneously
  would contend] → README states the modes are mutually exclusive in time; the
  live preflight already refuses when its fixture repo name exists.
- [Operator password lands in shell history via env var] → documented; the var can
  be set for one invocation (`LOOPEVAL_LIVE_PW=... node ...`) and is never echoed
  or written by the suite.
- [Tests-tab copy drifts from reality] → the copy cites `tests/loop-eval/README.md`
  as the source of truth and stays short; the README carries the detail.

## Migration Plan

Pure addition to test tooling + doc copy; no data migration, no deploy coupling.
The client copy change ships with the next normal deploy; live mode itself works
against the CURRENT live build (all endpoints already shipped). Rollback = revert
the branch.

## Open Questions

(none)
