# Loop eval UI runner

## Purpose

Lets the operator run the loop-eval suite's live-mode scenarios from the Autopilot
console's Tests tab instead of a terminal: the harness spawns the committed scenario
scripts against itself, streams state and output back to the UI, and renders the
machine-readable verdict. The committed suite (`tests/loop-eval/`) stays the single
source of truth for scenario logic; this capability only adds the spawn/watch/stop
surface, a one-shot internal credential for the run, and read-only precondition
checks — the no-remote-enable stance of live mode is preserved end to end.
## Requirements
### Requirement: Start live-mode eval scenarios from the Tests tab

The Autopilot console's Tests tab SHALL provide an E2E eval section (Advanced
mode only) listing the loop-eval live-mode **atomic** scenarios (goal, queue),
each with a Start control and cost copy (expected real agent turns and
wall-clock minutes) shown before starting. The combined `run-all` sweep SHALL
NOT be listed or startable from the harness runner — it remains the committed
suite's terminal/agent entry point only. Starting a scenario SHALL make the
harness spawn the committed suite's own scenario script in live mode against
itself — the scripts, fixtures, and assertions remain the single source of
truth, with no reimplementation of scenario logic in the harness. The run
SHALL be observable exactly as a terminal-launched live run is: fixture repo
card appears, its agent dock tab opens and shows the real conversation, and
the Autopilot console loop card tracks the loop.

#### Scenario: Operator starts a run and watches it in the UI

- **WHEN** the operator clicks Start on a scenario and confirms the cost note
- **THEN** the harness spawns that scenario's script in live mode, the Tests
  tab shows the run entering preflight, and once armed the fixture repo's
  agent dock tab opens in the frontend where the operator watches the loop
  drive real agent turns to the verdict

#### Scenario: Suite missing from the opened checkout

- **WHEN** a run is requested but the live harness's own repo checkout does not
  contain the committed eval suite
- **THEN** the request fails with an error naming the expected suite path, and
  nothing is spawned

#### Scenario: run-all is not a runner scenario

- **WHEN** the Tests tab lists startable scenarios, or a start is requested
  with the `run-all` scenario id
- **THEN** the listing contains only the atomic scenarios (goal, queue), and
  the start request is rejected as an unknown scenario while
  `tests/loop-eval/run-all.mjs` remains available from a terminal

### Requirement: Run status, verdict, and one-run-at-a-time

The harness SHALL expose the active run's state (preflight → armed → running →
passed/failed/error) with a live output tail streamed to the Tests tab, and on
completion SHALL present the scenario's machine-readable verdict as
per-assertion results. The harness SHALL allow at most one active eval run at a
time — a second start request SHALL be rejected with a conflict naming the
active run — and SHALL provide a Stop control that terminates the entire run
process tree, after which the suite's own cleanup contract applies and any
leftover live fixture repo is detected and reported rather than silently
ignored. Runner authentication SHALL use a harness-minted one-shot internal
credential scoped to the run's lifetime and revoked when the run ends; the
operator password SHALL NOT be read, stored, or passed by the runner, and no
credential SHALL be exposed to the browser.

#### Scenario: Status streams and verdict renders

- **WHEN** a run progresses and finishes
- **THEN** the Tests tab shows each state transition and output tail live
  without manual refresh, and the final view lists every assertion with its
  pass/fail and the overall verdict

#### Scenario: Concurrent start is rejected

- **WHEN** a run is active and a second start is requested (any scenario)
- **THEN** the request is rejected with a conflict identifying the active run,
  and the active run is unaffected

#### Scenario: Operator stops a run

- **WHEN** the operator stops an active run
- **THEN** the run's process tree is terminated, the run resolves as stopped
  (never hangs), the one-shot credential is revoked, and if a
  `loopeval-*-live` fixture repo remains registered the Tests tab names it and
  the manual cleanup step

#### Scenario: Credential lifetime is the run's lifetime

- **WHEN** a run ends in any way (pass, fail, error, stop, harness restart)
- **THEN** the minted credential no longer authorizes requests — revoked at run
  end, and stale run credentials are swept at harness start

### Requirement: Preconditions are surfaced in the UI, never auto-enabled

The Tests tab SHALL check the live-run preconditions (operator gate on, kill
switch on, no leftover `loopeval-*-live` repository, suite present) when the
E2E section is shown and before starting, and SHALL render each unmet
precondition as an actionable instruction telling the operator exactly where to
enable or clean it up (host GUI for the gate, Autopilot console for the kill
switch, repo card removal for leftovers). Neither the UI nor the runner service
SHALL enable the gate or kill switch itself — the no-remote-enable stance of
live mode is preserved end to end.

#### Scenario: Unmet precondition shown before starting

- **WHEN** the E2E section renders while the kill switch is off
- **THEN** the section shows the unmet precondition with the instruction to
  enable it in the Autopilot console, and starting is prevented until resolved

#### Scenario: Race lost after the UI check

- **WHEN** preconditions pass at render time but a precondition fails by the
  time the spawned suite runs its own preflight
- **THEN** the suite's fail-fast verdict is relayed to the Tests tab as the
  run's failed result, with the same actionable instruction

### Requirement: Runner subtab shows tests only; mechanics prose lives on its own subtab

The E2E eval subtab SHALL contain only the operational runner surface: the
precondition banner, the scenario rows (title, cost copy, manifest disclosure,
Start), and the active/last run panel. All explanatory content about the eval
layer's mechanics — what the layer is, run modes, cost rationale, lineage, and
placement guidance — SHALL live on a separate sibling subtab of the Tests tab,
and the runner subtab MAY carry at most a one-line pointer to it.

#### Scenario: Runner subtab is rows and run state only

- **WHEN** the operator opens the E2E eval subtab
- **THEN** the scenario rows (and, when present, the precondition banner and
  run panel) are the only content beyond at most a one-line pointer to the
  mechanics subtab

#### Scenario: Mechanics are still discoverable

- **WHEN** the operator opens the mechanics subtab
- **THEN** the explanation of the eval layer (what it is, isolated vs live run
  modes, what runs cost, lineage, and where each kind of test belongs) is
  presented there

