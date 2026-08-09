## MODIFIED Requirements

### Requirement: Briefed sends stay honestly disclosed without per-send noise

The system SHALL keep the raw stored text as the display text of every
truncated list projection — the audit log's dashboard and console slices, the
queue sent-history, and the loop state snippets — and SHALL mark each such
record as sent-with-briefing together with the briefing rules revision used. The synthetic user event and the chat surface SHALL
carry the exact composed text handed to the CLI — briefing frame, enabled
rules, footer clauses, contract line, and stored text — so the live chat and
the transcript reload render the same verbatim record of what the agent was
told, with no affordance standing in for hidden text. The current briefing
composition (fixed frame plus enabled rules) SHALL remain disclosed at the
dock Briefing section, the gated loop detail, and the arm preview surfaces,
so that the exact sent text of any recorded send is deterministically
reconstructable from operator-inspectable parts.

#### Scenario: Sent-history shows the operator's text

- **WHEN** the operator opens the queue sent-history after two briefed sends
- **THEN** each entry shows the raw item text marked as briefed, not two copies of the briefing prefix

#### Scenario: Arm preview reveals the exact composition

- **WHEN** the operator opens the arm preview with the gate open
- **THEN** the current briefing composition (frame + enabled rules) is shown so the operator can read exactly what any queued item will be wrapped with before arming

#### Scenario: Chat shows exactly what was sent

- **WHEN** a driven queue loop unloads a stash item and the send fires
- **THEN** the chat's user bubble contains the full composed text the CLI received — briefing, rules, contract line, separator, and the item — byte-identical to the sent prompt, with no "briefing attached" affordance

#### Scenario: Live bubble matches the transcript reload

- **WHEN** the operator watches a driven send land live and later reloads the same conversation from the transcript
- **THEN** both renderings of that user turn show the same full composed text

## ADDED Requirements

### Requirement: Queue loop sends are durably auditable with the exact sent text

Every driven send's durable audit entry SHALL carry the loop kind and the
phase (work or verification) it was sent in, and — when the sent text differs
from the raw stored text — the exact composed text handed to the CLI. The
system SHALL offer an operator-gated Queue audit view on the dock loop card
listing the repo's queue-kind sends from the durable ledger, newest first,
surviving re-arms (unlike the per-arm sent-history), with each row expandable
to the exact sent text. Audit entries recorded before this capability SHALL
load unchanged and SHALL be excluded from the queue-filtered view rather than
misattributed.

#### Scenario: A queue send is attributed in the ledger

- **WHEN** an armed drive-mode queue loop sends a stash item and then its step-verification prompt
- **THEN** the ledger gains two entries attributed to the queue kind — one work-phase with the item's raw text, one verify-phase — each carrying the exact composed text that was sent

#### Scenario: The Queue audit survives a re-arm

- **WHEN** the operator disarms and re-arms the queue loop after several sends and opens the Queue audit view with the gate open
- **THEN** the sends from before the re-arm are still listed, even though the per-arm sent-history has reset

#### Scenario: Exact text is disclosed only behind the gate

- **WHEN** the operator gate is closed and a client requests the Queue audit view
- **THEN** the request is refused like other prompt disclosures, while the ungated audit slices keep showing only the raw stored text

#### Scenario: Pre-amendment entries stay honest

- **WHEN** the Queue audit view renders over a ledger containing entries recorded before kind attribution existed
- **THEN** those entries do not appear in the queue-filtered list, and the raw ledger remains the place to read them
