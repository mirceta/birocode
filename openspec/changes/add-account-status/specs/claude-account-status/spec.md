# Claude account status

## ADDED Requirements

### Requirement: Probe the current Claude subscription login

The system SHALL provide a read-only endpoint `GET /api/claude-account` that reports
the **current Claude subscription login** the `claude` CLI runs as, and SHALL return
a typed status `{ claudeInstalled, authenticated, account?, plan?, error? }` with HTTP
`200` in every case. The probe SHALL be read-only: it SHALL NOT trigger a login flow,
log out, switch accounts, or start a billable run, and SHALL NOT read or surface the
authentication token itself — only the account/plan metadata. It SHALL reflect the
**subscription** login the Harness forces (the run path strips `ANTHROPIC_API_KEY`),
not any API-key credential. It SHALL distinguish three states: `claude` not installed
/ not on PATH; installed but not logged in or the session expired; and authenticated,
in which case `account` (email/handle) SHALL be populated and `plan` SHALL be
populated when available. The probe SHALL fail soft — an unexpected or absent login
file resolves to `authenticated:false` rather than throwing.

#### Scenario: claude not installed

- **WHEN** the `claude` CLI is not on PATH and a client requests `GET /api/claude-account`
- **THEN** the response is `200` with `claudeInstalled: false`, `authenticated: false`,
  and `account`/`plan` null

#### Scenario: Installed but not logged in

- **WHEN** the `claude` CLI is installed but no valid subscription session exists (not
  logged in or expired)
- **THEN** the response is `200` with `claudeInstalled: true`, `authenticated: false`,
  a short `error` reason, and `account`/`plan` null

#### Scenario: Authenticated account reported

- **WHEN** the `claude` CLI is installed and has a valid subscription login
- **THEN** the response is `200` with `claudeInstalled: true`, `authenticated: true`,
  `account` set to the login email/handle, and `plan` set when the tier is available

#### Scenario: Fails soft on an unreadable login source

- **WHEN** the Claude login config/credential source is missing or has an unexpected shape
- **THEN** the probe returns `200` with `authenticated: false` and does not throw

#### Scenario: A client disconnect does not cancel the probe

- **WHEN** a client aborts the request (e.g. the dashboard page is refreshed) while a
  probe is in flight
- **THEN** the probe is not cancelled by the disconnect and the next request resolves
  a valid status

### Requirement: Dashboard renders the Claude account beside the GitHub one

The dashboard SHALL render a Claude-account widget on the **same horizontal row** as
the Scoreboard and **beside the GitHub-account widget**, as a sibling chip, so it
consumes horizontal space only and adds no vertical height; on a viewport too narrow
for all of them, the chips SHALL wrap rather than clip. The widget SHALL be
**collapsible**, and its collapsed/expanded state SHALL persist per device,
independently of the GitHub chip. Collapsed, it SHALL show a single compact indicator
(a status dot plus the account, or a not-installed marker); expanded, it SHALL show
the `claude`-installed and logged-in state, the account, and the plan when available.
The widget SHALL render the three probe states distinctly and SHALL refresh on the
dashboard's existing poll cadence so an expiring session surfaces without a manual
refresh.

#### Scenario: Sits beside the GitHub chip, horizontal only

- **WHEN** the dashboard renders with the Scoreboard and the GitHub-account widget present
- **THEN** the Claude-account widget appears on the same horizontal row, beside the
  GitHub-account widget, and adds no additional vertical height above the agent docks

#### Scenario: Collapsible with independent persisted state

- **WHEN** the user collapses or expands the Claude widget and later reloads the dashboard
- **THEN** the Claude widget restores its own collapsed/expanded state on the same
  device, independent of the GitHub widget's state

#### Scenario: Renders each probe state

- **WHEN** the probe reports claude-not-installed, installed-but-not-authenticated, or
  authenticated
- **THEN** the widget shows, respectively, a not-installed marker, a not-authenticated
  warning, and the account with a healthy indicator

#### Scenario: Surfaces an expiring session on poll

- **WHEN** the Claude subscription session becomes invalid while the dashboard is open
- **THEN** the widget reflects the not-authenticated state on its next poll without a
  manual page refresh

### Requirement: Advanced-mode by default

The Claude-account widget SHALL be registered in the UI-mode capability map as an
**Advanced**-mode feature, so it is hidden in Basic mode unless the End User is
explicitly determined to need it. The read-only nature of the probe SHALL be
preserved across both modes — it never mutates Claude authentication state and never
exposes the token.

#### Scenario: Hidden in Basic mode

- **WHEN** the device UI mode is Basic
- **THEN** the Claude-account widget is not shown

#### Scenario: Shown in Advanced mode

- **WHEN** the device UI mode is Advanced
- **THEN** the Claude-account widget is shown beside the GitHub-account widget
