## MODIFIED Requirements

### Requirement: Auxiliary panels are summonable, not always-on

The dashboard's Execution view SHALL treat the Autopilot and Agent-audit panels
as auxiliary panels that render only when the Operator has shown them; the agent
docks grid SHALL always render. On a device with no saved choice, both
auxiliary panels SHALL be hidden, yielding a docks-only Execution view. (Ideas
and Arch are no longer Execution auxiliary panels — they live in the Management
view, spec `management-dashboard`.)

#### Scenario: Fresh device shows docks only

- **WHEN** the dashboard's Execution view opens on a device with no saved panel-visibility state
- **THEN** only the docks grid (with its header bar) renders — no Autopilot or Agent-audit panel — and the grid occupies the full canvas width

#### Scenario: A summoned panel appears with its behaviors intact

- **WHEN** the Operator shows the Autopilot panel and then uses its existing
  collapse, wide, or drag-resize controls
- **THEN** the panel renders in its usual place and each of those controls
  behaves exactly as it did when the panel was always-on

### Requirement: Panel rail toggles each auxiliary panel

The Execution view's shared header bar SHALL include a panel rail: one toggle
chip per auxiliary panel, each showing a pressed/on state while its panel is
visible. Toggling a chip SHALL show or hide its panel immediately. The
Autopilot chip SHALL render only when the `autopilotTab` feature is on and the
Agent-audit chip only when `agenticAudit` is on. The rail SHALL offer no Ideas
or Arch chip.

#### Scenario: Chip toggles a panel on and off

- **WHEN** the Operator taps the Autopilot chip twice
- **THEN** the Autopilot panel appears after the first tap (chip reads pressed) and
  disappears after the second (chip reads unpressed), with no page reload

#### Scenario: Feature-gated chips stay hidden with their features

- **WHEN** the dashboard renders on a device where `agenticAudit` is off
- **THEN** the rail shows no Agent-audit chip, and the other chips are
  unaffected
