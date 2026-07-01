## ADDED Requirements

### Requirement: Dashboard dock toolbar lists every dock as a toggleable tab

The system SHALL show, at the top of the Dashboard, a dock toolbar containing one tab per
agent dock in the roster — **including docks that are currently hidden from the grid** — so the
operator can see the full set of docks in one place. Each tab SHALL be labeled and color-coded
from that dock's own identity (its display name and color), and SHALL convey whether the dock is
currently rendered in the grid (active) or hidden (inactive), with an accessible state. The
toolbar SHALL reflect live changes to the roster — docks added, removed, or renamed — without a
page reload, drawing from the same dock source the grid uses.

#### Scenario: The toolbar shows all docks, visible and hidden

- **WHEN** the Dashboard is open and the roster contains both docks that render in the grid and docks that are hidden from it
- **THEN** the toolbar shows one tab for every dock in the roster, with visible docks' tabs marked active and hidden docks' tabs marked inactive

#### Scenario: The toolbar tracks the live roster

- **WHEN** a dock is added to, removed from, or renamed in the roster while the Dashboard is open
- **THEN** the toolbar's tabs update to match without a page reload

### Requirement: Clicking a dock's tab toggles whether it renders in the grid

The system SHALL make each toolbar tab toggle its dock's rendered-on-dashboard state. Clicking
an **active** tab SHALL hide that dock — remove its tile from the Dashboard grid — and show the
tab as inactive; clicking an **inactive** tab SHALL show the dock again — its tile SHALL reappear
in the grid — and show the tab as active. This toggle SHALL drive the dock's existing
dashboard-visibility state (the `dashboard` field) through the existing dock update path, so the
grid, the toolbar, and any other surface that reads that state stay consistent. Hiding a dock
from the grid SHALL NOT close, stop, or delete the dock; it only affects whether its tile is
rendered.

#### Scenario: Hide a rendered dock from the toolbar

- **WHEN** the operator clicks an active tab for a dock whose tile is currently in the grid
- **THEN** that dock's tile is removed from the grid and the tab becomes inactive, and the dock itself is not closed or deleted

#### Scenario: Re-show a hidden dock from the toolbar

- **WHEN** the operator clicks an inactive tab for a dock that is currently hidden from the grid
- **THEN** that dock's tile reappears in the grid and the tab becomes active

#### Scenario: The toggle agrees with the Agents-page visibility control

- **WHEN** the operator toggles a dock's visibility from the toolbar
- **THEN** the same dock's visibility control on the Agents page reflects the new state, and vice-versa, because both act on the one shared dashboard-visibility state

#### Scenario: All docks hidden shows a recoverable empty grid

- **WHEN** the operator hides every dock so the grid has no tiles
- **THEN** the grid shows an empty-state hint and the toolbar still shows all docks' (inactive) tabs so any dock can be re-shown with one click

### Requirement: The dock toolbar honors the dashboard's Advanced gate

The system SHALL show the dock toolbar only where the agent dashboard / agent dock itself is
shown — behind the same Advanced-mode gate — so Basic (Simple) mode is unaffected.

#### Scenario: Basic mode shows no dashboard and no toolbar

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** neither the agent dashboard nor the dock toolbar is shown
