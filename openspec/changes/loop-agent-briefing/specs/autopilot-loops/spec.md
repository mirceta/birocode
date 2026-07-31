# autopilot-loops — delta for loop-agent-briefing

## ADDED Requirements

### Requirement: Every driven send carries the situational briefing

The engine SHALL prepend a situational briefing to every drive-mode
loop send — queue item, queue step-verification, goal work, goal
verification, and recipe sends alike — composed at send time from a fixed
frame and the enabled entries of the operator-editable briefing rules list.
The briefing SHALL state that the
agent is being driven by an autopilot loop with no human reading replies in
real time, that it must act on the prompt rather than answer with a plan or
a counter-question, that it should answer its own clarifying questions and
follow its own advice when confident, that it should apply sensible defaults
to open questions, and that `NEEDS_HUMAN:` is reserved for decisions only
the human can make. Work-phase briefings SHALL include the kind-appropriate
marker line (the loop's configured sentinel for recipe and goal work sends;
the no-marker-needed note for queue items); verification-phase briefings
SHALL carry only a short honesty-first situational note — no act-don't-ask
posture — leaving the marker instruction to the verification template. Suggest-mode pending prompts SHALL NOT be
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

### Requirement: The briefing rules are an operator-editable stored list

The behavioral rules of the work-phase briefing SHALL live in a stored,
global, revisioned list — seeded with the draft rules, editable without a
deploy — while the situational frame, the `NEEDS_HUMAN:` and sentinel marker
lines, and the verify-phase honesty note SHALL remain fixed in code. Each
rule SHALL be individually enable/disable-able; disabled rules SHALL be
retained but never composed into a send. Every save SHALL produce a new
monotonic revision with the prior state retained, and every briefed send
SHALL record the revision it composed with. The rules SHALL compose into
work-phase sends only, never into verification sends. A **Briefing** section
beside the loop section on each agent dock card SHALL show the rules and
accept a new one at any time, and SHALL disclose that the list is global.

#### Scenario: A new rule reaches the very next send

- **WHEN** the operator adds an enabled rule from the dock Briefing section and the armed queue loop then sends its next item
- **THEN** that send's briefing contains the new rule as a bullet line

#### Scenario: A parked idea is remembered but not sent

- **WHEN** the operator adds a rule and disables it
- **THEN** the rule stays listed in the Briefing section and subsequent briefed sends do not contain it

#### Scenario: Rules never touch a verification turn

- **WHEN** a queue step-verification prompt is sent while the rules list has enabled entries
- **THEN** the sent text carries only the fixed verify-phase note and the verification template — no rule lines

#### Scenario: An emptied list still briefs the situation

- **WHEN** every rule is disabled or deleted and a driven work send fires
- **THEN** the sent briefing still states the autopilot situation, the `NEEDS_HUMAN:` escalation line, and the contract line

#### Scenario: A recorded send survives later edits

- **WHEN** the operator edits the rules after a briefed send was recorded
- **THEN** the recorded send's rules revision still resolves to the rules text it was actually composed with

### Requirement: Briefed sends stay honestly disclosed without per-send noise

The system SHALL record the raw stored text (not the briefed composition)
in the audit log, the queue sent-history, and the synthetic user event, and
SHALL mark each such record as sent-with-briefing together with the briefing
rules revision used. The current briefing composition (fixed frame plus
enabled rules) SHALL be disclosed at the dock Briefing section, the gated
loop detail, and the arm preview surfaces, so that the exact sent text is
deterministically reconstructable from operator-inspectable parts. The chat
surface SHALL distinguish a briefed loop send from a human-typed message.

#### Scenario: Sent-history shows the operator's text

- **WHEN** the operator opens the queue sent-history after two briefed sends
- **THEN** each entry shows the raw item text marked as briefed, not two copies of the briefing prefix

#### Scenario: Arm preview reveals the exact composition

- **WHEN** the operator opens the arm preview with the gate open
- **THEN** the current briefing composition (frame + enabled rules) is shown so the operator can read exactly what any queued item will be wrapped with before arming

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
