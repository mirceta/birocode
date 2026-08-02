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

#### Scenario: Watch control appears with the dock tab and goes away with it

- **WHEN** a run is active but the fixture's dock tab has not yet been created
  (preflight/seed), or the run has finished and cleanup removed the tab
- **THEN** the E2E section shows the passive where-to-watch hint (active run)
  or no watch affordance at all (finished run) — the watch control renders
  only while a `loopeval-*-live` dock tab actually exists

#### Scenario: Suite missing from the opened checkout

- **WHEN** a run is requested but the live harness's own repo checkout does not
  contain the committed eval suite
- **THEN** the request fails with an error naming the expected suite path, and
  nothing is spawned
