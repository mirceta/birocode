# Claude in Chrome

## ADDED Requirements

### Requirement: Browser-enabled spawn contract

The system SHALL add the `--chrome` flag to the Claude CLI spawn when and only when
the chat turn requests browser mode on the builder lane, leaving every other spawn
argument unchanged.

#### Scenario: Browser turn spawn

- **WHEN** a builder-lane chat turn is submitted with browser mode on
- **THEN** the spawned CLI command includes `--chrome` and the run streams like any other turn

#### Scenario: Ask lane never gets the browser

- **WHEN** a chat turn on the read-only ask lane requests browser mode
- **THEN** the Harness ignores the flag and spawns the turn without `--chrome`

### Requirement: Global browser serialization

The system SHALL allow at most one browser-enabled run at a time across all repos and
lanes, rejecting a conflicting request immediately with a message naming the current
holder.

#### Scenario: Second browser turn rejected

- **WHEN** a browser-enabled run is active for one repo and a browser-enabled turn is submitted for any repo
- **THEN** the request is rejected with HTTP 409 and an error naming the repo whose run holds the browser

#### Scenario: Gate released after the run

- **WHEN** a browser-enabled run finishes (success, error, or stop)
- **THEN** a subsequent browser-enabled turn is accepted

### Requirement: Browser integration status

The system SHALL report whether the browser integration looks usable on the host —
native-messaging host registered and CLI `--chrome` support — and whether a
browser-enabled run currently holds the pipe, so the UI never fails silently.

#### Scenario: Status while available

- **WHEN** the status endpoint is queried on a host with the Claude Chrome native host registered and a CLI that supports `--chrome`
- **THEN** it reports available with no busy holder

#### Scenario: Status explains unavailability

- **WHEN** the native-messaging host is not registered on the host machine
- **THEN** the status reports unavailable with the missing precondition identified
