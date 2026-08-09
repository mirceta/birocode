## MODIFIED Requirements

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

## ADDED Requirements

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
