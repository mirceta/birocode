## ADDED Requirements

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
