# loop-eval — real-agent eval suite for the autopilot loop engine

This suite answers the one question no cheap test can: **does the loop engine
actually drive a real agent to the goal?** It registers a committed fixture
repo, arms a REAL loop, lets REAL Claude turns run, and asserts the outcome
mechanically.

It is the tracked, repeatable successor of the one-off rehearsal layer
(`.claudeweb-preview/rehearsal.mjs`, openspec: advance-queue-loop tick 5.5).

## Two run modes (openspec: add-loop-eval-live-mode)

Same scenarios, same assertions — two places to run them:

| | **Isolated (default)** | **Live (`--live`)** |
|---|---|---|
| Target | throwaway instance it boots on :5210 | your RUNNING live harness on :5099 |
| For | agents / automation — a fully automatic before-shipping gate | the human operator — watch the run happen in the real UI |
| Gate & kill switch | seeded into the scratch datadir pre-boot | must ALREADY be on; the suite fails fast with instructions, never enables them itself |
| Auth | its own throwaway password | exactly ONE of `LOOPEVAL_LIVE_PW=<live operator password>` (terminal runs) or `LOOPEVAL_LIVE_TOKEN` (harness-minted, Tests-tab runs only) — required, never defaulted, no fallback between them |
| Fixture repo | scratch copy, registered in the scratch store | scratch copy, registered in the LIVE store as `loopeval-goal-live` / `loopeval-queue-live` / `loopeval-briefing-live` (advanced visibility — invisible to Basic mode) |
| Diagnostics | reads the scratch datadir's files | reads `GET /api/autopilot/loops/{repoId}/debug` (never the live datadir) |
| Teardown | kills the instance, removes the scratch root | stops the loop, closes the dock tab, unregisters the repo, removes the scratch copy — `LOOPEVAL_KEEP=1` keeps it all for inspection and prints the manual steps |

Right after arming, live mode prints a **watch banner**: open the live UI,
open the fixture repo, and follow the agent dock + the Autopilot console loop
card while the run executes.

**Live prerequisites**: live harness up on :5099; operator gate ON (host GUI);
kill switch ON (Autopilot console); `LOOPEVAL_LIVE_PW` set. A leftover
`loopeval-*-live` repo from a crashed run blocks the preflight — remove its
card, then rerun.

**Don't run both modes at once** — they share this box's one `claude` CLI and
would contend for it (and confuse whoever is watching).

**Or skip the terminal entirely** (openspec: add-loop-eval-ui-runner): the
Autopilot console's **Tests tab → E2E eval section** has a Start button for
each atomic scenario (goal, queue, briefing — `run-all.mjs` stays terminal-only,
openspec: loop-eval-tests-tab-declutter). The harness spawns these same scripts in `--live` mode against
itself, authenticated with a one-shot session token it mints for the child
process (`LOOPEVAL_LIVE_TOKEN`) — no password typing, same preflights, same
assertions, run status and verdict streamed back into the tab.

## Cost — read before running

Runs spend **real Claude tokens and real minutes**. This is deliberate
(an eval that can't see agent behavior proves nothing) but means:

- **never CI** — on-demand only, as a before-shipping gate for engine changes
- goal scenario: typically 2–4 agent turns, ~5–15 min
- queue scenario: typically 12 agent turns (6 steps + 6 verifies), ~15–25 min
- briefing scenario: typically 2–4 agent turns, ~5–15 min

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
node tests/loop-eval/goal.mjs     [--json out.json]  # goal loop: implement a feature for real
node tests/loop-eval/queue.mjs    [--json out.json]  # queue loop: drain 6 prompts correctly
node tests/loop-eval/briefing.mjs [--json out.json]  # briefing rule: steer a real driven agent
node tests/loop-eval/run-all.mjs  [--json out.json]  # all of them, combined verdict

# live mode — watch it in the real UI (set LOOPEVAL_LIVE_PW first):
node tests/loop-eval/goal.mjs     --live
node tests/loop-eval/queue.mjs    --live
node tests/loop-eval/briefing.mjs --live
node tests/loop-eval/run-all.mjs  --live
```

Exit code 0 only if every assertion passed. Progress prints one status line
per 5s poll; machine-readable verdicts are `@@LOOPEVAL@@ {json}` lines.

### `--describe` — self-description, no run

Every scenario also answers `--describe` (openspec:
loop-eval-scenario-transparency): it prints a JSON manifest — the loop
parameters it would arm, the fixture it acts on, the expected-outcome list —
built from the same constants the run uses, then exits 0 with **no build, no
provisioning, no network, no token spend**. The harness's Tests tab serves
this to the operator. `run-all.mjs --describe` composes the two child
manifests.

When touching a scenario, keep it honest: run every `--describe` (goal, queue,
briefing, run-all — each must exit 0 in well under a second and parse as JSON),
and if you changed the assertion ladder, update the adjacent `EXPECTED_OUTCOME`
list in the same commit.

Environment knobs:

| Var | Default | Meaning |
|-----|---------|---------|
| `LOOPEVAL_PORT` | `5210` | isolated instance port |
| `LOOPEVAL_ROOT` | `%TMP%/cw-loopeval` | isolated scratch root (bin copy, datadir, fixture repo) |
| `LOOPEVAL_KEEP` | off | `1` = leave everything up after a run (isolated: instance + scratch; live: repo card, dock tab, scratch) |
| `LOOPEVAL_SKIP_BUILD` | off | `1` = reuse the existing `.claudeweb-preview/bin` build (isolated only) |
| `LOOPEVAL_GOAL_MINUTES` / `LOOPEVAL_QUEUE_MINUTES` / `LOOPEVAL_BRIEFING_MINUTES` | 15 / 25 / 15 | scenario deadlines |
| `LOOPEVAL_LIVE` | off | `1` = live mode (same as `--live`) |
| `LOOPEVAL_LIVE_PORT` | `5099` | live harness port |
| `LOOPEVAL_LIVE_PW` | — | live operator password — required in live mode (unless the harness set `LOOPEVAL_LIVE_TOKEN`), never defaulted or read off disk. Set it per-invocation to keep it out of files: `LOOPEVAL_LIVE_PW=... node ...` |
| `LOOPEVAL_LIVE_TOKEN` | — | one-shot session token, **set by the harness UI runner — not for manual use**. Installed directly as the session cookie (no login call); revoked by the harness when the run ends. Mutually exclusive with `LOOPEVAL_LIVE_PW` — setting both is an error, there is no fallback |
| `LOOPEVAL_LIVE_ROOT` | `%TMP%/cw-loopeval-live` | live-mode fixture scratch dir |

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

**briefing.mjs** — fixture `fixtures/briefing/repo-template/`: a one-file task
repo (create `GREETING.md`; `task-check.mjs` is the goal's ground truth). The
scenario injects ONE briefing rule through the shipped
`PUT /api/autopilot/briefing` editor surface instructing a side effect the
goal, fixture, and check never mention (`BRIEFING-ACK.md` with an exact first
line), then arms a real goal loop. Passes only if the loop resolves
`done · verified`, the task check exits 0, **the ack marker exists** (its only
possible source is the rule — the proof the rule steered the agent), and every
send is audit-stamped `briefed` at the recorded rules revision. The briefing
store is GLOBAL: the rule's own text scopes it to repositories containing
`LOOPEVAL-BRIEFING-FIXTURE.txt`, and teardown removes exactly the injected
rule by id (never a snapshot restore), so a live box's operator edits — and
its other agents — are left alone. `LOOPEVAL_KEEP=1` leaves the rule in place
and prints the manual removal step.

Every scenario first asserts its **precondition** (goal/task check fails /
artifacts absent on the fresh fixture) and runs a **CLI probe** (one cheap
seeded chat turn) — fixture drift or a broken `claude` CLI fails fast, before
the loop spends tokens.

## How live mode works

Live mode (`--live`) points the same scenario code at the running :5099
harness. Nothing is booted, seeded, or killed; the live data dir is never
written (loop internals are read over the shipped
`/api/autopilot/loops/{repoId}/debug` bundle). The fixture is still a scratch
copy under `%TMP%/cw-loopeval-live` — the suite registers it in the live
store (registry entry only), runs, then unregisters it. The autopilot gate
stays host-only here too: live mode CHECKS `gateOpen` and
`killSwitchEnabled` and tells the operator what to click when they're off —
there is no enable path, by design.

## How isolation works (default mode)

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
  instance's log tail and the final `loops.json` (live mode: the repo's debug
  bundle); the failed assertion names the exact expectation. Re-run with
  `LOOPEVAL_KEEP=1` to poke at the scratch root and datadir afterwards.
- **Live preflight fails** — the verdict says exactly what to do: gate →
  host GUI toggle, kill switch → Autopilot console, leftover
  `loopeval-*-live` repo → remove its card (or `DELETE /api/repos/{id}`).
- **Live login fails** — `LOOPEVAL_LIVE_PW` missing or wrong; it must be the
  live operator password (the one the web UI asks for).
