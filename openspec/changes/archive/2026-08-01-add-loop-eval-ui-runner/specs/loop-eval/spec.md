# Loop eval — delta for add-loop-eval-ui-runner

## MODIFIED Requirements

### Requirement: Live-harness run mode for human observation

The suite SHALL support an opt-in live mode (`--live` flag or `LOOPEVAL_LIVE=1`)
that runs a scenario against the operator's already-running live harness so the run
is observable in the real UI (fixture repo card, agent dock turns, Autopilot console
loop card) while it happens. In live mode the suite SHALL NOT build, boot, seed, or
kill any harness instance and SHALL NOT write to the live data directory or mutate
global autopilot configuration; loop internals needed for assertions SHALL be read
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
  deletion of anything outside its scratch dir), and removes the scratch copy;
  with `LOOPEVAL_KEEP=1` it instead leaves everything for inspection and prints the
  manual cleanup steps, and a cleanup failure is warned with the leftover named,
  never masking the scenario verdict

#### Scenario: Token-authenticated run skips login

- **WHEN** a live-mode scenario runs with `LOOPEVAL_LIVE_TOKEN` set
- **THEN** the suite installs the token as its session credential without calling
  the login endpoint, all subsequent API calls authorize through it, and an invalid
  or revoked token fails the preflight with a verdict naming the credential — the
  suite never retries with a password it does not have
