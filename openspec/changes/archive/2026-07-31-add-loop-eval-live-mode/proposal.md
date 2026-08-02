## Why

The loop-eval suite (openspec: add-loop-eval-suite) proves the loop engine drives a
real agent to the goal — but only inside a throwaway instance on :5210 that tears
itself down. That is perfect for an agent running the suite as an automated gate, and
useless for the human operator who wants to *see it work*: watch the agent dock fill
with real turns, watch the loop card tick through phases in the Autopilot console of
the harness they actually use. Trust in the loop engine currently requires reading
verdict JSON; it should also be earnable by watching.

## What Changes

- Add a second run mode — **live mode** — to the existing `tests/loop-eval/` suite:
  the same goal and queue scenarios, the same assertions, but targeting the LIVE
  :5099 harness so every agent turn and loop phase is observable in the real UI.
- Mode selection per run: `--live` flag (or `LOOPEVAL_LIVE=1`). The existing
  isolated :5210 mode stays the default and is byte-for-byte unaffected — it remains
  the fully-automatic mode an agent uses.
- Live mode never boots, seeds, or tears down a harness. It health-checks :5099,
  logs in with an operator-supplied password (`LOOPEVAL_LIVE_PW`), and **respects
  the host-only autopilot boundary**: if the operator gate or kill switch is off it
  fails fast with instructions to enable them in the host GUI / Autopilot console —
  it never writes gate files or flips global config itself.
- Live mode still materializes the fixture repo as a scratch copy (temp dir, own
  git init), registers it in the live store with `advanced` visibility, arms the
  loop through the same shipped endpoints, and asserts the same outcomes — reading
  loop internals (sent texts, audit slice, kill switch) through the existing
  `/api/autopilot/loops/{repoId}/debug` bundle instead of the isolated datadir's
  files.
- Live-mode cleanup unregisters the fixture repo and closes its dock tab by
  default; `LOOPEVAL_KEEP=1` leaves them in place for post-run inspection and
  prints the exact manual cleanup steps.
- Update the Autopilot console Tests tab's "E2E eval" subtab and
  `tests/loop-eval/README.md` to document both modes and when to use which.
- Update the Understanding app to visualize the two-mode architecture.

## Capabilities

### New Capabilities

(none — this extends the existing eval capability)

### Modified Capabilities

- `loop-eval`: the suite gains a second, operator-facing run mode. The isolation
  requirement ("never the live instance") is scoped to the default isolated mode;
  a new requirement defines live mode's contract: same scenarios and verdicts,
  observable in the live UI, gate/kill-switch respected (fail-fast, never
  self-enabled), scratch fixture only, cleanup by default.
- `autopilot-explainer`: the Tests tab's end-to-end subtab SHALL describe both run
  modes (automatic isolated gate vs. human-observable live run) rather than a
  single CLI launch shape.

## Impact

- `tests/loop-eval/lib.mjs` — mode switch, live target/login, live preflight
  (gate + kill switch + repo-collision checks), API-based diagnostics, live cleanup.
- `tests/loop-eval/goal.mjs`, `queue.mjs`, `run-all.mjs` — accept `--live`; scenario
  bodies stay mode-agnostic.
- `tests/loop-eval/README.md` — two-mode documentation.
- `client/src/components/autopilot/` Tests-tab E2E eval subtab copy.
- `understanding-app/` — refreshed companion visualization.
- No C# / server changes: every endpoint live mode needs already ships
  (`/api/repos` incl. DELETE, `/api/dock` incl. DELETE, `/api/chat`,
  `/api/autopilot/loop`, `/api/autopilot/loops`, `/api/autopilot/loops/{id}/debug`).
- Risk surface: live mode registers/removes a repo in the live store and spends
  real tokens on the live box — mitigated by advanced visibility, unique naming,
  default cleanup, and fail-fast preflights.
