# dashboard-host-clock Specification

## Purpose
TBD - created by archiving change add-dashboard-host-clock. Update Purpose after archive.
## Requirements
### Requirement: Host time probe
The harness SHALL expose a read-only endpoint `GET /api/host-time` that reports
the host computer's current local time read directly from the Windows clock of
the harness process, returning the instant (`unixMs`, `iso`), the Windows
timezone id (`timeZoneId`), and the current UTC offset in minutes
(`utcOffsetMinutes`). The endpoint MUST always return HTTP 200 with typed
fields and MUST NOT derive the time from anything the client sent.

#### Scenario: Reading the host clock
- **WHEN** a client requests `GET /api/host-time`
- **THEN** the response contains the host's current local time and timezone as
  read from Windows at request time, with the UTC offset that is in effect at
  that moment (DST included)

### Requirement: Dashboard host clock display
The dashboard SHALL display the host computer's wall-clock time on the
Scoreboard row, alongside the Scoreboard and the account chips. The displayed
time MUST be the host's local time — computed from the probe's instant and UTC
offset — and MUST NOT be formatted in the viewing device's timezone. The
display SHALL include the host's UTC offset so the reading is unambiguous.

#### Scenario: Viewer in a different timezone
- **WHEN** the dashboard is viewed from a device whose timezone differs from
  the host's
- **THEN** the clock shows the host's wall time (with its UTC offset), not the
  device's local time

### Requirement: Live ticking with periodic resync
While the dashboard is open, the clock SHALL tick at one-second resolution
using a locally computed skew from the last successful probe, and SHALL resync
against `GET /api/host-time` on the Scoreboard row's polling cadence rather
than polling every second.

#### Scenario: Clock advances between polls
- **WHEN** the dashboard stays open between two probe polls
- **THEN** the displayed time keeps advancing every second without additional
  API requests

#### Scenario: Offset change is picked up
- **WHEN** the host's UTC offset changes (e.g. a DST transition) after the
  clock was first synced
- **THEN** a subsequent resync updates the displayed wall time and offset to
  the new values

### Requirement: Visible staleness
If resyncing fails repeatedly, the clock SHALL keep ticking from the last
successful sync and SHALL show a visible stale indicator rather than silently
presenting a possibly-wrong time; the indicator SHALL clear on the next
successful resync.

#### Scenario: Harness stops answering
- **WHEN** several consecutive resync attempts fail
- **THEN** the clock remains visible, still ticking from the last good sync,
  with a visible stale marker

#### Scenario: Recovery
- **WHEN** a resync succeeds after a stale period
- **THEN** the stale marker is removed and the clock reflects the fresh probe

### Requirement: Advanced-mode gating
The host clock SHALL be registered in the UI-mode capability map as an
Advanced-mode feature, so Basic mode's dashboard is unchanged.

#### Scenario: Basic mode unchanged
- **WHEN** a device is in Basic (Simple) UI mode
- **THEN** the Scoreboard row renders without the host clock

#### Scenario: Advanced mode shows the clock
- **WHEN** a device is in Advanced UI mode
- **THEN** the Scoreboard row includes the host clock

