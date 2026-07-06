## ADDED Requirements

### Requirement: The dashboard header shows no title label

The dashboard overlay's header SHALL NOT render a visible "Dashboard" title
label (or any replacement heading text). Accessible names that reference the
dashboard (e.g. the view tablist's and control groups' `aria-label`s, the
free-drag agents panel's handle) SHALL keep working.

#### Scenario: The title label is gone

- **WHEN** the operator opens the dashboard overlay
- **THEN** no "Dashboard" heading text renders in the header, while the header's
  controls and the dock toolbar remain

#### Scenario: Accessible labels survive the removal

- **WHEN** the dashboard overlay is open
- **THEN** the view switcher and control groups still expose their
  dashboard-scoped accessible names

### Requirement: Dock toolbar and header controls share one horizontal bar

The dashboard header SHALL lay the dock toolbar (docks bar) and the header
controls — size stepper, content zoom, layout-mode controls, view tabs, the
only-important switch, and the close button — on a single horizontal bar when
the viewport is wide enough: the dock toolbar leading (left), the controls
trailing (right). The dock toolbar SHALL keep its horizontal scrolling for
large rosters and SHALL retain a usable minimum width rather than being
squeezed out by the controls. Every control SHALL keep its existing function,
labels, and gating; this requirement changes placement only.

#### Scenario: One bar on a wide viewport

- **WHEN** the dashboard is open on a viewport wide enough for the toolbar and
  controls together
- **THEN** the dock toolbar and all header controls render on the same
  horizontal bar, toolbar left and controls right, with no second header row
  above the agent grid

#### Scenario: A large roster scrolls instead of wrapping

- **WHEN** the roster holds more docks than fit in the toolbar's share of the bar
- **THEN** the toolbar scrolls horizontally within the bar and the controls stay
  visible and usable

#### Scenario: Narrow viewports wrap the controls below the docks bar

- **WHEN** the dashboard is open on a viewport too narrow to fit the toolbar and
  controls on one line
- **THEN** the controls wrap onto a following line below the docks bar and all of
  them remain visible and usable

#### Scenario: Controls keep working from the shared bar

- **WHEN** the operator uses the size stepper, zoom, layout-mode, view tabs,
  only-important switch, or close button from the shared bar
- **THEN** each behaves exactly as it did before the layout change

### Requirement: Compact chrome above the agent grid

The dashboard SHALL reserve less vertical space for chrome than the former
two-row header: the only chrome above the agent grid SHALL be the shared bar
(plus the wrapped controls line on narrow viewports), and the overlay's outer
vertical padding and the gap between the bar and the grid SHALL be reduced so
the first row of dock tiles starts visibly higher.

#### Scenario: The grid starts higher

- **WHEN** the dashboard is open with at least one dock in the grid
- **THEN** the first dock tile's top edge sits higher in the viewport than under
  the former layout (title row removed, spacing reduced), with the shared bar as
  the only chrome above it
