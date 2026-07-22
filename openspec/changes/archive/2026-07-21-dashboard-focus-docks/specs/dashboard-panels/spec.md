## ADDED Requirements

### Requirement: Auxiliary panels are summonable, not always-on

The dashboard SHALL treat the Ideas, Autopilot, and Agent-audit panels as
auxiliary panels that render only when the Operator has shown them; the agent
docks grid SHALL always render. On a device with no saved choice, all three
auxiliary panels SHALL be hidden, yielding a docks-only dashboard.

#### Scenario: Fresh device shows docks only

- **WHEN** the dashboard opens on a device with no saved panel-visibility state
- **THEN** only the docks grid (with its header bar) renders — no Ideas,
  Autopilot, or Agent-audit panel — and the grid occupies the full canvas width

#### Scenario: A summoned panel appears with its behaviors intact

- **WHEN** the Operator shows the Ideas panel and then uses its existing
  collapse, wide, or drag-resize controls
- **THEN** the panel renders in its usual place and each of those controls
  behaves exactly as it did when the panel was always-on

### Requirement: Panel rail toggles each auxiliary panel

The dashboard's shared header bar SHALL include a panel rail: one toggle chip
per auxiliary panel, each showing a pressed/on state while its panel is
visible. Toggling a chip SHALL show or hide its panel immediately. The
Autopilot chip SHALL render only when the `autopilotTab` feature is on and the
Agent-audit chip only when `agenticAudit` is on; the Ideas chip renders
whenever the dashboard does.

#### Scenario: Chip toggles a panel on and off

- **WHEN** the Operator taps the Ideas chip twice
- **THEN** the Ideas panel appears after the first tap (chip reads pressed) and
  disappears after the second (chip reads unpressed), with no page reload

#### Scenario: Feature-gated chips stay hidden with their features

- **WHEN** the dashboard renders on a device where `agenticAudit` is off
- **THEN** the rail shows no Agent-audit chip, and the other chips are
  unaffected

### Requirement: Panel visibility persists per device

Panel visibility SHALL be remembered per device (device-local storage, like the
dashboard's other view settings) and restored on the next dashboard open.
Storage failure (e.g. private mode) SHALL degrade to in-memory state for the
session, never an error.

#### Scenario: Choice survives reopen

- **WHEN** the Operator shows Autopilot, closes the dashboard, and reopens it
- **THEN** the Autopilot panel is visible again without re-toggling

### Requirement: Hidden panels are unmounted

A hidden auxiliary panel SHALL NOT be mounted: it issues no fetches or polls,
and it does not participate in the dashboard's layout systems (free-drag
citizen list, grid flow order). Layout state saved for a panel (position,
size) SHALL be retained while it is hidden and reapplied when it is next
shown.

#### Scenario: No network activity from a hidden panel

- **WHEN** the dashboard is open with the Autopilot panel hidden
- **THEN** no Autopilot API requests are issued by the dashboard

#### Scenario: Layout state survives hide/show

- **WHEN** the Operator drag-positions the Ideas panel in free mode, hides it,
  and shows it again
- **THEN** the panel returns at its saved position
