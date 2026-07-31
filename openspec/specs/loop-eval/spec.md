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
verdicts (pass/fail, summary JSON, process exit code). The suite SHALL drive only
the shipped operator surface (login, repo registration, chat seed, loop arm/config,
loop polling) — no engine bypass, no new endpoints, and no remote gate-enable path:
autopilot gate and kill switch SHALL be enabled solely by seeding their files into
the isolated instance's data directory before boot. The suite SHALL be launched from
the CLI only and SHALL never run in CI.

#### Scenario: Goal loop implements a feature for real

- **WHEN** the goal scenario is run against the goal fixture (a mini-product with a
  deliberately missing feature whose goal check fails)
- **THEN** an isolated harness instance is booted, the fixture is materialized and
  registered, a goal loop is armed in drive mode, real agent turns run, and the
  scenario passes only if the loop resolves `done · verified`, the fixture's goal
  check now exits 0, and iterations stayed at or under the configured cap

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

#### Scenario: Runs are isolated and always torn down

- **WHEN** any scenario runs, succeeds, fails, or times out
- **THEN** it used its own port, fresh temp data directory, and binaries copied
  outside the repo tree — never the live instance, live data dir, or the repo's own
  registration — and the isolated instance is killed in all outcomes, with a timeout
  reported as a failed verdict rather than a hang
