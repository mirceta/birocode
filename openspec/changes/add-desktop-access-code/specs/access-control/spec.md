# access-control

## ADDED Requirements

### Requirement: The Operator can set the access code from the desktop app

The system SHALL let the Operator set the harness access code from the WinForms desktop
application without supplying the current code, since the Operator at the host PC is already the
trusted authority for access control. Setting a new code SHALL hash it (PBKDF2) into the off-repo
auth store, SHALL enforce a minimum length, and SHALL revoke all active sessions so every client
re-authenticates with the new code. This no-current-code setter SHALL be available only from the
desktop app; no web/phone endpoint SHALL gain the ability to set the code without the current one.

#### Scenario: Operator sets a new access code

- **WHEN** the Operator enters a new access code (meeting the minimum length) in the desktop "Set access code" dialog
- **THEN** the code is hashed and persisted, all active sessions are revoked, and subsequent logins require the new code

#### Scenario: Web cannot set without the current code

- **WHEN** a request arrives from the web/phone UI attempting to change the access code
- **THEN** the current code is still required (the desktop no-current-code setter is not exposed over the web)

#### Scenario: A too-short code is rejected

- **WHEN** the Operator enters a new code shorter than the minimum length
- **THEN** the code is not changed and the dialog reports the validation error
