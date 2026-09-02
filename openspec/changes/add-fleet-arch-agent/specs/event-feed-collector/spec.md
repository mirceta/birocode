## ADDED Requirements

### Requirement: Per-source send permission lent to the fleet client
Each remote source SHALL carry a persisted **allow sends** flag (default off),
settable and readable through the collector's source-management endpoints and shown
in the events app. The collector SHALL let the harness's fleet client build an
authenticated request toward a source (address plus the stored credential) but
SHALL NOT itself issue anything but `GET` requests to a source's feed; the
credential SHALL still never be returned or logged.

#### Scenario: Sends stay off by default
- **WHEN** a source is registered without touching the flag
- **THEN** `allowSends` is false and the fleet client refuses to send to it

#### Scenario: The collector is unchanged by the flag
- **WHEN** allow sends is on for a source
- **THEN** the collector's own polling still issues only feed `GET`s; only the fleet client uses the permission
