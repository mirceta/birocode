## MODIFIED Requirements

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

## ADDED Requirements

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
