# loop-eval — delta for loop-agent-briefing

## ADDED Requirements

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

## MODIFIED Requirements

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
