# dashboard-panels — delta

## ADDED Requirements

### Requirement: Summoned panels open as centered pop-ups

A summoned auxiliary panel SHALL open as a large pop-up centered over the
dashboard content, overlapping the docks grid — never as a layout citizen the
Operator must locate or drag. The dashboard's header bar (including the panel
rail) SHALL remain visible and interactive above the pop-up, so the summoning
chip stays usable as the off switch. A pop-up SHALL also be dismissible via a
close control on the pop-up itself and via Escape. When several panels are
summoned, their pop-ups SHALL stack centered with the most recently summoned
on top.

#### Scenario: Chip opens a centered pop-up and closes it again

- **WHEN** the Operator taps the Autopilot chip, then taps it again
- **THEN** the Autopilot panel appears as a large centered pop-up over the
  docks grid after the first tap and is gone after the second

#### Scenario: Most recent summon paints on top

- **WHEN** the Ideas pop-up is open and the Operator summons Agent audit
- **THEN** the Agent-audit pop-up renders centered on top of the Ideas pop-up,
  and both chips read pressed

#### Scenario: Escape closes the topmost pop-up

- **WHEN** two pop-ups are open and the Operator presses Escape
- **THEN** only the most recently summoned pop-up closes and its chip reads
  unpressed

## MODIFIED Requirements

### Requirement: Auxiliary panels are summonable, not always-on

The dashboard SHALL treat the Ideas, Autopilot, and Agent-audit panels as
auxiliary panels that render only when the Operator has shown them; the agent
docks grid SHALL always render. On a device with no saved choice, all three
auxiliary panels SHALL be hidden, yielding a docks-only dashboard. A summoned
panel SHALL present its full content surface (the same console/list as its
routed counterpart); the citizen-era layout controls (per-panel drag grips,
Ideas wide/collapse toggles, per-panel corner resize) are gone with the layout
citizenship itself.

#### Scenario: Fresh device shows docks only

- **WHEN** the dashboard opens on a device with no saved panel-visibility state
- **THEN** only the docks grid (with its header bar) renders — no Ideas,
  Autopilot, or Agent-audit panel — and the grid occupies the full canvas width

#### Scenario: A summoned panel shows its full surface

- **WHEN** the Operator shows the Autopilot panel
- **THEN** the pop-up contains the full Autopilot console (same surface as the
  routed tab), expanded, with no drag grip or dock resize grip

### Requirement: Hidden panels are unmounted

A hidden auxiliary panel SHALL NOT be mounted: it issues no fetches or polls
and renders nothing. The docks grid and its layout systems SHALL be unaffected
by panels being summoned or dismissed.

#### Scenario: No network activity from a hidden panel

- **WHEN** the dashboard is open with the Autopilot panel hidden
- **THEN** no Autopilot API requests are issued by the dashboard

#### Scenario: Docks grid unaffected by a summon

- **WHEN** the Operator summons and then dismisses the Ideas panel
- **THEN** the docks grid's layout (mode, positions, agents width) is exactly
  as before the summon
