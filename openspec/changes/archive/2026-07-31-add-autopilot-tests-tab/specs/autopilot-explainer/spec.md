# Delta — autopilot-explainer

## ADDED Requirements

### Requirement: Present a test-coverage map of the loop engine

The autopilot console SHALL provide a Tests surface that states, in plain language, what
automated test coverage the loop engine has and what it does not have. The surface SHALL
present the layers separately — the unit-test suite (what it covers and the seams that
make it testable), the in-app runnable browser tests, and the end-to-end rehearsal layer
(including that its scripts are untracked scratch and that runs cost real agent turns) —
and SHALL state the known coverage gap and the plan to close it. Documentation subtabs
SHALL be pure reference content requiring no backend call; the runnable browser-test
subtab SHALL reuse the existing system-tests machinery unchanged. The stated facts SHALL
cite the real files they describe so the map stays honest against the code.

#### Scenario: Read the coverage map

- **WHEN** the End User opens the Tests tab in the autopilot console
- **THEN** subtabs for the unit-test layer, the runnable browser tests, the end-to-end rehearsal layer, and the coverage-gap plan are shown, and the documentation subtabs render without any backend call

#### Scenario: Run a browser test from the map

- **WHEN** the End User opens the Tests tab's browser-tests subtab
- **THEN** the existing runnable system tests are shown there with unchanged behavior (run, live output, screenshot artifact)

#### Scenario: The gap is stated, not hidden

- **WHEN** the End User opens the plan subtab
- **THEN** the untested area (the background tick engine) is named explicitly along with the planned seam to make it testable
