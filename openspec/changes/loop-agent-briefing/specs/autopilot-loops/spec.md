# autopilot-loops — delta for loop-agent-briefing

## ADDED Requirements

### Requirement: Every driven send carries the situational briefing

The engine SHALL prepend a fixed situational briefing to every drive-mode
loop send — queue item, queue step-verification, goal work, goal
verification, and recipe sends alike. The briefing SHALL state that the
agent is being driven by an autopilot loop with no human reading replies in
real time, that it must act on the prompt rather than answer with a plan or
a counter-question, that it should answer its own clarifying questions and
follow its own advice when confident, that it should apply sensible defaults
to open questions, and that `NEEDS_HUMAN:` is reserved for decisions only
the human can make. Work-phase briefings SHALL include the kind-appropriate
marker line (the loop's configured sentinel for recipe and goal work sends;
the no-marker-needed note for queue items); verification-phase briefings
SHALL contribute only the situational core, leaving the marker instruction
to the verification template. Suggest-mode pending prompts SHALL NOT be
briefed.

#### Scenario: Queue item is sent briefed

- **WHEN** an armed drive-mode queue loop unloads a stash item
- **THEN** the text sent to the agent is the briefing composition followed by the item's stored text, and the briefing names the autopilot situation and the act-don't-ask posture

#### Scenario: Recipe send uses the loop's own sentinel

- **WHEN** a recipe loop with a custom sentinel phrase sends its stored prompt
- **THEN** the briefing's marker line cites that custom sentinel, not the default

#### Scenario: Verification send is briefed without a second marker line

- **WHEN** a queue loop sends the step-verification prompt
- **THEN** the sent text carries the situational briefing core and exactly one marker instruction — the verification template's own

#### Scenario: Suggest mode pre-fills raw text

- **WHEN** a suggest-mode loop records a pending prompt for the composer
- **THEN** the pending text is the stored text with no briefing attached

### Requirement: Briefed sends stay honestly disclosed without per-send noise

The system SHALL record the raw stored text (not the briefed composition)
in the audit log, the queue sent-history, and the synthetic user event, and
SHALL mark each such record as sent-with-briefing. The briefing template
SHALL be disclosed at the gated loop detail and arm preview surfaces, so
that the exact sent text is deterministically reconstructable from
operator-inspectable parts. The chat surface SHALL distinguish a briefed
loop send from a human-typed message.

#### Scenario: Sent-history shows the operator's text

- **WHEN** the operator opens the queue sent-history after two briefed sends
- **THEN** each entry shows the raw item text marked as briefed, not two copies of the briefing prefix

#### Scenario: Arm preview reveals the exact composition

- **WHEN** the operator opens the arm preview with the gate open
- **THEN** the briefing template is shown so the operator can read exactly what any queued item will be wrapped with before arming

#### Scenario: Chat bubble marks the briefing

- **WHEN** a briefed loop send renders in the agent's chat
- **THEN** the bubble shows the stored text with an affordance indicating it was sent with the autopilot briefing

### Requirement: An unaccomplished step still escalates under the briefing

The act-don't-ask briefing SHALL NOT weaken step or goal verification: a
verification reply that does not honestly confirm the work SHALL stop the
loop exactly as before the briefing existed.

#### Scenario: Briefed agent that skipped the work is still caught

- **WHEN** a briefed queue step lands but the verification reply states the request was not accomplished
- **THEN** the loop stops as escalate · step-unverified, unchanged by this feature
