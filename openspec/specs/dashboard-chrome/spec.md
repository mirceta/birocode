# Dashboard Chrome

## Purpose

Keeps the dashboard overlay's own chrome (header bar, dock toolbar, controls,
spacing) as small as possible so the agent grid gets the vertical space. The
dashboard is the Operator's monitoring surface; every pixel of chrome is a
pixel taken from the docks.
## Requirements
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
controls — the Layout popover trigger, layout-mode controls, view tabs, the
only-important switch, and the close button — on a single horizontal bar when
the viewport is wide enough: the dock toolbar leading (left), the controls
trailing (right). The former standalone size stepper (−/+) and content-zoom
buttons (A−/A+) SHALL NOT render on the bar; their capabilities live in the
Layout popover. The dock toolbar SHALL keep its horizontal scrolling for
large rosters and SHALL retain a usable minimum width rather than being
squeezed out by the controls. Every remaining control SHALL keep its existing
function, labels, and gating.

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

- **WHEN** the operator uses the Layout popover trigger, layout-mode controls,
  view tabs, only-important switch, or close button from the shared bar
- **THEN** each behaves as specified, and the old standalone size/zoom button
  groups are absent

### Requirement: Compact chrome above the agent grid

The dashboard SHALL reserve less vertical space for chrome than the former
two-row header: the only chrome above the agent grid SHALL be the shared bar
(plus the wrapped controls line on narrow viewports). The shared bar SHALL
start with zero top margin/padding — no content-region inset or overlay
padding above it while the dashboard overlay is open — and the gap between
the bar and the grid SHALL stay minimal so the first row of dock tiles starts
as high as the bar allows.

#### Scenario: The docks bar starts at the top

- **WHEN** the dashboard overlay is open
- **THEN** the shared bar's top edge sits directly below the app header /
  status strip with no margin or padding above it

#### Scenario: The grid starts higher

- **WHEN** the dashboard is open with at least one dock in the grid
- **THEN** the first dock tile's top edge sits higher in the viewport than under
  the former layout, with the shared bar as the only chrome above it

