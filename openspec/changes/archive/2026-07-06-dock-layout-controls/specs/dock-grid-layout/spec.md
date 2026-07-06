## ADDED Requirements

### Requirement: A compact Layout popover controls dock rendering

The dashboard header SHALL expose a single compact Layout button that opens a
popover holding all dock-render controls: docks per row, dock height, and
content zoom. The popover SHALL close on an outside click or Escape, and SHALL
NOT permanently consume header or grid space beyond its one trigger button.

#### Scenario: Open and close the popover

- **WHEN** the operator clicks the Layout button
- **THEN** the popover opens showing the per-row, height, and zoom controls
- **WHEN** the operator clicks outside the popover or presses Escape
- **THEN** the popover closes and the grid keeps the chosen settings

### Requirement: Operator controls docks per row

The Layout popover SHALL offer a per-row control with Auto plus explicit
counts 1 through 6. Auto SHALL keep the automatic near-square column count
with the default width caps. An explicit count SHALL render exactly that many
grid columns and the docks SHALL fill the full row width (no side gutters), so
fewer docks per row means wider docks.

#### Scenario: Explicit columns fill the row

- **WHEN** the operator selects 2 per row with 4 docks visible
- **THEN** the grid renders 2 equal columns spanning the full grid width and
  each dock is roughly half the row wide

#### Scenario: Auto restores the default layout

- **WHEN** the operator selects Auto
- **THEN** the column count returns to the automatic near-square layout with
  the default dock width caps

### Requirement: Operator controls dock height

The Layout popover SHALL offer a height control with Auto plus an explicit
height slider. Auto SHALL keep the aspect-ratio-derived heights. An explicit
height SHALL apply that height to every dock cell in the grid, independent of
dock width, with cell content clipped rather than overflowing the cell.

#### Scenario: Explicit height applies to all docks

- **WHEN** the operator sets an explicit height
- **THEN** every dock cell in the grid renders at that height regardless of
  its width

#### Scenario: Auto height restores aspect-ratio sizing

- **WHEN** the operator switches height back to Auto
- **THEN** dock heights again follow their aspect ratios

### Requirement: Content zoom lives in the Layout popover

The Layout popover SHALL contain the content-zoom control (0.5–2.0) that
scales what renders inside phone docks, replacing the standalone A−/A+ header
buttons while preserving the persisted zoom value and its effect.

#### Scenario: Zoom from the popover

- **WHEN** the operator changes the zoom control in the popover
- **THEN** the content inside phone docks scales accordingly, exactly as the
  former A−/A+ buttons did

### Requirement: Layout settings persist per device and per view family

Per-row and height settings SHALL be remembered per device, separately for the
cards view and for the phone-rendering views (phones and hot share one
bucket), and SHALL be restored when the dashboard reopens.

#### Scenario: Cards and phones remember different layouts

- **WHEN** the operator sets 4 per row in cards view, switches to phones view
  and sets 2 per row, then switches back to cards
- **THEN** cards view shows 4 per row again, and returning to phones shows 2

#### Scenario: Settings survive reload

- **WHEN** the operator reloads the page and reopens the dashboard
- **THEN** the previously chosen per-row, height, and zoom settings apply

### Requirement: Minimal spacing around and inside docks

The dashboard SHALL keep margins and paddings around and inside docks minimal:
the gap between dock cells SHALL be at most 8px, summary-card inner padding at
most 12px, and phone-dock internal regions SHALL use correspondingly tight
paddings, so dock content — not chrome — consumes the screen.

#### Scenario: Tight grid

- **WHEN** the dashboard renders docks in any view
- **THEN** adjacent dock cells are separated by no more than 8px and a summary
  card's content starts within 12px of its border
