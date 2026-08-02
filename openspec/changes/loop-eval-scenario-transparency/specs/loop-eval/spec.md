## ADDED Requirements

### Requirement: Scenario scripts are self-describing

Each eval scenario script (`goal.mjs`, `queue.mjs`, `run-all.mjs`) SHALL support a
`--describe` flag that prints a machine-readable JSON manifest to stdout and exits 0
before any build, provisioning, network call, or token spend. The manifest SHALL be
derived from the same in-script values the live run uses — never a parallel copy —
and SHALL state: the loop parameters the scenario arms (kind, mode, iteration cap,
deadline and its env override, goal prompt text or queue prompts with their expected
artifact path and pattern, deny list, verify flag), the source fixture repository
(fixture name, committed template path under `tests/loop-eval/fixtures/`, file list,
a one-line content summary, and the working-copy lifecycle), and the expected
outcome as a human-readable list of the assertions that decide pass/fail. The
manifest SHALL carry a `describeVersion` field. `run-all.mjs --describe` SHALL
compose the child scenarios' manifests rather than restating them.

#### Scenario: Describe is side-effect free

- **WHEN** a scenario script is invoked with `--describe`
- **THEN** it prints the JSON manifest and exits 0 without building the harness,
  materializing a fixture, contacting any instance, or spending agent turns

#### Scenario: Manifest reflects the run's own constants

- **WHEN** a scenario constant that shapes the run (goal prompt, iteration cap,
  deny list, expected artifacts) is changed in the script
- **THEN** the next `--describe` output reflects the new value with no other file
  needing to change, because the manifest is built from those same constants
