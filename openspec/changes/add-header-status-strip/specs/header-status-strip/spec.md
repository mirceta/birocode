# header-status-strip Delta

## ADDED Requirements

### Requirement: Status strip below the app header on every screen

The system SHALL render a header status strip as a full-width element directly
below the app header bar (the bar holding the title, Hello button, project
chip, language toggle, Save button and mode toggle), on every screen of the
studio shell — including while the agent dashboard overlay, the multi-pane
strip, or any routed page is showing. The strip SHALL stretch across the whole
horizontal space available to it.

#### Scenario: Present on a routed page

- **WHEN** any studio route is open on a device with the strip capability
- **THEN** the strip renders immediately below the app header, spanning the
  full available width

#### Scenario: Present while the dashboard overlay is open

- **WHEN** the agent dashboard overlay is opened
- **THEN** the strip remains visible between the app header and the dashboard

### Requirement: Collapsible, collapsed by default

The strip SHALL be collapsible. On a device that has never toggled it, the
strip SHALL start collapsed, showing only a slim summary bar with an
expand/collapse control (`aria-expanded` reflecting state). The
expanded/collapsed choice SHALL persist per device across reloads using
device-local storage, following the same localStorage idiom the hosted
sections already use.

#### Scenario: First visit is collapsed

- **WHEN** a device loads the app with no stored strip preference
- **THEN** the strip renders collapsed as a slim single bar

#### Scenario: Expansion persists

- **WHEN** the user expands the strip and reloads the page
- **THEN** the strip renders expanded

#### Scenario: Collapse persists

- **WHEN** the user collapses the strip and reloads the page
- **THEN** the strip renders collapsed

### Requirement: Hosts the four status sections moved from the dashboard

The expanded strip SHALL host, in one responsive wrapping row: the Scoreboard,
the GitHub account chip, the Claude account chip (both with their existing
inner behavior, including the GitHub token control's own gating), and the host
clock. These sections SHALL move out of the agent dashboard's scoreboard row —
the dashboard SHALL no longer render them — so each underlying endpoint has a
single polling surface. The sections' own inner collapse states and
device-local keys SHALL keep working unchanged inside the strip.

#### Scenario: Expanded strip shows the sections

- **WHEN** the strip is expanded in Advanced mode
- **THEN** the Scoreboard, GitHub chip, Claude chip and host clock render in a
  row that wraps on narrow screens

#### Scenario: Dashboard no longer duplicates them

- **WHEN** the agent dashboard overlay is open
- **THEN** its panel body contains no Scoreboard row, and the four sections
  appear only in the strip

### Requirement: No polling while collapsed

While collapsed, the strip SHALL NOT mount the hosted sections and SHALL NOT
issue any of their status requests (`/api/analytics`, `/api/github-account`,
`/api/claude-account`, `/api/claude-usage`, `/api/host-time`). Expanding the
strip SHALL start the sections' normal polling; collapsing SHALL stop it.

#### Scenario: Collapsed strip is network-silent

- **WHEN** the strip is collapsed and the user navigates the app
- **THEN** none of the four sections' status endpoints are requested by the
  strip

#### Scenario: Expanding starts polling

- **WHEN** the user expands the strip
- **THEN** the sections mount and begin their existing poll cadences

### Requirement: Advanced-mode gating

The strip SHALL be registered in the UI-mode capability map as an
Advanced-mode feature (`headerStatusStrip`). In Basic mode the strip SHALL not
render at all — no empty bar or placeholder.

#### Scenario: Basic mode has no strip

- **WHEN** a device is in Basic (Simple) UI mode
- **THEN** nothing renders between the app header and the content area

#### Scenario: Advanced mode shows the strip

- **WHEN** a device is in Advanced UI mode
- **THEN** the collapsed strip bar is visible below the header
