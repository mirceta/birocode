# agentic-call-audit Specification

## Purpose
TBD - created by archiving change add-agent-audit-trail. Update Purpose after archive.
## Requirements
### Requirement: Every agentic feature call is recorded

The system SHALL record every actual invocation of a registered agentic feature —
currently **discover-local-apps** and **ask-for-understanding** — as audit entries
capturing the UTC timestamp, feature id, repo id and name, actor, source IP, and a
correlation id for the call. An entry SHALL be written when the job actually starts and
another when it reaches a terminal state (`done`, `error`, or `canceled`) with the
duration and, for errors, a short error summary. Joining an already-running job SHALL
NOT be recorded as a new call.

#### Scenario: Discovery run recorded start to finish

- **WHEN** a user triggers "Discover local apps" on a repo and the scan completes
- **THEN** the audit contains a `started` entry (timestamp, feature `discover-local-apps`, repo, actor, IP) and a matching `done` entry with the run's duration

#### Scenario: Failed understanding run recorded with error

- **WHEN** an "Ask for understanding" run ends in an error
- **THEN** the audit contains the `started` entry and a terminal `error` entry with a short error summary

#### Scenario: Joining an in-flight job adds no entry

- **WHEN** a second client calls the discover endpoint while that repo's discovery job is already running
- **THEN** no new audit entry is appended for the join

### Requirement: Calls are attributed to the best-available actor

The system SHALL attribute each recorded call to the best-available actor identity using
the same resolution as the action audit: the trusted-device name, else the approved-IP
guest name, else `unknown@<ip>` — with the source IP always recorded.

#### Scenario: Call from a named device

- **WHEN** a request bearing a trusted-device cookie named "Girlfriend's phone" triggers an agentic feature
- **THEN** the audit entry records that device name as the actor along with the source IP

#### Scenario: Call with no resolvable identity

- **WHEN** an agentic feature is triggered by a request with no resolvable named identity
- **THEN** the entry is still recorded with an `unknown@<ip>` actor rather than dropped

### Requirement: The agentic-call store is durable, append-only, and metadata-only

The system SHALL persist agentic-call audit entries append-only under the app data
directory so they survive restarts. Entries SHALL contain invocation metadata only —
never prompt text, tool calls, or agent output. No web/phone endpoint SHALL mutate or
clear the store.

#### Scenario: Entries survive a restart

- **WHEN** agentic calls are recorded, the harness restarts, and further calls are recorded
- **THEN** all entries, pre- and post-restart, are readable in order and none were rewritten or truncated

#### Scenario: No mutation from the web

- **WHEN** any web/phone request attempts to modify or delete agentic-call audit data
- **THEN** no such operation exists and the store is unchanged

### Requirement: A read-only audit trail view in the web UI

The system SHALL present the agentic-call trail in the web UI as a read-only list of
calls, newest first, each showing feature, repo, actor, start time, and outcome —
merging each call's start and terminal entries by correlation id. The view SHALL be
filterable by feature, repo, and outcome, and SHALL offer no edit or delete control. A
call whose job is still running SHALL show as running; a `started` entry with no
terminal entry and no live job SHALL show as interrupted, not as running.

#### Scenario: Reviewing the trail

- **WHEN** the user opens the agentic-call audit trail after several runs across repos
- **THEN** the calls are listed newest-first with feature, repo, actor, start time, and outcome, and can be filtered by feature, repo, and outcome

#### Scenario: In-flight call shown as running

- **WHEN** the trail is viewed while a discovery job is mid-run
- **THEN** that call appears with a running status and gains its outcome once the job ends

#### Scenario: Orphaned start shown as interrupted

- **WHEN** the harness restarted between a call's start and its completion
- **THEN** the trail shows that call as interrupted, not perpetually running

### Requirement: The trail view is Advanced-mode gated

The system SHALL expose the agentic-call audit trail view only in Advanced mode, behind
a dedicated capability gate, so Basic (Simple) mode does not show it.

#### Scenario: Hidden in Basic mode

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** the audit trail view and its entry point are not shown

#### Scenario: Available in Advanced mode

- **WHEN** the web UI is in Advanced mode
- **THEN** the audit trail view is reachable and renders the trail

