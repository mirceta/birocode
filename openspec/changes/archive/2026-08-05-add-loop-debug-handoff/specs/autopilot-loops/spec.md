# autopilot-loops — delta

Adds a per-repo loop debug bundle read so a misbehaving loop can be handed to
an agent as one pasteable reference.

## ADDED Requirements

### Requirement: Loop debug bundle read

The system SHALL provide a session-authenticated, non-operator-gated read
that, for one agent (repo), assembles a single self-describing debug bundle:
the operator gate and kill-switch state, the repo's identity and path, the
agent's full loop record, a live engine snapshot (busy flag, current
decision and hold reason, the per-repo dedup guards, repo-filtered intercept
and log entries), repo-filtered audit entries, the absolute on-disk paths of
the loop store, audit log, gate file, and the repo's transcript directory,
and an agent-facing hint naming the engine source files. While the operator
gate is closed, every prompt-bearing field in the bundle (loop prompts, goal
text, pending prompt, message snippets, deny list, audit prompt text) SHALL
be replaced by an explicit redaction marker that points at the on-disk files
— the closed-gate disclosure surface stays no wider than the status
projection.

#### Scenario: Bundle for an armed loop with the gate open

- **WHEN** the operator gate is open and the debug read is requested for a repo with a loop record
- **THEN** the bundle contains the full loop record including its prompts, the engine snapshot with its dedup guards, and the on-disk file paths

#### Scenario: Gate closed redacts prompt text but not structure

- **WHEN** the operator gate is closed and the debug read is requested
- **THEN** the response is still 200 with gate state, loop status fields, and file paths, and every prompt-bearing field carries the redaction marker instead of its text

#### Scenario: Repo without a loop is still debuggable

- **WHEN** the debug read is requested for a repo with no loop record
- **THEN** the bundle reports the null loop alongside the gate state and file paths instead of failing
