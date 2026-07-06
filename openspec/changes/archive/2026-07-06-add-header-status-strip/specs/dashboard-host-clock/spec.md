# dashboard-host-clock Delta

## MODIFIED Requirements

### Requirement: Dashboard host clock display

The header status strip SHALL display the host computer's wall-clock time,
alongside the Scoreboard and the account chips (the clock moves out of the
dashboard's Scoreboard row, which no longer exists). The displayed time MUST
be the host's local time — computed from the probe's instant and UTC offset —
and MUST NOT be formatted in the viewing device's timezone. The display SHALL
include the host's UTC offset so the reading is unambiguous.

#### Scenario: Viewer in a different timezone

- **WHEN** the strip is expanded on a device whose timezone differs from the
  host's
- **THEN** the clock shows the host's wall time (with its UTC offset), not the
  device's local time

### Requirement: Live ticking with periodic resync

While the header status strip is expanded, the clock SHALL tick at one-second
resolution using a locally computed skew from the last successful probe, and
SHALL resync against `GET /api/host-time` on the strip's polling cadence
rather than polling every second.

#### Scenario: Clock advances between polls

- **WHEN** the strip stays expanded between two probe polls
- **THEN** the displayed time keeps advancing every second without additional
  API requests

#### Scenario: Offset change is picked up

- **WHEN** the host's UTC offset changes (e.g. a DST transition) after the
  clock was first synced
- **THEN** a subsequent resync updates the displayed wall time and offset to
  the new values

### Requirement: Advanced-mode gating

The host clock SHALL be registered in the UI-mode capability map as an
Advanced-mode feature, so Basic mode is unchanged (in Basic mode the whole
header status strip is absent anyway).

#### Scenario: Basic mode unchanged

- **WHEN** a device is in Basic (Simple) UI mode
- **THEN** no host clock renders anywhere

#### Scenario: Advanced mode shows the clock

- **WHEN** a device is in Advanced UI mode and the strip is expanded
- **THEN** the strip includes the host clock
