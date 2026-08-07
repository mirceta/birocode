## ADDED Requirements

### Requirement: Prominent send-button-mirrored work indicator in the dock header

The system SHALL show a prominent work indicator in the top-left corner of each agent dock's
header (the `phone__bar`) whose color language mirrors the chat composer's send button: while
the agent is NOT processing (status `idle` or `done`) the indicator SHALL be accent orange
(`--color-accent`, the send button's at-rest color), and while the agent IS processing a turn
(status `running`) the indicator SHALL be near-black (`--color-text`, the send button's
Stop-state color). The indicator SHALL be substantially larger and higher-contrast than the
previous 9px status dot, so the busy/idle distinction is legible at a glance across a wall of
docks. This replaces the previous scheme (grey idle dot, small green pulse while running, blue
done dot).

#### Scenario: Agent is idle

- **WHEN** a dock's agent has status `idle`
- **THEN** the dock header's top-left indicator renders in accent orange (`--color-accent`)

#### Scenario: Agent starts processing

- **WHEN** a dock's agent transitions to status `running` (a turn is being sent or processed)
- **THEN** the indicator turns near-black (`--color-text`), matching the send button's busy/Stop color

#### Scenario: Turn completes

- **WHEN** the agent's turn finishes and status becomes `done`
- **THEN** the indicator returns to accent orange, the same at-rest color as `idle`

#### Scenario: Legible at a glance

- **WHEN** the operator views the dashboard's wall of docks
- **THEN** each dock's indicator is visibly larger than the former 9px dot and its busy (black) vs at-rest (orange) state can be distinguished without leaning in

### Requirement: Error state keeps a distinct red indicator

The system SHALL keep the error state visually distinct from the orange/black work scheme: a
dock whose agent has status `error` SHALL show a red indicator, taking precedence over the
at-rest orange.

#### Scenario: Agent errors

- **WHEN** a dock's agent has status `error`
- **THEN** the dock header's top-left indicator renders red, not orange or black
