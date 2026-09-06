## ADDED Requirements

### Requirement: Per-machine Overview in the fleet describe

The peer describe and `GET /api/arch/fleet/status` SHALL carry, for each machine, an
`overview` object with the identity the harness's own Status strip shows: Claude account
(installed / authenticated / account / plan), GitHub account (installed / authenticated /
account / host), host info (time zone id + UTC offset) and always-admin state. The
overview MUST be cheap to compute and cached at the source so it does not slow the fleet
poll, and it MUST be produced without blocking the describe. A machine on a build that
predates the field sends no `overview`; the hub SHALL surface null (the UI shows "n/a"),
never an error. The hub's own machine uses its local values.

#### Scenario: Modern peer carries the overview

- **WHEN** the hub reads a peer's describe on a build that has this feature
- **THEN** the machine's `overview` carries its Claude/GitHub/host/admin values

#### Scenario: Old peer degrades to n/a

- **WHEN** the hub reads a peer's describe on a build that predates this feature
- **THEN** the machine's `overview` is null and the fleet view shows "n/a" per field, not
  an error

### Requirement: On-demand fleet scoreboard

The scoreboard/analytics for a fleet machine SHALL be fetched on demand via
`GET /api/arch/fleet/scoreboard?sourceId=&window=` — served locally for the hub's own
machine and relayed to a peer's `GET /api/arch/peer/scoreboard` otherwise — and SHALL NOT
be included in the periodic fleet poll. Relayed answers MAY be cached briefly. The
periodic fleet poll payload MUST NOT carry the analytics fold.

#### Scenario: Scoreboard loads only when requested

- **WHEN** the fleet poll runs
- **THEN** it does not compute or carry any machine's scoreboard/analytics payload

#### Scenario: Opening the Scoreboard tab fetches one machine

- **WHEN** the Scoreboard tab is opened for a machine
- **THEN** exactly one scoreboard request is made for that machine and window, served
  locally or relayed to that peer
