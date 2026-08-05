# Loop eval

## Purpose

Gives the autopilot loop engine's most important property — a real agent, driven by the
real engine, actually reaches the goal — a repeatable, committed test. Unit tests cover
only the pure decision ladder and browser tests only the UI; this capability is the
end-to-end layer: an on-demand eval suite at `tests/loop-eval/` that boots an isolated
harness instance, runs scripted goal-loop and queue-loop scenarios against committed
fixture repositories with real agent turns, and scores the outcomes into machine-readable
verdicts. Runs spend real Claude tokens and minutes, so the suite is a before-shipping
gate launched from the CLI — never CI.
## Requirements
### Requirement: On-demand real-agent eval scenarios for the loop engine

The repo SHALL provide a committed, on-demand eval suite (`tests/loop-eval/`) that
exercises the REAL autopilot loop engine with REAL agent turns against committed
fixture repositories, and resolves each scenario to machine-readable per-assertion
verdicts (pass/fail, summary JSON, process exit code). The suite SHALL offer two run
modes with identical scenarios and assertions: the default **isolated mode** (a
throwaway instance, fully automatic) and an opt-in **live mode** (the operator's
running live harness, humanly observable). The suite SHALL drive only the shipped
operator surface (login, repo registration, chat seed, loop arm/config, loop
polling, loop debug bundle) — no engine bypass, no new endpoints, and no remote
gate-enable path: in isolated mode the autopilot gate and kill switch SHALL be
enabled solely by seeding their files into the isolated instance's data directory
before boot, and in live mode they SHALL NOT be enabled by the suite at all (see
the live-mode requirement). The suite SHALL be launched from the CLI only and SHALL
never run in CI.

#### Scenario: Goal loop implements a feature for real

- **WHEN** the goal scenario is run against the goal fixture (a mini-product with a
  deliberately missing feature whose goal check fails)
- **THEN** a harness instance is targeted per the selected run mode, the fixture is
  materialized and registered, a goal loop is armed in drive mode, real agent turns
  run, and the scenario passes only if the loop resolves `done · verified`, the
  fixture's goal check now exits 0, and iterations stayed at or under the
  configured cap

#### Scenario: Queue loop drains six prompts correctly

- **WHEN** the queue scenario is run against the queue fixture with six prepared
  prompts seeded as the bound dock tab's stash
- **THEN** the loop advances through all six in order, resolves `done · drained` with
  `queueSent` equal to 6, and the scenario passes only if every prompt's expected
  artifact in the fixture repo exists and matches its ground truth

#### Scenario: Preconditions guard against fixture drift and broken CLI

- **WHEN** a scenario starts and either the fixture's ground-truth precondition
  already holds (goal check passes untouched / queue artifacts already present) or
  the seeded chat turn errors
- **THEN** the scenario aborts as a failure with a verdict naming the precondition,
  before arming any loop or spending further agent turns

#### Scenario: Isolated-mode runs are isolated and always torn down

- **WHEN** any scenario runs in the default isolated mode and succeeds, fails, or
  times out
- **THEN** it used its own port, fresh temp data directory, and binaries copied
  outside the repo tree — never the live instance, live data dir, or the repo's own
  registration — and the isolated instance is killed in all outcomes, with a timeout
  reported as a failed verdict rather than a hang

### Requirement: Live-harness run mode for human observation

The suite SHALL support an opt-in live mode (`--live` flag or `LOOPEVAL_LIVE=1`)
that runs a scenario against the operator's already-running live harness so the run
is observable in the real UI (fixture repo card, agent dock turns, Autopilot console
loop card) while it happens. In live mode the suite SHALL NOT build, boot, seed, or
kill any harness instance and SHALL NOT write to the live data directory or mutate
global autopilot configuration — where the gate, kill switch, threshold, deny list,
and brain settings are configuration; the sole permitted global mutation is the
briefing scenario's rule injection, which SHALL go through the shipped briefing
editor surface, be scoped by its own text to the fixture, and be removed by id at
teardown per the briefing scenario requirement. Loop internals needed for
assertions SHALL be read
through the shipped per-loop debug bundle endpoint. Live authentication SHALL come
from exactly one of two explicit sources: the operator-supplied live password
(`LOOPEVAL_LIVE_PW`, used to log in) or a harness-minted one-shot session token
(`LOOPEVAL_LIVE_TOKEN`, installed directly as the session credential when the
harness itself spawns the run) — the suite SHALL NOT default either value, read
them from the live secret store or any file, or fall back from one to the other
implicitly; with neither set, live mode SHALL refuse to touch the network. The
fixture repository SHALL be a scratch copy outside the repo tree, registered under
a distinctive `loopeval-*-live` name with advanced visibility, and the suite SHALL
announce where to watch the run immediately after arming.

#### Scenario: Live preflights fail fast with operator instructions

- **WHEN** a live-mode scenario starts and the live harness is unreachable, the
  credential is missing or wrong (password or token), the operator gate is closed,
  the kill switch is off, or a `loopeval-*-live` repository from a previous run
  still exists
- **THEN** the scenario stops with a failed verdict naming the unmet precondition
  and, for gate/kill-switch, tells the operator exactly where in the host GUI or
  Autopilot console to enable it — the suite never enables either itself

#### Scenario: Live run is watchable and asserts the same contract

- **WHEN** a live-mode scenario arms its loop on the live harness
- **THEN** the script prints where to watch (live URL, fixture repo name), the run
  is visible in the live UI while agent turns execute, and the scenario applies the
  same assertions and deadlines as the isolated mode before reporting its verdict

#### Scenario: Live cleanup by default, keep on request

- **WHEN** a live-mode scenario finishes (pass or fail)
- **THEN** by default the suite stops the loop if still active, closes the fixture
  dock tab, unregisters the fixture repository (registry entry only — no disk
  deletion of anything outside its scratch dir), removes the scratch copy, and —
  for the briefing scenario — removes the injected rule by id;
  with `LOOPEVAL_KEEP=1` it instead leaves everything for inspection and prints the
  manual cleanup steps, and a cleanup failure is warned with the leftover named,
  never masking the scenario verdict

#### Scenario: Token-authenticated run skips login

- **WHEN** a live-mode scenario runs with `LOOPEVAL_LIVE_TOKEN` set
- **THEN** the suite installs the token as its session credential without calling
  the login endpoint, all subsequent API calls authorize through it, and an invalid
  or revoked token fails the preflight with a verdict naming the credential — the
  suite never retries with a password it does not have

### Requirement: Briefing steering eval scenario

The eval suite SHALL provide a briefing scenario (`tests/loop-eval/briefing.mjs`,
both run modes) that proves an operator-authored briefing rule actually steers a
real driven agent — not merely that the rule text composes into the send. The
scenario SHALL inject exactly one enabled rule through the shipped briefing
editor surface (`PUT /api/autopilot/briefing`); the rule's own text SHALL scope
it to repositories containing the fixture's marker file so that other agents on
a live box are told to ignore it. The rule SHALL instruct a side effect (an ack
file with an exact first line) that the fixture's goal, docs, and acceptance
check never mention, so the side effect has exactly one possible source. The
scenario SHALL assert, mechanically and before any agent turn, that the injected
rule appears in the composed work-phase preview returned by the briefing
surface; it SHALL then arm a real drive-mode goal loop and pass only if the loop
resolves `done · verified`, the fixture's own acceptance check passes, the
rule's ack file exists with the exact ack line, and every send is
audit-stamped as briefed at the rules revision recorded at injection. Teardown
SHALL remove exactly the injected rule by id — never restore a snapshot — so
concurrent operator edits survive; with `LOOPEVAL_KEEP=1` the rule SHALL be left
in place with the manual removal step printed.

#### Scenario: The injected rule steers a real agent

- **WHEN** the briefing scenario runs against the briefing fixture with its
  scoped rule injected and a goal loop armed in drive mode
- **THEN** the scenario passes only if the loop resolves `done · verified`, the
  fixture's acceptance check exits 0, and the ack file exists with the exact
  ack line — the marker the rule alone asked for

#### Scenario: Sends are attributable to the injected rules revision

- **WHEN** the briefing scenario reads the audit record after the loop resolves
  (isolated: the audit JSONL; live: the loop debug bundle's audit slice)
- **THEN** every send of the run is loop-attributed and stamped briefed at the
  rules revision returned by the injection PUT, and a mismatch fails the
  scenario naming the revision seen

#### Scenario: The global rules list is left as found

- **WHEN** the briefing scenario finishes (pass or fail) without `LOOPEVAL_KEEP`
- **THEN** teardown removes exactly the rule the run injected, identified by id,
  leaving every other rule — including ones an operator added mid-run —
  untouched; a removal failure is warned with the rule id named, never masking
  the verdict

