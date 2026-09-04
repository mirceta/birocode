## ADDED Requirements

### Requirement: Fleet scenario drives a repo agent on a second harness
The eval suite SHALL provide a fleet scenario (`tests/loop-eval/fleet.mjs`) that
boots two isolated harness instances on one machine, registers the second as a
collector source of the first with its credential and "allow sends", sets "accept
fleet sends" on the second, scopes the first's arch agent to a goal-fixture repo on
the second, arms it in drive mode, and instructs it to make that repo's goal check
pass. The scenario SHALL expose a `--describe` manifest and SHALL assert at least:
the goal check exits 0 on the second harness's repo; the second harness's audit
carries a send of kind `arch` with the fleet phase and its transcript shows a user
bubble tagged `arch@<first>`; the first harness's collector carried the second's
`turn.ended`; an `arch.wake` followed it on the first; the first's audit carries the
fleet send. Both instances SHALL be torn down.

#### Scenario: Fleet scenario passes end to end
- **WHEN** the fleet scenario runs
- **THEN** all assertions pass and both scratch instances are removed
