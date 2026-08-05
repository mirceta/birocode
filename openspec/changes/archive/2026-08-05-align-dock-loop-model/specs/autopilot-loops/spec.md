# autopilot-loops — delta

Widens the ungated read-only projection's disclosure boundary by one notch:
suggestion-arming STATUS joins loop status. The existing "Loop status is
readable without the operator gate" requirement is untouched.

## ADDED Requirements

### Requirement: Suggestion-arming status is readable without the operator gate

The system SHALL include in the read-only loop-status projection the
suggestion-based loop's arming status: which repos are armed, whether
auto-advance is on, and whether the engine's kill switch is on. This SHALL
remain status-only disclosure — no prompts, no confidence threshold, no
deny-list, and no action surface — and arming SHALL stay behind the operator
gate.

#### Scenario: Armed marker survives the gate closing

- **WHEN** a repo is suggestion-armed and the operator gate has since been closed
- **THEN** an authenticated client can still read that the repo is suggestion-armed and whether auto-advance is on

#### Scenario: Disclosure stays status-only

- **WHEN** an authenticated client reads the projection while the gate is closed
- **THEN** the response contains no prompt texts, threshold, or deny-list entries
