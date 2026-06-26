# access-control

## ADDED Requirements

### Requirement: The Operator can set the access code from the desktop app

The system SHALL let the Operator set the harness access code from the WinForms desktop
application without supplying the current code, since the Operator at the host PC is already the
trusted authority for access control. Setting a new code SHALL hash it (PBKDF2) into the off-repo
auth store, SHALL enforce a minimum length, and SHALL revoke all active sessions so every client
re-authenticates with the new code. Changing the access code SHALL be possible ONLY from the
desktop app; the system SHALL NOT expose any web/phone endpoint that changes the access code (the
prior `POST /api/auth/password` change endpoint is removed).

#### Scenario: Operator sets a new access code

- **WHEN** the Operator enters a new access code (meeting the minimum length) in the desktop "Set access code" dialog
- **THEN** the code is hashed and persisted, all active sessions are revoked, and subsequent logins require the new code

#### Scenario: The access code cannot be changed over the web

- **WHEN** any web/phone request attempts to change the access code (e.g. `POST /api/auth/password`)
- **THEN** there is no endpoint that changes it — the code is changeable only from the desktop app

#### Scenario: A too-short code is rejected

- **WHEN** the Operator enters a new code shorter than the minimum length
- **THEN** the code is not changed and the dialog reports the validation error
