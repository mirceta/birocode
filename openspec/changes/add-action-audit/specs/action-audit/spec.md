# action-audit

## ADDED Requirements

### Requirement: Every gate-passed action is attributed to an identity

The system SHALL record an audit entry for each logged action taken by a request that has cleared
both the IP/cookie gate and the password gate, and SHALL attribute it to the best-available actor
identity — the trusted-device name, else the approved-IP guest name, with the session id and source
IP always recorded. When no named identity is available the entry SHALL still be recorded with an
`unknown@<ip>` actor rather than dropped.

#### Scenario: Action attributed to a named device

- **WHEN** a request bearing a trusted-device cookie named "Girlfriend's phone" performs a logged action
- **THEN** the audit entry records that device name plus the session id and source IP

#### Scenario: Unnamed actor still recorded

- **WHEN** a logged action occurs with no resolvable named identity
- **THEN** the entry is still written with an `unknown@<ip>` actor, not omitted

### Requirement: Prompts, mutating tool actions, and auth events are captured

The system SHALL capture three kinds of event: each chat prompt submitted (actor, project, lane,
text); each mutating tool action the agent runs within a turn (file edit, shell command, or network
call, with the tool name and its salient arguments); and auth events (login, device mint, device or
guest revocation, IP approval). Pure read/search tool actions SHALL NOT be logged by default, and the
system SHALL make read-logging and prompt-text capture configurable.

#### Scenario: A mutating action is logged

- **WHEN** an agent turn edits a repo file and runs a shell command
- **THEN** the audit records a tool entry for the edit and one for the shell command, each attributed to the actor and project

#### Scenario: Reads are not logged by default

- **WHEN** an agent turn only reads and searches files
- **THEN** no tool entries are recorded for those reads unless read-logging is enabled in config

### Requirement: The audit store is append-only and durable

The system SHALL persist audit entries to an append-only, daily-rotated store under the app data
directory, one entry per line, that survives restarts. The store SHALL NOT be mutated or cleared
through any web/phone endpoint, and the only deletion the system performs SHALL be whole-file pruning
of files older than the configured retention.

#### Scenario: Entries persist append-only across a restart

- **WHEN** actions are audited, the harness restarts, and more actions are audited
- **THEN** all entries are present in the daily files in order, and nothing rewrote or truncated earlier entries

#### Scenario: Retention prunes by age only

- **WHEN** a daily audit file is older than the configured retention
- **THEN** that whole file is removed and newer files are untouched

### Requirement: The Operator has a read-only activity surface

The system SHALL present the audit trail to the Operator in the desktop application as a read-only,
filterable view (by user, date, project, and kind), and SHALL NOT expose any control to edit or
delete entries. The web/phone UI SHALL NOT surface the audit trail in this version.

#### Scenario: Operator reviews activity by user

- **WHEN** the Operator opens the desktop Activity view and filters by a device name
- **THEN** that user's recorded prompts, tool actions, and auth events are listed read-only, with no edit or delete control

#### Scenario: Web cannot read the audit

- **WHEN** a request from the web/phone UI attempts to retrieve the audit trail
- **THEN** no audit data is returned (the trail is desktop-only in this version)
