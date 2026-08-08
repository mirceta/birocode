## MODIFIED Requirements

### Requirement: Briefed sends stay honestly disclosed without per-send noise

The system SHALL record the raw stored text (not the briefed composition)
in the audit log, the queue sent-history, and the loop state snippets, and
SHALL mark each such record as sent-with-briefing together with the briefing
rules revision used. The synthetic user event and the chat surface SHALL
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
