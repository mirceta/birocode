## ADDED Requirements

### Requirement: The dashboard offers parallel Execution and Management views

The dashboard SHALL present two parallel top-level views under its one overlay
and tab view: **Execution** — the docks grid with the Autopilot and Agent-audit
auxiliary panels — and **Management** — the full Arch surface (all lanes, scope
picker, loop controls, fleet card) together with the Ideas panel. A two-tab
header SHALL switch between them without closing the dashboard, the active view
SHALL persist per device and be restored on the next open, and the existing
entry points (title button, keyboard shortcut) SHALL open the dashboard on the
last active view. Both views SHALL be Advanced-mode only, gated exactly like
the dashboard today; Basic mode SHALL be unaffected.

#### Scenario: Switching views keeps the overlay open

- **WHEN** the Operator opens the dashboard and taps the Management tab
- **THEN** the Arch surface and the Ideas panel render in place of the docks view, with no page reload, and tapping Execution returns to the docks

#### Scenario: The view choice survives reopen

- **WHEN** the Operator leaves the dashboard while Management is active and later reopens it
- **THEN** the dashboard opens on the Management view

#### Scenario: Management hosts the real surfaces, unchanged

- **WHEN** the Operator arms the arch loop or edits an idea from the Management view
- **THEN** the behaviour is identical to the same action on the studio Arch or Ideas tab — the same components against the same APIs

### Requirement: Management features live only in the Management view

The Execution view's panel rail SHALL NOT offer the Ideas or Arch panels; those
features' dashboard-level home SHALL be the Management view alone. The studio's
own Ideas and Arch tabs (deep-link routes) SHALL remain unchanged.

#### Scenario: Execution rail is execution-only

- **WHEN** the Operator opens the Execution view
- **THEN** the panel rail offers Autopilot and Agent-audit chips (feature-gated as today) and no Ideas or Arch chip
