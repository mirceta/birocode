# agent-dock — delta

New concerns only (loop state + loop launch on dock cards); no existing
agent-dock requirement changes.

## ADDED Requirements

### Requirement: Dock cards surface live loop state

The system SHALL show on each agent dock card whose repo has a loop a compact
loop badge reflecting the loop's current state: looping with iteration count
against the cap while active, and the terminal state (done, escalated, capped,
error, stopped) after resolution — with an escalated loop's badge visually
distinct so a loop that needs the human is noticeable at a glance. The badge
SHALL draw from the read-only loop-status projection so terminal states remain
visible while the operator gate is closed. A repo with no loop SHALL show no
badge.

#### Scenario: Active loop shows progress

- **WHEN** a dock card's repo has an active loop on iteration 3 of a cap of 10
- **THEN** the card shows a loop badge conveying looping state and 3/10

#### Scenario: Escalation is visible on the dashboard

- **WHEN** a loop resolves `escalate` while the user is viewing the dashboard
- **THEN** that repo's dock card shows a distinct escalated badge without the user opening the Autopilot tab

### Requirement: A loop can be started and stopped from the dock card

The system SHALL provide on the agent dock card a loop control that lets the
user arm a loop by picking a recipe (with the cap adjustable at arm time) and
stop an active loop, acting through the existing operator-gated loop actions.
When the operator gate is closed, attempting to arm SHALL show an explicit
"operator gate is closed — open it on the host" hint rather than failing
silently.

#### Scenario: One-tap loop from where the work is

- **WHEN** the user opens the dock card's loop control and picks a recipe
- **THEN** a loop is armed on that agent with the recipe's prompt, sentinel, and cap, without navigating to the Autopilot tab

#### Scenario: Gate closed teaches instead of failing mutely

- **WHEN** the user tries to arm a loop from the dock card while the operator gate is closed
- **THEN** the card shows an explicit gate-closed hint naming the host-side action needed

### Requirement: Dock loop controls honor the Advanced gate

The system SHALL show the dock card's loop badge and loop control only behind
the same Advanced-mode gate as the agent dock itself, so Basic (Simple) mode is
unaffected.

#### Scenario: Basic mode unaffected

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** no loop badge or loop control is shown anywhere
