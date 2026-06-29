# GitHub account status

## ADDED Requirements

### Requirement: Probe the current global GitHub account

The system SHALL provide a read-only endpoint `GET /api/github-account` that
reports the box's **current global GitHub identity** by invoking the `gh` CLI, and
SHALL return a typed status `{ ghInstalled, authenticated, account?, host?, error? }`
with HTTP `200` in every case. The probe SHALL NOT log in, log out, or switch
accounts. It SHALL distinguish three states: `gh` not installed / not on PATH; `gh`
installed but not authenticated or upstream unreachable; and authenticated, in which
case `account` (the login) and `host` (e.g. `github.com`) SHALL be populated. The
probe SHALL be bounded by a short timeout so a missing `gh` or a hung network call
resolves to a status rather than hanging or throwing.

#### Scenario: gh not installed

- **WHEN** `gh` is not on PATH and a client requests `GET /api/github-account`
- **THEN** the response is `200` with `ghInstalled: false`, `authenticated: false`,
  and `account`/`host` null

#### Scenario: Installed but not authenticated or unreachable

- **WHEN** `gh` is installed but no account is logged in, or upstream cannot be
  reached within the timeout
- **THEN** the response is `200` with `ghInstalled: true`, `authenticated: false`, a
  short `error` reason, and `account`/`host` null

#### Scenario: Authenticated account reported

- **WHEN** `gh` is installed and authenticated to GitHub
- **THEN** the response is `200` with `ghInstalled: true`, `authenticated: true`,
  `account` set to the authenticated login, and `host` set to the active host

#### Scenario: A client disconnect does not cancel the probe

- **WHEN** a client aborts the request (e.g. the dashboard page is refreshed) while a
  probe is in flight
- **THEN** the probe is not cancelled by the disconnect and the next request resolves
  a valid status

### Requirement: Dashboard renders the account status beside the Scoreboard

The dashboard SHALL render a GitHub-account widget on the **same horizontal row** as
the Scoreboard rather than stacked below it, so it consumes horizontal space only and
adds no vertical height; on a viewport too narrow for both, the widget SHALL wrap
rather than clip. The widget SHALL be **collapsible**, and its collapsed/expanded
state SHALL persist per device. Collapsed, it SHALL show a single compact indicator
(a status dot plus the account handle, or a not-installed marker); expanded, it SHALL
show the `gh`-installed and authenticated state, the account name, and the host. The
widget SHALL render the three probe states distinctly and SHALL refresh on the
dashboard's existing poll cadence so an expiring login surfaces without a manual
refresh.

#### Scenario: Sits beside the Scoreboard, horizontal only

- **WHEN** the dashboard renders with the Scoreboard present
- **THEN** the GitHub-account widget appears on the same horizontal row as the
  Scoreboard and adds no additional vertical height above the agent docks

#### Scenario: Collapsible with persisted state

- **WHEN** the user collapses or expands the widget and later reloads the dashboard
- **THEN** the widget restores the same collapsed/expanded state on the same device

#### Scenario: Renders each probe state

- **WHEN** the probe reports gh-not-installed, installed-but-not-authenticated, or
  authenticated
- **THEN** the widget shows, respectively, a not-installed marker, a not-authenticated
  warning, and the account handle with a healthy indicator

#### Scenario: Surfaces an expiring login on poll

- **WHEN** the account becomes unauthenticated while the dashboard is open
- **THEN** the widget reflects the not-authenticated state on its next poll without a
  manual page refresh

### Requirement: Advanced-mode by default

The GitHub-account widget SHALL be registered in the UI-mode capability map as an
**Advanced**-mode feature, so it is hidden in Basic mode unless the End User is
explicitly determined to need it. The read-only nature of the probe SHALL be
preserved across both modes — it never mutates GitHub authentication state.

#### Scenario: Hidden in Basic mode

- **WHEN** the device UI mode is Basic
- **THEN** the GitHub-account widget is not shown

#### Scenario: Shown in Advanced mode

- **WHEN** the device UI mode is Advanced
- **THEN** the GitHub-account widget is shown beside the Scoreboard
