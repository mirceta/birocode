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
mode only) listing the loop-eval live-mode scenarios (goal, queue, run-all),
each with a Start control and cost copy (expected real agent turns and
wall-clock minutes) shown before starting. Starting a scenario SHALL make the
harness spawn the committed suite's own scenario script in live mode against
itself — the scripts, fixtures, and assertions remain the single source of
truth, with no reimplementation of scenario logic in the harness. The run
SHALL be observable exactly as a terminal-launched live run is: fixture repo
card appears, its agent dock tab appears in the synced dock list bound to the
driven conversation, and the Autopilot console loop card tracks the loop.
While a run is active, the E2E section SHALL locate the `loopeval-*-live`
fixture's dock tab in the device's synced dock list and render a control that
focuses that dock (activates the tab and navigates the operator to its chat
surface); until the tab exists, the section SHALL show the passive
where-to-watch hint instead. The runner SHALL NOT navigate the operator
anywhere automatically — watching is one click, never a focus steal.

#### Scenario: Operator starts a run and watches it in the UI

- **WHEN** the operator clicks Start on a scenario and confirms the cost note
- **THEN** the harness spawns that scenario's script in live mode, the Tests
  tab shows the run entering preflight, and once the fixture's dock tab
  appears the operator uses the watch control to jump to that dock, where the
  seeded conversation and every loop-driven turn stream in as the run
  progresses to the verdict

#### Scenario: Watch control appears with the dock tab and outlives the verdict

- **WHEN** a run is active but the fixture's dock tab has not yet been created
  (preflight/seed)
- **THEN** the E2E section shows the passive where-to-watch hint; the watch
  control renders whenever a `loopeval-*-live` dock tab actually exists —
  including after the run reached its verdict, because UI-started runs keep
  the fixture up until the operator finishes it (see the kept-agent
  requirement below)

#### Scenario: Suite missing from the opened checkout

- **WHEN** a run is requested but the live harness's own repo checkout does not
  contain the committed eval suite
- **THEN** the request fails with an error naming the expected suite path, and
  nothing is spawned

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

### Requirement: Scenario manifests are surfaced before starting

The scenarios listing served to the Tests tab SHALL include each scenario's
self-description manifest obtained by invoking the committed suite script's
`--describe` mode — the harness SHALL NOT maintain its own copy of scenario
knowledge (loop parameters, fixture facts, expected outcome) beyond what it needs
to spawn and supervise the run process (script path, timeout, cost copy). Manifests
SHALL be cached and refreshed when the scenario script file changes. A failed or
timed-out describe invocation SHALL degrade gracefully: the scenario still lists
and remains startable with the manifest replaced by an error note — transparency
SHALL never block running.

The Tests tab SHALL render, per scenario and before the operator starts it, an
expandable disclosure with three parts: **what it arms** (loop kind and mode,
iteration cap, deadline, deny list, verify flag, and the full goal prompt or the
queue's prompt-to-artifact table), **what it acts on** (fixture name, committed
template path, fixture file list and content summary, and the working-copy
lifecycle including the `loopeval-*-live` registration and teardown), and **what
must hold** (the expected-outcome assertion list). The disclosure SHALL be
collapsed by default and read-only.

#### Scenario: Operator inspects a scenario before starting

- **WHEN** the operator expands a scenario row's disclosure in the Tests tab
- **THEN** the loop parameters the run would arm, the source fixture repository
  (with its committed template path), and the expected-outcome list are shown,
  sourced from the suite's `--describe` output

#### Scenario: Describe failure does not block runs

- **WHEN** a scenario script's `--describe` invocation fails or times out
- **THEN** the scenario still appears with its title and cost copy, an error note
  replaces the manifest details, and Start remains available subject to the
  existing preconditions

### Requirement: The finished test agent stays watchable until FINISH AGENT

A UI-started live run SHALL NOT remove its fixture (repo card, dock tab, driven
conversation) when the run reaches its verdict: the harness starts the suite
with its keep switch (`LOOPEVAL_KEEP=1`) so the suite skips live teardown, and
the operator keeps watching the agent dock after the test is finished. The
harness SHALL stop any loop still armed on the fixture the moment the run ends,
so a kept fixture never keeps spending agent turns. The E2E eval section SHALL
render a FINISH AGENT control whenever a `loopeval-*-live` fixture is
registered and no run is active; invoking it SHALL perform exactly the
deferred teardown the suite would have done — stop the loop, close the dock
tab, unregister the repo card, delete the scratch copy — and until it is
invoked the next Start SHALL stay blocked with copy pointing at FINISH AGENT
(a kept agent is the normal post-run state, not an error).

#### Scenario: Dock survives the verdict

- **WHEN** a UI-started run reaches passed/failed/error/stopped while the
  operator is watching the fixture's agent dock
- **THEN** the dock tab, repo card, and conversation remain exactly where they
  are (only the loop is stopped), and the Tests tab notes the test agent is
  kept for inspection

#### Scenario: Operator finishes the agent

- **WHEN** the operator clicks FINISH AGENT after a finished run
- **THEN** the harness stops the fixture's loop, closes its dock tab,
  unregisters its repo card, and deletes its scratch copy; the watch
  affordance disappears, the kept-agent banner clears, and starting the next
  eval becomes possible again

