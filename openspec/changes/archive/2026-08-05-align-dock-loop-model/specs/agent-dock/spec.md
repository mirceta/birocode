# agent-dock — delta

Reframes the dock loop control around the console's loop-type model and adds
suggestion-loop arming. The existing loop badge / recipe-arm / gate-hint
requirements keep holding; these deltas add the grouping, the suggestion
section, and the badge typing on top.

## ADDED Requirements

### Requirement: Dock loop control is grouped by loop type

The system SHALL present the dock card's loop popover as two labeled sections
matching the autopilot console's loop-type grouping — a suggestion-based loop
section and a goal-based loop section — each carrying a one-line description of
what that loop type does. The recipe picker SHALL sit inside the goal-based
section under a visible recipes label, so a recipe name is never shown without
its loop type. The queue-based loop SHALL NOT appear on the dock while it does
not exist.

#### Scenario: A recipe name is always framed by its loop type

- **WHEN** the user opens the dock card's loop popover
- **THEN** "Drive the feature" appears inside the goal-based loop section under a recipes label, with the section's one-line description visible

#### Scenario: No queue-based section

- **WHEN** the user opens the dock card's loop popover
- **THEN** no queue-based loop section is shown

### Requirement: The suggestion loop is armable from the dock card

The system SHALL let the user arm and disarm this agent for the
suggestion-based loop from the dock card's popover, acting through the existing
operator-gated autopilot config action, and SHALL show the agent's current
suggestion state (not armed, armed suggest-only, or armed with auto-advance).
When the operator gate is closed, attempting to arm SHALL show the existing
explicit gate-closed hint rather than failing silently.

#### Scenario: Arm suggestions where the work is

- **WHEN** the user opens the dock card's loop popover and arms the suggestion-based loop
- **THEN** that repo becomes suggestion-armed without navigating to the Autopilot console, and the popover reflects the armed state

#### Scenario: Gate closed teaches instead of failing mutely

- **WHEN** the user toggles suggestion arming from the dock while the operator gate is closed
- **THEN** the card shows the explicit gate-closed hint naming the host-side action needed

### Requirement: The dock loop badge is typed by loop type

The system SHALL type the dock card's loop indicators by loop type: the
goal-based loop badge carries the goal-loop marker (with iteration progress
while active and the terminal states as before), and a distinct
suggestion-loop marker SHALL show while the repo is suggestion-armed, drawn
from the read-only projection so it stays honest while the operator gate is
closed.

#### Scenario: Both loop types visible at a glance

- **WHEN** a dock card's repo is suggestion-armed and also has a goal loop on iteration 3 of 10
- **THEN** the card shows the suggestion marker and a goal-typed badge conveying 3/10
