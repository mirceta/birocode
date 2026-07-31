# loop-eval — real-agent eval suite for the autopilot loop engine

This suite answers the one question no cheap test can: **does the loop engine
actually drive a real agent to the goal?** It boots an isolated ClaudeWeb
instance, registers a committed fixture repo, arms a REAL loop, lets REAL
Claude turns run, and asserts the outcome mechanically.

It is the tracked, repeatable successor of the one-off rehearsal layer
(`.claudeweb-preview/rehearsal.mjs`, openspec: advance-queue-loop tick 5.5).

## Cost — read before running

Runs spend **real Claude tokens and real minutes**. This is deliberate
(an eval that can't see agent behavior proves nothing) but means:

- **never CI** — on-demand only, as a before-shipping gate for engine changes
- goal scenario: typically 2–4 agent turns, ~5–15 min
- queue scenario: typically 12 agent turns (6 steps + 6 verifies), ~15–25 min

### Measured runs (2026-07-31, first green sweep)

| Scenario | Run 1 | Run 2 | Duration/run | Agent turns |
|----------|-------|-------|--------------|-------------|
| goal | PASS 8/8 | PASS 8/8 | ~1 min (build cached; add ~1–2 min for a cold `dotnet build`) | 2 (work + verify) |
| queue | PASS\* 13/13 | PASS 13/13 | ~7–10 min | 12 (6 steps + 6 verifies) |

\* run 1 recorded 12/13 because the *eval harness* substring-searched
`loops.json` for prompt texts that System.Text.Json stores with unicode
escapes for backticks and quotes; the engine itself did everything right.
The fixed assert (parse
`QueueSentTexts`, compare element-wise) validates green against run 1's
captured diagnostics.

Dollar cost: the harness run log reports `cost $0` per agent run on this box
(subscription-authenticated CLI, no per-token billing). Budget in wall-clock
minutes and plan-usage instead: a full `run-all` sweep ≈ 14 real agent turns,
~10–15 min.

## Running

```
node tests/loop-eval/goal.mjs   [--json out.json]   # goal loop: implement a feature for real
node tests/loop-eval/queue.mjs  [--json out.json]   # queue loop: drain 6 prompts correctly
node tests/loop-eval/run-all.mjs [--json out.json]  # both, combined verdict
```

Exit code 0 only if every assertion passed. Progress prints one status line
per 5s poll; machine-readable verdicts are `@@LOOPEVAL@@ {json}` lines.

Environment knobs:

| Var | Default | Meaning |
|-----|---------|---------|
| `LOOPEVAL_PORT` | `5210` | isolated instance port |
| `LOOPEVAL_ROOT` | `%TMP%/cw-loopeval` | scratch root (bin copy, datadir, fixture repo) |
| `LOOPEVAL_KEEP` | off | `1` = leave the instance + scratch up after a run, for debugging |
| `LOOPEVAL_SKIP_BUILD` | off | `1` = reuse the existing `.claudeweb-preview/bin` build |
| `LOOPEVAL_GOAL_MINUTES` / `LOOPEVAL_QUEUE_MINUTES` | 15 / 25 | scenario deadlines |

## What each scenario proves

**goal.mjs** — fixture `fixtures/goal/repo-template/`: a todo CLI whose `done`
command is missing; `goal-check.mjs` fails. Passes only if the loop resolves
`done · verified` (work → `LOOP_DONE` → verify → `GOAL_VERIFIED`), the goal
check exits 0 afterwards, iterations stayed ≤ 6, and every send was
loop-attributed in the audit log.

**queue.mjs** — fixture `fixtures/queue/repo-template/` plus the six prompts in
`fixtures/queue/expected.json` (each mapped to an artifact path + regex).
Passes only if the loop resolves `done · drained` with `queueSent == 6`, the
sent texts appear in arm order, and every artifact exists and matches.

Both scenarios first assert their **precondition** (goal check fails / artifacts
absent on the fresh fixture) and run a **CLI probe** (one cheap seeded chat
turn) — fixture drift or a broken `claude` CLI fails fast, before the loop
spends tokens.

## How isolation works

Same pattern as `tests/chat-systest/hub/instance.mjs`: build to
`.claudeweb-preview/bin`, copy the binaries OUTSIDE the repo tree (no `.sln`
above them, so the instance does not auto-pin this repo), launch with
`CLAUDEWEB_DATADIR`/`CLAUDEWEB_Port`/`CLAUDEWEB_AuthPassword` pointing at a
fresh scratch root. The live :5099 instance and its store are never touched.
Teardown (`taskkill /T /F` + scratch removal) runs in `finally`, and a timeout
is a FAIL verdict, never a hang.

The autopilot gate stays host-only: the suite writes `autopilot-gate.json` +
`autopilot.json` (kill switch on) into the isolated data dir **before boot** —
a host-side file write, the same trust boundary as the operator's GUI click.
Everything after boot goes through the shipped API surface exactly as an
operator + phone user would (`/api/repos`, `/api/dock`, `/api/chat`,
`/api/autopilot/loop`, `/api/autopilot/loops`).

## Troubleshooting

- **"something already answers on :5210"** — a previous run leaked
  (`LOOPEVAL_KEEP=1`?). Kill it: `taskkill /IM ClaudeWeb.exe /F` (check it is
  not your live instance first) or set `LOOPEVAL_PORT`.
- **CLI probe fails** — the `claude` CLI can't complete a turn on this box;
  fix that first (run `claude -p "say hi"` by hand).
- **A scenario fails** — the summary JSON's `diagnostics` carries the
  instance's log tail and the final `loops.json`; the failed assertion names
  the exact expectation. Re-run with `LOOPEVAL_KEEP=1` to poke at the scratch
  root and datadir afterwards.
