# dashboard-free-layout Specification

## Purpose
TBD - created by archiving change dock-resizable-agents-panel. Update Purpose after archive.
## Requirements
### Requirement: Agents panel is horizontally resizable in free layout mode

In free drag layout mode the agents grid panel SHALL expose a drag grip on its
right edge that sets an explicit panel width (horizontal only — the panel's
height SHALL keep following its content). The width SHALL be clamped to a
minimum of 360px and a maximum of the visible canvas width (~95vw). While no
explicit width is set, the panel SHALL keep its current full-canvas behavior.
In grid layout mode the grip SHALL NOT render and a saved width SHALL NOT
apply.

#### Scenario: Drag the right edge to narrow the panel

- **WHEN** the operator, in free layout mode, drags the agents panel's
  right-edge grip 300px to the left
- **THEN** the panel renders ~300px narrower and the dock grid inside re-wraps
  to the new width (explicit per-row counts keep their column count at
  narrower tracks)

#### Scenario: Grid mode is untouched

- **WHEN** the operator switches to grid layout mode after saving an agents
  panel width
- **THEN** no resize grip renders on the agents panel and the panel shares the
  responsive flow with Ideas exactly as before, ignoring the saved width

### Requirement: Agents panel width persists per device and is resettable

A dragged agents-panel width SHALL be remembered per device (localStorage
`claudeweb_dash_agents_w`) and restored when the dashboard reopens in free
mode. Double-clicking the grip SHALL clear the saved width back to full-canvas
behavior, and the reset-layout action SHALL clear it along with panel
positions.

#### Scenario: Width survives reload

- **WHEN** the operator drags the agents panel to ~600px wide and reloads the
  page
- **THEN** the agents panel renders at ~600px in free mode

#### Scenario: Double-click resets

- **WHEN** the operator double-clicks the resize grip
- **THEN** the saved width is cleared and the panel returns to full-canvas
  width

#### Scenario: Reset layout clears the width

- **WHEN** the operator clicks the reset-layout (↺) button
- **THEN** panel positions AND the saved agents-panel width are cleared

