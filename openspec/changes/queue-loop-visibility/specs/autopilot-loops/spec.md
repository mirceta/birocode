# autopilot-loops — delta for queue-loop-visibility

## ADDED Requirements

### Requirement: Queue arming surfaces preview the full unload order

Every surface that arms a queue loop SHALL show, before arming, the complete
ordered list of the bound tab's stash items — this covers the dock's unified
loop control and the autopilot console's Queue tab — numbered top-down in the order the queue
will unload them — not merely the head item and a count. The preview SHALL
reflect the live stash: reordering or editing the stash while the arm surface
is open updates the preview.

#### Scenario: Dock arm popover lists every queued item in order

- **WHEN** the operator opens the queue section of an agent's loop control while the tab's stash holds ["A", "B", "C"]
- **THEN** the popover lists A, B, C numbered 1–3 as the unload order, and arming is offered against exactly that list

#### Scenario: Reordering the strip updates the open preview

- **WHEN** the operator moves item C above item B in the stash strip while the arm preview is open
- **THEN** the preview shows A, C, B on its next refresh

### Requirement: A queue loop records a bounded, gated history of sent steps

The system SHALL append each landed queue-loop step's text (drive send
completed, or suggest pend consumed) to a bounded sent-history on the loop
record (newest last; oldest dropped beyond the bound), persisted with the
record and reset when a queue loop is armed. The sent-history SHALL be
disclosed only while the operator gate is open — via the gated loop detail and
the debug bundle (redacted while closed) — and SHALL NOT appear in the ungated
status projection. The dock loop control's queue inspection and the console's
Queue tab SHALL render the history as sent rows, labeled as partial when the
bound has dropped older items.

#### Scenario: Landed steps appear in the gated sent-history in order

- **WHEN** a drive-mode queue loop has sent "A" and then "B", both landed, and the operator gate is open
- **THEN** the gated loop detail lists the sent-history ["A", "B"], and the dock inspection and console Queue tab render A and B as sent rows in that order

#### Scenario: Gate closed hides the sent texts

- **WHEN** the operator gate is closed and a client reads loop detail or the debug bundle for a queue loop with sent steps
- **THEN** no sent-history text is disclosed (the debug bundle carries the redaction marker), while the ungated sent/remaining counts remain readable

#### Scenario: Re-arming starts a fresh history

- **WHEN** a queue loop that previously sent steps is armed again on the same tab
- **THEN** the sent-history starts empty for the new arm, and the previous run's sends remain available in the audit trail
