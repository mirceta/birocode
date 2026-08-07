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

### Requirement: Dock toolbar dots mirror the busy state for the full roster

The dashboard's dock toolbar SHALL reuse the same busy color language on each tab's dot. The
toolbar is the horizontal strip listing EVERY dock, including ones hidden from the grid: at
rest the dot
keeps the dock's assigned color (its existing behavior), and while that dock's agent is
processing a turn (status `running`) the dot SHALL turn near-black (`--color-text`). Because
the strip lists the full roster, this SHALL work for docks hidden from the dashboard grid —
the operator can tell a hidden agent is busy without re-showing it.

#### Scenario: Toolbar dot at rest keeps the assigned color

- **WHEN** a dock's agent is not processing (status `idle`, `done`, or `error`)
- **THEN** its toolbar tab's dot shows the dock's assigned color (or the neutral default when no color is assigned)

#### Scenario: Toolbar dot goes black while running

- **WHEN** a dock's agent transitions to status `running`
- **THEN** its toolbar tab's dot turns near-black (`--color-text`), regardless of the assigned color

#### Scenario: Hidden dock's busy state is visible in the strip

- **WHEN** a dock is hidden from the dashboard grid (`dashboard === false`) and a prompt is running on its agent
- **THEN** its toolbar dot still turns black, so the busy state is visible without re-showing the dock

### Requirement: Unseen-result exclamation on hidden docks' toolbar dots

The system SHALL latch a server-persisted unseen-result flag on a dock tab when a
builder-lane run reaches a genuine terminal status (`done` or `error`) while that dock is
HIDDEN from the dashboard grid (`dashboard === false`), and the toolbar SHALL render the
tab's dot as an exclamation point instead of the assigned color. The latch is an
operator-acknowledgement flag, not an agent status: it SHALL persist (through idleness,
page reloads, and browsers being closed at completion time) until the dock is shown on the
dashboard again, whereupon it SHALL clear — whichever route turned visibility on (the
toolbar tab or the Agents-page toggle). While a new prompt is running on a latched dock,
the running (near-black, pulsing) presentation SHALL take precedence; when that run
finishes while still hidden, the exclamation SHALL return. A dock that is visible on the
grid SHALL never show the exclamation — a finish that lands while the dock is shown needs
no latch. Runs ending `stopped` SHALL NOT latch (a stop is a deliberate operator action,
and app shutdown finalizes running sessions as `stopped`).

#### Scenario: Run finishes while the dock is hidden

- **WHEN** a prompt is running on an agent whose dock is hidden from the grid, and the run completes with status `done` or `error`
- **THEN** the dock tab's unseen-result flag is set on the server, and its toolbar dot renders as an exclamation point instead of the assigned color

#### Scenario: Showing the dock clears the exclamation

- **WHEN** a dock whose toolbar dot shows the exclamation is shown on the dashboard again (via the toolbar tab or the Agents-page toggle)
- **THEN** the unseen-result flag clears on the server and the dot returns to the dock's assigned color

#### Scenario: Finish lands while the dock is visible

- **WHEN** a run completes while its dock is visible on the dashboard grid
- **THEN** no unseen-result flag is latched and the toolbar dot returns to the assigned color

#### Scenario: Running outranks the exclamation

- **WHEN** a new prompt starts on a hidden dock whose unseen-result flag is latched
- **THEN** the toolbar dot shows the running presentation (near-black, pulsing) while the run is in flight, and the exclamation returns if the run finishes while the dock is still hidden

#### Scenario: Latch survives nobody watching

- **WHEN** a run completes while its dock is hidden and no browser has the dashboard open
- **THEN** the flag is still latched (it is set server-side at run completion), and any later dashboard load renders the exclamation until the dock is shown

### Requirement: Error state keeps a distinct red indicator

The system SHALL keep the error state visually distinct from the orange/black work scheme: a
dock whose agent has status `error` SHALL show a red indicator, taking precedence over the
at-rest orange.

#### Scenario: Agent errors

- **WHEN** a dock's agent has status `error`
- **THEN** the dock header's top-left indicator renders red, not orange or black
