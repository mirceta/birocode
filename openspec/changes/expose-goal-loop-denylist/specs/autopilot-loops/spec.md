# autopilot-loops

## MODIFIED Requirements

### Requirement: The effective deny-list is adjustable per arm

Arming a driven loop SHALL allow the operator to trim or disable deny terms
for that arm; the instance stores its effective list, the engine enforces it
for that instance only, and the global default list is unchanged for every
other arm. An instance without a per-arm list uses the global default. The
per-arm list SHALL be disclosed with the loop's gated detail. Because the
deny-list applies to **every driven loop kind**, the dock's loop controls
SHALL present the deny-term controls **once, kind-independently, at the top
of the expanded loop section** — not inside any single kind's arm section —
and the trim made there SHALL apply to whichever driven kind (queue, goal,
or recipe) the operator then arms. While a loop is armed, the same shared
spot SHALL show that instance's effective deny-list under the existing gate.
Suggestion-mode arms are unaffected and keep the global default.

#### Scenario: Commit-and-push repo drives past item one

- **WHEN** a queue loop is armed with "push" removed from its per-arm deny-list and a step reply honestly reports a push
- **THEN** the step proceeds to verification instead of deny-escalating

#### Scenario: Default fence untouched elsewhere

- **WHEN** another loop is armed later without touching the deny controls
- **THEN** its effective deny-list is the unmodified global default

#### Scenario: Deny controls appear once, above the kind sections

- **WHEN** the operator expands a dock's loop section while the global deny-list has terms
- **THEN** the per-arm deny-term controls appear a single time at the top of the section, before and independent of the kind-specific arm sections, and no kind section contains its own copy

#### Scenario: One trim applies to whichever kind is armed

- **WHEN** the operator drops a term in the shared deny controls and then arms a goal (or recipe, or queue) loop
- **THEN** the armed instance stores the trimmed effective list and the engine judges its replies with that list

#### Scenario: Goal loop drives past a trimmed term

- **WHEN** a goal loop is armed with "push" removed from its per-arm deny-list and a work reply honestly reports a push
- **THEN** the reply is not deny-escalated for that term, while other arms keep the global default

#### Scenario: Armed instance discloses its effective list in the shared spot

- **WHEN** any driven loop armed with a trimmed deny-list is inspected in the dock's expanded loop section
- **THEN** the shared deny spot shows that instance's effective list under the existing prompt-detail gate, and an untouched arm shows it follows the global default

## ADDED Requirements

### Requirement: Per-arm opt-in appends footer clauses to driven work sends

The shared block at the top of the dock's expanded loop section SHALL offer an
**include-footer-clauses** checkbox, default **off**, stored on the armed instance
like the per-arm deny-list. When the armed instance has it on, every **work-phase**
driven send (queue item, goal work send, recipe send) SHALL have the footer-clauses
store's currently **active** clauses appended after the stored prompt as a clearly
delimited footer — the clause set read live at send time, matching composer-send
semantics. Verification sends SHALL never carry footer clauses, and an instance with
the option off (or with no active clauses) SHALL send exactly as today. Suggestion-mode
pends SHALL NOT be affected.

#### Scenario: Opted-in goal send carries the active clauses

- **WHEN** a goal loop armed with include-footer-clauses on sends a work prompt while two clauses are active
- **THEN** the sent text is the briefed prompt followed by a delimited footer containing both clauses, in list order

#### Scenario: Clause toggles apply mid-loop

- **WHEN** the operator deactivates a clause while an opted-in loop is armed
- **THEN** the next work send omits that clause without re-arming

#### Scenario: Default off preserves today's sends

- **WHEN** a loop is armed without touching the checkbox
- **THEN** its driven sends carry no footer clauses, byte-for-byte as before this change

#### Scenario: Verification turns stay clause-free

- **WHEN** an opted-in loop sends a verification prompt while clauses are active
- **THEN** the verification send carries no footer clauses
